import prisma from "../src/lib/prisma";
import { BOT_TOKEN } from "../src/lib/songcraft/config";
import { enqueueGeneration } from "../src/lib/songcraft/queue";
import { sanitizeLyricsOutput } from "../src/lib/songcraft/claude.service";

const sourceOrderId = Number(process.argv[2]);

if (!Number.isSafeInteger(sourceOrderId) || sourceOrderId <= 0) {
  throw new Error("Usage: npx tsx scripts/remake-songcraft-order.ts <source-order-id>");
}

const source = await prisma.order.findUnique({
  where: { id: sourceOrderId },
  include: { user: true },
});

if (!source) throw new Error(`Order ${sourceOrderId} not found`);

const remakePaymentId = `admin-remake:${sourceOrderId}:lyrics-cleanup`;
let remake = await prisma.order.findFirst({ where: { paymentId: remakePaymentId } });
let created = false;

if (!remake) {
  remake = await prisma.order.create({
    data: {
      userId: source.userId,
      status: "PAID",
      plan: source.plan,
      recipientName: source.recipientName,
      recipientPronunciation: source.recipientPronunciation,
      trackTitle: source.trackTitle,
      occasion: source.occasion,
      userText: source.userText,
      enhancedLyrics: source.enhancedLyrics
        ? sanitizeLyricsOutput(source.enhancedLyrics)
        : null,
      approvedLyrics: source.approvedLyrics
        ? sanitizeLyricsOutput(source.approvedLyrics)
        : null,
      lyricsApprovedAt: source.lyricsApprovedAt,
      draftId: source.draftId,
      genre: source.genre,
      mood: source.mood,
      voiceType: source.voiceType,
      voiceProfileId: source.voiceProfileId,
      style: source.style,
      tempo: source.tempo,
      language: source.language,
      generationModel: source.generationModel,
      generationSettings: source.generationSettings,
      addCover: false,
      addVideo: false,
      addSpokenIntro: false,
      amount: 0,
      paymentId: remakePaymentId,
      paymentSource: "admin_remake",
      paidAt: new Date(),
    },
  });
  created = true;
}

if (created) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: source.user.telegramId,
      text: `Лилия, мы заметили служебную фразу в одном из треков заказа №${sourceOrderId}. Уже бесплатно переделываем все 3 версии. Готовые треки автоматически придут в этот чат.`,
    }),
  }).catch(() => null);
}

if (remake.status !== "COMPLETED") {
  await prisma.order.update({
    where: { id: remake.id },
    data: { status: "PAID", errorMessage: null },
  });
  await enqueueGeneration(remake.id);
}

console.log(
  JSON.stringify({
    sourceOrderId,
    remakeOrderId: remake.id,
    status: remake.status,
    created,
    charged: false,
  })
);

await prisma.$disconnect();
process.exit(0);
