import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { YOOKASSA_SECRET_KEY, YOOKASSA_SHOP_ID } from "@/lib/songcraft/config";
import { logger } from "@/lib/songcraft/logger";

interface YooKassaWebhook {
  event?: string;
  object?: { id?: string };
}

interface YooKassaPayment {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: { value?: string; currency?: string };
  metadata?: Record<string, string | undefined>;
}

async function getPayment(paymentId: string): Promise<YooKassaPayment> {
  const auth = Buffer.from(`${YOOKASSA_SHOP_ID()}:${YOOKASSA_SECRET_KEY()}`).toString("base64");
  const response = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as YooKassaPayment & {
    description?: string;
  };
  if (!response.ok) {
    throw new Error(body.description || `YooKassa HTTP ${response.status}`);
  }
  return body;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as YooKassaWebhook | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (body.event !== "payment.succeeded") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const paymentId = body.object?.id;
  if (!paymentId) {
    return NextResponse.json({ ok: false, error: "Missing payment id" }, { status: 422 });
  }

  let payment: YooKassaPayment;
  try {
    payment = await getPayment(paymentId);
  } catch (error) {
    logger.error("YooKassa webhook verification failed", { paymentId, error: String(error) });
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  if (payment.id !== paymentId || payment.status !== "succeeded" || payment.paid !== true) {
    logger.warn("YooKassa webhook ignored: payment is not succeeded", {
      paymentId,
      status: payment.status,
      paid: payment.paid,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const meta = payment.metadata ?? {};
  const tgUserId = meta.tgUserId;
  const metadataAmount = Number(meta.amountKopeks ?? "0");
  const actualAmount = Math.round(Number(payment.amount?.value ?? "0") * 100);
  if (
    !["songcraft_topup", "songcraft_order"].includes(meta.type ?? "") ||
    !tgUserId ||
    payment.amount?.currency !== "RUB" ||
    !Number.isSafeInteger(metadataAmount) ||
    metadataAmount <= 0 ||
    actualAmount !== metadataAmount
  ) {
    logger.error("YooKassa webhook metadata mismatch", {
      paymentId,
      type: meta.type,
      currency: payment.amount?.currency,
      metadataAmount,
      actualAmount,
    });
    return NextResponse.json({ ok: false, error: "Payment mismatch" }, { status: 422 });
  }

  const user = await prisma.tgUser.findUnique({ where: { telegramId: String(tgUserId) } });
  if (!user) {
    logger.warn("YooKassa webhook user not found", { tgUserId, paymentId });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const externalId = `yookassa-success:${paymentId}`;
  if (meta.type === "songcraft_order") {
    const orderId = Number(meta.orderId ?? "0");
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid order id" }, { status: 422 });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== user.id || order.amount !== actualAmount) {
      logger.error("YooKassa order payment mismatch", {
        paymentId,
        orderId,
        userId: user.id,
        actualAmount,
      });
      return NextResponse.json({ ok: false, error: "Order mismatch" }, { status: 422 });
    }

    let shouldStartGeneration = false;
    try {
      shouldStartGeneration = await prisma.$transaction(async (tx) => {
        const existing = await tx.transaction.findUnique({ where: { externalId } });
        if (existing) return false;

        const freshOrder = await tx.order.findUnique({ where: { id: orderId } });
        if (!freshOrder || freshOrder.status !== "PENDING") return false;

        await tx.tgUser.update({
          where: { id: user.id },
          data: { balance: { increment: actualAmount } },
        });
        await tx.transaction.create({
          data: {
            externalId,
            userId: user.id,
            type: "PAYMENT",
            amount: actualAmount,
            description: `YooKassa order payment ${Math.floor(actualAmount / 100)} RUB`,
            metadata: `success:yookassa:${paymentId}:order:${orderId}`,
          },
        });

        const charged = await tx.tgUser.updateMany({
          where: { id: user.id, balance: { gte: actualAmount } },
          data: {
            balance: { decrement: actualAmount },
            totalSpent: { increment: actualAmount },
          },
        });
        if (charged.count !== 1) throw new Error(`Could not charge order ${orderId}`);

        await tx.transaction.create({
          data: {
            externalId: `balance-charge:order:${orderId}`,
            userId: user.id,
            type: "PAYMENT",
            amount: actualAmount,
            description: `Списание баланса за заказ #${orderId} (${freshOrder.plan})`,
            orderId,
            metadata: `source:balance;yookassa:${paymentId}`,
          },
        });
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: "PAID",
            paymentId,
            paymentSource: "balance",
            paidAt: new Date(),
          },
        });
        return true;
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }

    if (shouldStartGeneration) {
      try {
        const { enqueueGeneration } = await import("@/lib/songcraft/queue");
        await enqueueGeneration(orderId);
      } catch (error) {
        logger.error("Could not enqueue paid YooKassa order", { orderId, error: String(error) });
      }
      const { notifyPaid } = await import("@/lib/songcraft/notification.service");
      await notifyPaid(String(tgUserId)).catch(() => null);
    }

    return NextResponse.json({ ok: true });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({ where: { externalId } });
      if (existing) return;

      await tx.tgUser.update({
        where: { id: user.id },
        data: { balance: { increment: actualAmount } },
      });
      await tx.transaction.create({
        data: {
          externalId,
          userId: user.id,
          type: "PAYMENT",
          amount: actualAmount,
          description: `YooKassa topup ${Math.floor(actualAmount / 100)} RUB`,
          metadata: `success:yookassa:${paymentId}`,
        },
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
  }

  return NextResponse.json({ ok: true });
}
