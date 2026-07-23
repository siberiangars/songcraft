import prisma from "@/lib/prisma";
import { PRICING, PlanType, BOT_TOKEN, PAYMENT_PROVIDER_TOKEN } from "./config";
import { logger } from "./logger";

export function buildStarsInvoice(orderId: number, plan: PlanType) {
  const p = PRICING[plan];
  return {
    title: `${p.name} track - SongCraft`,
    description: p.description,
    payload: JSON.stringify({ orderId }),
    currency: "XTR",
    prices: [{ label: p.name, amount: p.priceStars }],
  };
}

export function buildRubleInvoice(orderId: number, plan: PlanType) {
  const p = PRICING[plan];
  return {
    title: `${p.name} track - SongCraft`,
    description: p.description,
    payload: JSON.stringify({ orderId }),
    provider_token: PAYMENT_PROVIDER_TOKEN(),
    currency: "RUB",
    prices: [{ label: p.name, amount: p.price * 100 }],
    need_name: false,
    need_email: false,
  };
}

export async function processSuccessfulPayment(
  orderId: number,
  telegramPaymentChargeId: string,
  amountStars: number
) {
  logger.info("Payment success", { orderId, chargeId: telegramPaymentChargeId });
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`Order ${orderId} not found`);

  // order.amount — полная сумма заказа в копейках (тариф + допы); 1 звезда = 1 ₽.
  const expectedStars = Math.floor(order.amount / 100);
  if (expectedStars <= 0 || amountStars !== expectedStars) {
    throw new Error(`Unexpected Stars amount for order ${orderId}`);
  }

  const externalId = `telegram-payment:${telegramPaymentChargeId}`;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({ where: { externalId } });
      if (existing) return;

      const freshOrder = await tx.order.findUnique({ where: { id: orderId } });
      if (!freshOrder) throw new Error(`Order ${orderId} not found`);
      if (freshOrder.status !== "PENDING") {
        throw new Error(`Order ${orderId} is not awaiting payment`);
      }

      await tx.transaction.create({
        data: {
          externalId,
          userId: freshOrder.userId,
          type: "PAYMENT",
          amount: freshOrder.amount,
          description: `Telegram Stars payment for order #${orderId} (${freshOrder.plan})`,
          orderId,
          metadata: `source:telegram_stars;stars:${amountStars}`,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "PAID",
          paymentId: telegramPaymentChargeId,
          paymentSource: "telegram_stars",
          paidAt: new Date(),
        },
      });
      await tx.tgUser.update({
        where: { id: freshOrder.userId },
        data: { totalSpent: { increment: freshOrder.amount } },
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return;
    throw error;
  }
}

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
