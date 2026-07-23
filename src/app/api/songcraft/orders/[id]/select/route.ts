import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { creditReferralBonus } from "@/lib/songcraft/order.service";
import { notifyCompletion } from "@/lib/songcraft/notification.service";
import { enqueueDeliverables } from "@/lib/songcraft/queue";
import { withTWAAuth } from "../../../middleware";

const selectionSchema = z.object({
  songId: z.number().int().positive(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTWAAuth(req, async (_, tgUser) => {
    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Некорректный номер заказа" }, { status: 400 });
    }

    const parsed = selectionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Выберите один из готовых треков" }, { status: 422 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { telegramId: true } },
        songs: { where: { isSelected: true } },
      },
    });
    if (!order || String(order.user.telegramId) !== String(tgUser.id)) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }
    if (!order.songs.some((song) => song.id === parsed.data.songId)) {
      return NextResponse.json({ error: "Этот трек не относится к заказу" }, { status: 400 });
    }
    if (!["AWAITING_SELECTION", "VIDEO_FAILED"].includes(order.status)) {
      return NextResponse.json(
        { error: order.status === "CREATING_VIDEO" ? "Клип уже создаётся" : "Выбор сейчас недоступен" },
        { status: 409 }
      );
    }

    const selectedSong = order.songs.find((song) => song.id === parsed.data.songId)!;
    const hasDeliverables = Boolean(order.addVideo || order.addCover || order.spokenIntroToken);

    if (!hasDeliverables) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          selectedSongId: selectedSong.id,
          status: "COMPLETED",
          progress: 100,
          progressStage: "completed",
          progressMessage: "Выбранный трек готов",
          errorMessage: null,
        },
      });
      await creditReferralBonus(orderId, order.amount).catch(() => null);
      await notifyCompletion(order.user.telegramId, orderId, [{
        audioUrl: selectedSong.audioUrl,
        recipientName: order.recipientName,
        title: selectedSong.title,
      }]).catch(() => null);
      return NextResponse.json({ ok: true, status: "COMPLETED" });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        selectedSongId: selectedSong.id,
        status: order.addVideo ? "CREATING_VIDEO" : "FINISHING",
        progress: 89,
        progressStage: order.addVideo ? "video_queue" : "deliverables_queue",
        progressMessage: order.addVideo
          ? "Лучший трек выбран. Готовим фотографии к монтажу"
          : "Лучший трек выбран. Готовим дополнительные материалы",
        errorMessage: null,
      },
    });

    const jobId = await enqueueDeliverables(orderId, selectedSong.id);
    if (!jobId) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "VIDEO_FAILED",
          progress: 88,
          progressStage: "video_failed",
          progressMessage: "Не удалось запустить производство. Попробуйте ещё раз",
        },
      });
      return NextResponse.json({ error: "Не удалось запустить производство" }, { status: 503 });
    }

    return NextResponse.json({ ok: true, status: order.addVideo ? "CREATING_VIDEO" : "FINISHING" });
  });
}
