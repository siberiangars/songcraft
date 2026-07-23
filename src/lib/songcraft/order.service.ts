import prisma from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { ORDER_ADDONS, PlanType, SONG_OFFER } from "./config";
import { logger } from "./logger";

const START_GIFT_BALANCE = 300 * 100;
const REFERRAL_BONUS_FIXED = 200 * 100;

export interface CreateOrderInput {
  telegramId: string;
  plan?: PlanType;
  recipientName: string;
  recipientPronunciation?: string;
  trackTitle?: string;
  occasion: string;
  userText: string;
  draftId?: string;
  approvedLyrics?: string;
  genre: string;
  mood: string;
  voiceType?: "female" | "male";
  voiceProfileId?: number;
  style?: string;
  tempo?: string;
  language?: string;
  addCover?: boolean;
  giftPhotoToken?: string | null;
  addVideo?: boolean;
  videoPhotoTokens?: string[];
  addSpokenIntro?: boolean;
  spokenIntroToken?: string;
}

async function awardReferralBonus(referrerId: number, invitedUserId: number) {
  const externalId = `referral:gift-spent:${invitedUserId}`;
  try {
    await prisma.$transaction(async (tx) => {
      const alreadyRewarded = await tx.transaction.findUnique({ where: { externalId } });
      if (alreadyRewarded) return;

      await tx.tgUser.update({
        where: { id: referrerId },
        data: { balance: { increment: REFERRAL_BONUS_FIXED } },
      });
      await tx.transaction.create({
        data: {
          externalId,
          userId: referrerId,
          type: "REFERRAL_BONUS",
          amount: REFERRAL_BONUS_FIXED,
          description: `Партнерский бонус 200 ₽ за пользователя #${invitedUserId}`,
          metadata: `gift_spent_user:${invitedUserId}`,
        },
      });
    });
  } catch (error) {
    logger.warn("Referral bonus skipped", { invitedUserId, error: String(error) });
  }
}

export async function getOrCreateUser(from: {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  language_code?: string;
}) {
  const telegramId = String(from.id);
  const existing = await prisma.tgUser.findUnique({ where: { telegramId } });
  if (existing) return existing;

  return prisma.tgUser.create({
    data: {
      telegramId,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      languageCode: from.language_code ?? "ru",
      balance: START_GIFT_BALANCE,
      freeCredits: 0,
    },
  });
}

export async function createOrder(input: CreateOrderInput) {
  const plan = SONG_OFFER.plan;
  const planAmount = (
    SONG_OFFER.price +
    (input.addCover ? ORDER_ADDONS.cover.price : 0) +
    (input.addVideo ? ORDER_ADDONS.video.price : 0) +
    (input.addSpokenIntro ? ORDER_ADDONS.spokenIntro.price : 0)
  ) * 100;
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.tgUser.findUnique({ where: { telegramId: input.telegramId } });
    if (!user) throw new Error("User not found");

    const draft = input.draftId
      ? await tx.songDraft.findFirst({
          where: { id: input.draftId, userId: user.id },
        })
      : null;
    if (input.draftId && !draft) throw new Error("Черновик не найден или принадлежит другому пользователю");

    const voiceProfile = input.voiceProfileId
      ? await tx.voiceProfile.findFirst({
          where: {
            id: input.voiceProfileId,
            userId: user.id,
            status: "READY",
            voiceId: { not: null },
          },
        })
      : null;
    if (input.voiceProfileId && !voiceProfile) {
      throw new Error("Профиль голоса ещё не готов или принадлежит другому пользователю");
    }

    const spokenIntro = input.spokenIntroToken
      ? await tx.mediaAsset.findFirst({
          where: { token: input.spokenIntroToken, userId: user.id, kind: "spoken_intro" },
        })
      : null;
    if (input.addSpokenIntro && !spokenIntro) {
      throw new Error("Запишите голосовое поздравление перед оформлением заказа");
    }

    const giftPhoto = input.giftPhotoToken
      ? await tx.mediaAsset.findFirst({
          where: { token: input.giftPhotoToken, userId: user.id, kind: "gift_cover_photo" },
          select: { token: true },
        })
      : null;
    if (input.addCover && !giftPhoto) {
      throw new Error("Загрузите фото для обложки подарка или отключите эту услугу");
    }

    const videoPhotoTokens = [...new Set(input.videoPhotoTokens ?? [])];
    const videoPhotos = input.addVideo
      ? await tx.mediaAsset.findMany({
          where: {
            token: { in: videoPhotoTokens },
            userId: user.id,
            kind: "slideshow_photo",
          },
          select: { token: true },
        })
      : [];
    if (input.addVideo && (videoPhotoTokens.length < 3 || videoPhotoTokens.length > 12)) {
      throw new Error("Для видео-слайдшоу добавьте от 3 до 12 фотографий");
    }
    if (input.addVideo && videoPhotos.length !== videoPhotoTokens.length) {
      throw new Error("Некоторые фотографии не найдены. Загрузите их ещё раз");
    }

    const approvedLyrics = input.approvedLyrics?.trim() || draft?.lyrics || null;
    const finalTitle = input.trackTitle?.trim() || draft?.title || null;
    const finalStyle = input.style?.trim() || draft?.stylePrompt || null;
    const generationSettings = draft
      ? JSON.stringify({
          negativeTags: draft.negativeTags,
          pronunciationHints: draft.pronunciationJson
            ? JSON.parse(draft.pronunciationJson)
            : [],
          producerRevision: draft.revision,
        })
      : null;

    const pendingOrder = await tx.order.create({
      data: {
        userId: user.id,
        plan,
        status: "PENDING",
        amount: planAmount,
        recipientName: input.recipientName,
        recipientPronunciation: input.recipientPronunciation?.trim() || null,
        trackTitle: finalTitle,
        occasion: input.occasion,
        userText: input.userText,
        approvedLyrics,
        lyricsApprovedAt: approvedLyrics ? new Date() : null,
        draftId: draft?.id ?? null,
        genre: input.genre,
        mood: input.mood,
        voiceType: input.voiceType,
        voiceProfileId: voiceProfile?.id ?? null,
        style: finalStyle,
        tempo: input.tempo ?? "medium",
        language: input.language ?? "ru",
        generationModel: "V5_5",
        generationSettings,
        addCover: Boolean(input.addCover),
        giftPhotoToken: input.addCover ? giftPhoto?.token ?? null : null,
        addVideo: Boolean(input.addVideo),
        videoStyle: input.addVideo ? "slideshow" : null,
        videoPhotoTokens: input.addVideo ? JSON.stringify(videoPhotoTokens) : null,
        addSpokenIntro: Boolean(input.addSpokenIntro),
        spokenIntroToken: input.addSpokenIntro ? spokenIntro?.token ?? null : null,
      },
    });

    const charged = await tx.tgUser.updateMany({
      where: { id: user.id, balance: { gte: planAmount } },
      data: {
        balance: { decrement: planAmount },
        totalSpent: { increment: planAmount },
      },
    });

    if (charged.count !== 1) {
      return {
        order: pendingOrder,
        usedBalanceCredit: false,
        remainingAfterCharge: user.balance,
        referrerId: user.referredById,
        totalSpentBefore: user.totalSpent,
      };
    }

    const paidAt = new Date();
    const order = await tx.order.update({
      where: { id: pendingOrder.id },
      data: {
        status: "PAID",
        progress: 5,
        progressStage: "payment_received",
        progressMessage: "Оплата получена. Заказ поставлен в очередь",
        paymentSource: "balance",
        paidAt,
      },
    });
    await tx.transaction.create({
      data: {
        externalId: `balance-charge:order:${order.id}`,
        userId: user.id,
        type: "PAYMENT",
        amount: planAmount,
        description: `Списание баланса за заказ #${order.id} (${SONG_OFFER.name})`,
        orderId: order.id,
        metadata: "source:balance",
      },
    });

    return {
      order,
      usedBalanceCredit: true,
      remainingAfterCharge: user.balance - planAmount,
      referrerId: user.referredById,
      totalSpentBefore: user.totalSpent,
    };
  });

  logger.info("Order created", {
    orderId: result.order.id,
    plan,
    paidFromBalance: result.usedBalanceCredit,
    remaining: result.remainingAfterCharge,
  });
  return { ...result.order, usedBalanceCredit: result.usedBalanceCredit };
}

