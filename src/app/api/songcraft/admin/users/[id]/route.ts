import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requestHasAdminSession } from "@/lib/songcraft/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requestHasAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "Некорректный пользователь" }, { status: 400 });
  }

  const user = await prisma.tgUser.findUnique({
    where: { id: userId },
    include: {
      _count: { select: { orders: true, transactions: true, referrals: true, songDrafts: true, voiceProfiles: true } },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          songs: {
            where: { isSelected: true },
            select: { id: true, title: true, duration: true, qualityScore: true, createdAt: true },
          },
        },
      },
      transactions: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });

  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  return NextResponse.json(user, { headers: { "Cache-Control": "no-store" } });
}
