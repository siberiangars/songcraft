import prisma from "@/lib/prisma";
import { BOT_TOKEN } from "./config";
import { logger } from "./logger";

// Stars/Ruble invoice helpers removed — payment is SBP via YooKassa only.

export async function refundOrder(orderId: number) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  });

  if (!order) {
    logger.warn("Cannot refund - order not found", { orderId });
    return;
  }

  const refundExternalId = `refund:order:${orderId}`;
  const existingRefund = await prisma.transaction.findUnique({
    where: { externalId: refundExternalId },
  });
  if (existingRefund) {
    if (order.status !== "REFUNDED") {
      await prisma.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
    }
    logger.info("Refund already processed", { orderId });
    return;
  }

  const charge = await prisma.transaction.findFirst({
    where: { orderId, type: "PAYMENT" },
    orderBy: { id: "asc" },
  });
  if (!charge) {
    logger.error("Refund blocked: no successful charge for order", { orderId });
    return;
  }

  logger.info("Processing refund", {
    orderId,
    paymentSource: order.paymentSource,
    paymentId: order.paymentId ?? null,
  });

  if (order.paymentSource === "balance") {
    try {
      await prisma.$transaction(async (tx) => {
        const duplicate = await tx.transaction.findUnique({ where: { externalId: refundExternalId } });
        if (duplicate) return;

        const user = await tx.tgUser.findUniqueOrThrow({ where: { id: order.userId } });
        await tx.tgUser.update({
          where: { id: order.userId },
          data: {
            balance: { increment: charge.amount },
            totalSpent: Math.max(0, user.totalSpent - charge.amount),
          },
        });
        await tx.transaction.create({
          data: {
            externalId: refundExternalId,
            userId: order.userId,
            type: "REFUND",
            amount: charge.amount,
            description: `Balance refund for order #${orderId}`,
            orderId,
            metadata: "source:balance",
          },
        });
        await tx.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
    return;
  }

  if (order.paymentSource === "telegram_stars" && order.paymentId) {
    const locked = await prisma.order.updateMany({
      where: { id: orderId, status: { notIn: ["REFUNDING", "REFUNDED"] } },
      data: { status: "REFUNDING" },
    });
    if (locked.count !== 1) return;

    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/refundStarPayment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: Number(order.user.telegramId),
          telegram_payment_charge_id: order.paymentId,
        }),
      });
      const responseBody = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (!response.ok || !responseBody.ok) {
        throw new Error(responseBody.description || `Telegram refund HTTP ${response.status}`);
      }

      await prisma.$transaction([
        prisma.transaction.create({
          data: {
            externalId: refundExternalId,
            userId: order.userId,
            type: "REFUND",
            amount: charge.amount,
            description: `Telegram Stars refund for order #${orderId}`,
            orderId,
            metadata: "source:telegram_stars",
          },
        }),
        prisma.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } }),
      ]);
    } catch (error) {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "FAILED", errorMessage: `Refund failed: ${String(error)}` },
      });
      logger.error("Telegram refund failed", { orderId, error: String(error) });
      throw error;
    }
    return;
  }

  logger.error("Refund blocked: unknown payment source", {
    orderId,
    paymentSource: order.paymentSource,
  });
}
