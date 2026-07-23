import { NextRequest, NextResponse } from "next/server";
import { withTWAAuth } from "../../middleware";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTWAAuth(req, async (_, tgUser) => {
    const { id } = await params;
    const songId = Number(id);
    if (isNaN(songId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: { order: { include: { user: true } } },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (String(song.order.user.telegramId) !== String(tgUser.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(song);
  });
}
