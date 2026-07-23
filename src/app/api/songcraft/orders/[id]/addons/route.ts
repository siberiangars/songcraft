import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { ORDER_ADDONS } from "@/lib/songcraft/config";
import { enqueueDeliverables } from "@/lib/songcraft/queue";
import { withTWAAuth } from "../../../middleware";

const SLIDESHOW_MIN_PHOTOS = 3;
const SLIDESHOW_MAX_PHOTOS = 12;

const addonsSchema = z.object({
  addCover: z.boolean().default(false),
  giftPhotoToken: z.string().min(1).optional().nullable(),
  addVideo: z.boolean().default(false),
  videoPhotoTokens: z.array(z.string().min(1)).max(SLIDESHOW_MAX_PHOTOS).default([]),
  addSpokenIntro: z.boolean().default(false),
  spokenIntroToken: z.string().min(1).optional().nullable(),
});

function parseOrderId(value: string) {
  const orderId = Number(value);
  return Number.isInteger(orderId) && orderId > 0 ? orderId : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTWAAuth(req, async (_, tgUser) => {
    const { id } = await params;
    const orderId = parseOrderId(id);
    if (!orderId) return NextResponse.json({ error: "Некорректный номер заказа" }, { status: 400 });

    const parsed = addonsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const input = parsed.data;
    const selectedAddons = Boolean(input.addCover || input.addVideo || input.addSpokenIntro);
    if (!selectedAddons) {
      return NextResponse.json({ error: "Выберите хотя бы одну дополнительную услугу" }, { status: 422 });
    }
    if (input.addVideo && (input.videoPhotoTokens.length < SLIDESHOW_MIN_PHOTOS || input.videoPhotoTokens.length > SLIDESHOW_MAX_PHOTOS)) {
      return NextResponse.json({ error: `Для клипа загрузите от ${SLIDESHOW_MIN_PHOTOS} до ${SLIDESHOW_MAX_PHOTOS} фото` }, { status: 422 });
    }
    if (input.addSpokenIntro && !input.spokenIntroToken) {
      return NextResponse.json({ error: "Запишите голосовое поздравление" }, { status: 422 });
    }
    if (input.addCover && !input.giftPhotoToken) {
      return NextResponse.json({ error: "Загрузите фото для обложки подарка" }, { status: 422 });
    }

    const amount =
      (input.addCover ? ORDER_ADDONS.cover.price : 0) * 100 +
      (input.addVideo ? ORDER_ADDONS.video.price : 0) * 100 +
      (input.addSpokenIntro ? ORDER_ADDONS.spokenIntro.price : 0) * 100;

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          user: true,
          songs: { where: { isSelected: true }, orderBy: { variantIndex: "asc" } },
        },
      });
      if (!order || String(order.user.telegramId) !== String(tgUser.id)) {
        return { status: 404 as const, error: "Заказ не найден" };
      }
      if (order.status !== "COMPLETED" || !order.selectedSongId) {
        return { status: 409 as const, error: "Сначала выберите лучшую версию трека" };
      }
      if (order.addCover || order.addVideo || order.addSpokenIntro || order.coverUrl || order.videoUrl) {
        return { status: 409 as const, error: "Дополнительные материалы по этому заказу уже оформлены" };
      }
      const selectedSong = order.songs.find((song) => song.id === order.selectedSongId);
      if (!selectedSong) return { status: 409 as const, error: "Выбранный трек не найден" };

      const spokenIntro = input.addSpokenIntro
        ? await tx.mediaAsset.findFirst({
            where: { token: input.spokenIntroToken ?? "", userId: order.userId, kind: "spoken_intro" },
            select: { token: true },
          })
        : null;
      if (input.addSpokenIntro && !spokenIntro) {
        return { status: 422 as const, error: "Голосовое поздравление не найдено. Запишите его еще раз" };
      }

      const giftPhoto = input.addCover
        ? await tx.mediaAsset.findFirst({
            where: { token: input.giftPhotoToken ?? "", userId: order.userId, kind: "gift_cover_photo" },
            select: { token: true },
          })
        : null;
      if (input.addCover && !giftPhoto) {
        return { status: 422 as const, error: "Фото для обложки не найдено. Загрузите его еще раз" };
      }

      const uniquePhotoTokens = [...new Set(input.videoPhotoTokens)];
      const photos = input.addVideo
        ? await tx.mediaAsset.findMany({
            where: { token: { in: uniquePhotoTokens }, userId: order.userId, kind: "slideshow_photo" },
            select: { token: true },
          })
        : [];
      if (input.addVideo && photos.length !== uniquePhotoTokens.length) {
        return { status: 422 as const, error: "Часть фотографий не найдена. Загрузите фото еще раз" };
      }

      const charged = await tx.tgUser.updateMany({
        where: { id: order.userId, balance: { gte: amount } },
        data: { balance: { decrement: amount }, totalSpent: { increment: amount } },
      });
      if (charged.count !== 1) {
        return {
          status: 402 as const,
          error: `Недостаточно средств. Нужно ${(amount / 100).toLocaleString("ru-RU")} ₽`,
          amount,
          balance: order.user.balance,
        };
      }

      await tx.transaction.create({
        data: {
          externalId: `balance-charge:addons:${orderId}:${Date.now()}`,
          userId: order.userId,
          type: "PAYMENT",
          amount,
          description: `Дополнительные материалы к заказу #${orderId}`,
          orderId,
          metadata: `source:balance;addons:${[
            input.addSpokenIntro ? "intro" : "",
            input.addCover ? "cover" : "",
            input.addVideo ? "video" : "",
          ].filter(Boolean).join(",")}`,
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: input.addVideo ? "CREATING_VIDEO" : "FINISHING",
          progress: 90,
          progressStage: input.addVideo ? "video_queue" : "deliverables_queue",
          progressMessage: input.addVideo
            ? "Материалы приняты. Собираем клип из ваших фото"
            : "Материалы приняты. Готовим файлы к выдаче",
          addCover: input.addCover,
          giftPhotoToken: input.addCover ? giftPhoto?.token ?? null : null,
          addVideo: input.addVideo,
          videoStyle: input.addVideo ? "slideshow" : null,
          videoPhotoTokens: input.addVideo ? JSON.stringify(uniquePhotoTokens) : null,
          addSpokenIntro: input.addSpokenIntro,
          spokenIntroToken: input.addSpokenIntro ? spokenIntro?.token ?? null : null,
          amount: { increment: amount },
          errorMessage: null,
        },
      });

      return { status: 200 as const, songId: selectedSong.id, amount };
    });

    if (result.status !== 200) {
      return NextResponse.json(result, { status: result.status });
    }

    const jobId = await enqueueDeliverables(orderId, result.songId);
    if (!jobId) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "VIDEO_FAILED",
          progress: 88,
          progressStage: "deliverables_failed",
          progressMessage: "Не удалось запустить производство. Напишите в поддержку",
        },
      });
      return NextResponse.json({ error: "Не удалось запустить производство" }, { status: 503 });
    }

    return NextResponse.json({ ok: true, status: "PROCESSING", amount: result.amount });
  });
}
