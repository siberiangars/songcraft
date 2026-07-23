import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withTWAAuth } from "../middleware";
import { createOrder, getUserOrders, updateOrderStatus } from "@/lib/songcraft/order.service";
import { MINI_APP_URL, SONG_OFFER } from "@/lib/songcraft/config";
import { logger } from "@/lib/songcraft/logger";
import { createSbpPayment } from "@/lib/songcraft/yookassa.service";

const createOrderSchema = z.object({
  plan: z.enum(["BASIC", "STANDARD", "PREMIUM"]).optional(),
  recipientName: z.string().min(0).max(100).default(""),
  recipientPronunciation: z.string().max(100).optional(),
  trackTitle: z.string().min(1).max(80).optional(),
  occasion: z.string().min(1),
  userText: z.string().min(10).max(3000),
  draftId: z.string().min(1).optional(),
  approvedLyrics: z.string().min(100).max(10000).optional(),
  genre: z.string().min(1),
  mood: z.string().min(0).default(""),
  voiceType: z.enum(["female", "male"]).optional(),
  voiceProfileId: z.number().int().positive().optional(),
  style: z.string().optional(),
  tempo: z.enum(["slow", "medium", "fast"]).default("medium"),
  language: z.enum(["ru", "en", "both"]).default("ru"),
  addCover: z.boolean().default(false),
  giftPhotoToken: z.string().min(1).optional().nullable(),
  addVideo: z.boolean().default(false),
  videoPhotoTokens: z.array(z.string().min(1)).max(12).optional(),
  addSpokenIntro: z.boolean().default(false),
  spokenIntroToken: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const data = parsed.data;
    let result;
    try {
      result = await createOrder({ telegramId: String(tgUser.id), ...data });
    } catch (error) {
      logger.warn("Order validation failed", {
        telegramId: tgUser.id,
        error: String(error),
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Не удалось создать заказ" },
        { status: 400 }
      );
    }
    const { usedBalanceCredit, ...order } = result;

    if (usedBalanceCredit) {
      try {
        const { enqueueGeneration } = await import("@/lib/songcraft/queue");
        await enqueueGeneration(order.id);
      } catch (e) {
        logger.warn("Queue unavailable (Redis not running), skipping", { e: String(e) });
      }

      const { notifyPaid } = await import("@/lib/songcraft/notification.service");
      await notifyPaid(String(tgUser.id)).catch(() => null);

      return NextResponse.json({
        orderId: order.id,
        status: "PAID",
        paidFromBalance: true,
        message: "Стоимость списана из стартового баланса. Начинаем создание трека...",
      });
    }

    let payment;
    try {
      payment = await createSbpPayment({
        amountKopeks: order.amount,
        description: `${SONG_OFFER.name} и выбранные дополнения — SongCraft`,
        returnUrl: `${MINI_APP_URL()}/order/${order.id}`,
        metadata: {
          type: "songcraft_order",
          tgUserId: String(tgUser.id),
          orderId: String(order.id),
          amountKopeks: String(order.amount),
        },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentId: payment.paymentId },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось создать платёж по СБП";
      logger.error("YooKassa order payment failed", { orderId: order.id, message });
      await updateOrderStatus(order.id, "FAILED", { errorMessage: message });
      return NextResponse.json(
        { error: message },
        { status: 502 }
      );
    }

    return NextResponse.json({
      orderId: order.id,
      status: order.status,
      paidFromBalance: false,
      paymentRequired: true,
      paymentMethod: "sbp",
      confirmationUrl: payment.confirmationUrl,
      message: "Перейдите к оплате по СБП.",
    });
  });
}

export async function GET(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const orders = await getUserOrders(String(tgUser.id));
    return NextResponse.json(orders);
  });
}