export async function markOrderPaid(orderId: number, paymentId: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: "PAID",
      progress: 5,
      progressStage: "payment_received",
      progressMessage: "Оплата получена. Заказ поставлен в очередь",
      paymentId,
      paidAt: new Date(),
    },
  });
}

export async function updateOrderStatus(
  orderId: number,
  status: string,
  extra?: { sunoJobId?: string; errorMessage?: string; enhancedLyrics?: string }
) {
  return prisma.order.update({
    where: { id: orderId },
    data: { status, ...extra },
  });
}

export async function getOrderWithUser(orderId: number) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      songs: { where: { isSelected: true }, orderBy: { variantIndex: "asc" } },
    },
  });
  if (!order) return null;
  for (const song of order.songs) {
    if (!song.shareToken) {
      const shareToken = randomUUID().replace(/-/g, "");
      await prisma.song.update({ where: { id: song.id }, data: { shareToken } });
      song.shareToken = shareToken;
    }
  }
  return { ...order, song: order.songs[0] ?? null };
}

export async function getUserOrders(telegramId: string) {
  const user = await prisma.tgUser.findUnique({ where: { telegramId } });
  if (!user) return [];

  const orders = await prisma.order.findMany({
    where: {
      userId: user.id,
      hiddenAt: null,
      OR: [
        { status: { not: "COMPLETED" } },
        { songs: { some: { isSelected: true } } },
      ],
    },
    include: {
      songs: { where: { isSelected: true }, orderBy: { variantIndex: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return orders.map((order) => ({ ...order, song: order.songs[0] ?? null }));
}

export async function processReferral(newUserId: number, referralCode: string) {
  const referrer = await prisma.tgUser.findUnique({ where: { referralCode } });
  if (!referrer || referrer.id === newUserId) return;

  await prisma.tgUser.update({
    where: { id: newUserId },
    data: { referredById: referrer.id },
  });

  logger.info("Referral linked", { newUserId, referrerId: referrer.id });
}

export async function creditReferralBonus(orderId: number, amountPaid: number) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  });
  if (
    !order ||
    order.paymentSource !== "balance" ||
    !order.user.referredById ||
    order.user.totalSpent < START_GIFT_BALANCE
  ) {
    return;
  }

  await awardReferralBonus(order.user.referredById, order.userId);
  logger.info("Referral bonus checked after completion", { orderId, amountPaid });
}
