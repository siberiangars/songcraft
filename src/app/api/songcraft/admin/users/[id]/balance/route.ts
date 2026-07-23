import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requestHasAdminSession } from "@/lib/songcraft/admin-auth";

const balanceSchema = z.object({
  amountRub: z.number().int().min(-50_000).max(50_000).refine((value) => value !== 0),
  reason: z.string().trim().min(2).max(180),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requestHasAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = Number(id);
  const parsed = balanceSchema.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(userId) || !parsed.success) {
    return NextResponse.json({ error: "Проверьте сумму и комментарий" }, { status: 400 });
  }

  const amount = parsed.data.amountRub * 100;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.tgUser.findUnique({ where: { id: userId } });
      if (!user) throw new Error("USER_NOT_FOUND");
      if (user.balance + amount < 0) throw new Error("NEGATIVE_BALANCE");

      const nextUser = await tx.tgUser.update({
        where: { id: userId },
        data: { balance: { increment: amount } },
      });
      await tx.transaction.create({
        data: {
          externalId: `admin-balance:${randomUUID()}`,
          userId,
          type: amount > 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
          amount,
          description: `Администратор: ${parsed.data.reason}`,
          metadata: "source:songcraft_admin_dashboard",
        },
      });
      return nextUser;
    });

    return NextResponse.json({ balance: updated.balance });
  } catch (error) {
    if (String(error).includes("USER_NOT_FOUND")) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }
    if (String(error).includes("NEGATIVE_BALANCE")) {
      return NextResponse.json({ error: "Нельзя списать больше текущего баланса" }, { status: 409 });
    }
    return NextResponse.json({ error: "Не удалось изменить баланс" }, { status: 500 });
  }
}
