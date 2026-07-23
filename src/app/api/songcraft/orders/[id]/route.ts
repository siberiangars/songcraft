import { NextRequest, NextResponse } from "next/server";
import { withTWAAuth } from "../../middleware";
import { getOrderWithUser } from "@/lib/songcraft/order.service";
import prisma from "@/lib/prisma";

const ACTIVE_STATUSES = new Set(["PAID", "PROCESSING", "ENHANCING", "GENERATING", "CREATING_VIDEO", "REFUNDING"]);

function parseOrderId(value: string) {
  const orderId = Number(value);
  return Number.isInteger(orderId) && orderId > 0 ? orderId : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTWAAuth(req, async (_, tgUser) => {
    const { id } = await params;
    const orderId = parseOrderId(id);
    if (!orderId) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const order = await getOrderWithUser(orderId);
    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (String(order.user.telegramId) !== String(tgUser.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(order);
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTWAAuth(req, async (_, tgUser) => {
    const { id } = await params;
    const orderId = parseOrderId(id);
    if (!orderId) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, hiddenAt: true, user: { select: { telegramId: true } } },
    });
    if (!order || order.hiddenAt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (String(order.user.telegramId) !== String(tgUser.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (ACTIVE_STATUSES.has(order.status)) {
      return NextResponse.json(
        { error: "Дождитесь завершения создания треков" },
        { status: 409 }
      );
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { hiddenAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  });
}
