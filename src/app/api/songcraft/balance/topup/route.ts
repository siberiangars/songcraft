import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTWAAuth } from "../../middleware";
import prisma from "@/lib/prisma";
import { MINI_APP_URL } from "@/lib/songcraft/config";
import { createSbpPayment } from "@/lib/songcraft/yookassa.service";

const topupSchema = z.object({
  method: z.literal("sbp").optional(),
  amountRub: z.number().int().min(10).max(50000),
});

function makeTopupToken() {
  return crypto.randomUUID();
}

export async function POST(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = topupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const { amountRub } = parsed.data;
    const amountKopeks = amountRub * 100;
    const topupToken = makeTopupToken();
    const returnUrl = `${MINI_APP_URL()}/balance`;
    let payment;
    try {
      payment = await createSbpPayment({
        amountKopeks,
        description: `Пополнение баланса SongCraft на ${amountRub} ₽`,
        returnUrl,
        metadata: {
          type: "songcraft_topup",
          tgUserId: String(tgUser.id),
          topupToken,
          amountKopeks: String(amountKopeks),
        },
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Не удалось создать платёж в ЮKassa" },
        { status: 502 }
      );
    }

    await prisma.transaction.create({
      data: {
        externalId: `yookassa-pending:${payment.paymentId}`,
        userId: (await prisma.tgUser.findUniqueOrThrow({ where: { telegramId: String(tgUser.id) } })).id,
        type: "PAYMENT",
        amount: amountKopeks,
        description: `YooKassa topup pending ${amountRub} RUB`,
        metadata: `pending:yookassa:${payment.paymentId}:token:${topupToken}`,
      },
    });

    return NextResponse.json({
      ok: true,
      method: "sbp",
      paymentId: payment.paymentId,
      confirmationUrl: payment.confirmationUrl,
    });
  });
}
