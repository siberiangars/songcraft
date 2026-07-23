import "dotenv/config";
import { UnrecoverableError, Worker } from "bullmq";
import prisma from "@/lib/prisma";
import {
  buildNegativeTags,
  createVariantLyrics,
  enhanceLyrics,
  generateSunoPrompt,
  getVariantHint,
  polishLyrics,
} from "@/lib/songcraft/claude.service";
import {
  coverAudio,
  convertSongToWav,
  extendSong,
  generateWithFallback,
  getRemainingCredits,
  getTimedLyrics,
  replaceSongSection,
  separateSongStems,
  SunoSong,
  TimedLyricsResult,
  waitForCompletion,
  waitForProcessingTask,
} from "@/lib/songcraft/suno.service";
import {
  deleteMediaAsset,
  getOwnedMediaAsset,
  publicMediaUrl,
  storeRemoteMedia,
} from "@/lib/songcraft/media.service";
import { refundOrder } from "@/lib/songcraft/payment.service";
import {
  notifyCompletion,
  notifyError,
  notifySelectionReady,
  notifyStatus,
  notifyVideoError,
} from "@/lib/songcraft/notification.service";
import { PRICING, PlanType, PUBLIC_BASE_URL, SUNO_MODEL } from "@/lib/songcraft/config";
import { creditReferralBonus } from "@/lib/songcraft/order.service";
import { logger } from "@/lib/songcraft/logger";
import { MUSIC_QUEUE } from "@/lib/songcraft/queue";
import { buildOrderDeliverables } from "@/lib/songcraft/deliverables.service";
import { accentRussianLyrics } from "@/lib/songcraft/pronunciation.service";

const OCCASION_TITLE: Record<string, string> = {
  birthday: "Песня ко дню рождения",
  wedding: "Свадебная песня",
  anniversary: "Песня к юбилею",
  love: "Песня о любви",
  justsave: "Просто так",
  other: "Особенный трек",
};

const VARIANT_CONTROLS = [
  { styleWeight: 0.84, weirdnessConstraint: 0.24 },
  { styleWeight: 0.78, weirdnessConstraint: 0.42 },
  { styleWeight: 0.81, weirdnessConstraint: 0.34 },
  { styleWeight: 0.82, weirdnessConstraint: 0.3 },
];

function variantControls(index: number) {
  return VARIANT_CONTROLS[Math.min(index, VARIANT_CONTROLS.length - 1)];
}

interface GenerationSettings {
  negativeTags?: string;
  pronunciationHints?: string[];
  producerRevision?: number;
}

interface ScoredCandidate {
  song: SunoSong;
  taskId: string;
  model: string;
  candidateIndex: number;
  score: number;
  timedLyrics: TimedLyricsResult | null;
}

const MIN_DELIVERABLE_SCORE = 64;
const MAX_QUALITY_ATTEMPTS = 1;
const SUNO_STYLE_LIMIT = 980;

async function setOrderProgress(
  orderId: number,
  progress: number,
  progressStage: string,
  progressMessage: string,
  status?: string
) {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      ...(status ? { status } : {}),
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      progressStage,
      progressMessage,
    },
  });
}

function parseGenerationSettings(value: string | null): GenerationSettings {
  if (!value) return {};
  try {
    return JSON.parse(value) as GenerationSettings;
  } catch {
    return {};
  }
}

function normalizeWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lineOverlap(left: string, right: string) {
  const leftLines = new Set(
    left
      .split("\n")
      .map(normalizeWords)
      .filter((line) => line.length > 12 && !line.startsWith("verse") && !line.startsWith("chorus"))
  );
  const rightLines = new Set(
    right
      .split("\n")
      .map(normalizeWords)
      .filter((line) => line.length > 12 && !line.startsWith("verse") && !line.startsWith("chorus"))
  );
  if (!leftLines.size || !rightLines.size) return 0;
  let matches = 0;
  for (const line of rightLines) {
    if (leftLines.has(line)) matches += 1;
  }
  return matches / Math.min(leftLines.size, rightLines.size);
}

function recipientRoot(recipientName: string) {
  const normalized = normalizeWords(recipientName).replace(/\s/g, "");
  if (normalized.length <= 4) return normalized;
  return normalized.slice(0, Math.max(4, normalized.length - 2));
}

function isSpeechForwardGenre(genre: string) {
  return /(?:рэп|хип[ -]?хоп|trap|трэп|rap|hip[ -]?hop)/i.test(genre);
}

function clampSunoStylePrompt(prompt: string, maxLength = SUNO_STYLE_LIMIT) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
}

function timingDiagnostics(timedLyrics: TimedLyricsResult | null) {
  const words = (timedLyrics?.alignedWords ?? []).filter(
    (word) => word.success && /[A-Za-z\u0401\u0451\u0410-\u044f]/.test(word.word)
  );
  const durations = words
    .map((word) => word.endS - word.startS)
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  return {
    firstWordStart: words[0]?.startS ?? null,
    maxWordDuration: durations.length ? Math.max(...durations) : null,
    longWordRatio: durations.length
      ? durations.filter((duration) => duration > 2.4).length / durations.length
      : 0,
  };
}

function candidateScore(
  song: SunoSong,
  timedLyrics: TimedLyricsResult | null,
  recipientName: string,
  genre: string
) {
  let score = 0;
  if (song.audioUrl) score += 20;
  if (song.imageUrl) score += 3;

  if (song.duration >= 105 && song.duration <= 300) score += 25;
  else if (song.duration >= 80 && song.duration <= 360) score += 15;
  else if (song.duration > 30) score += 5;

  const words = timedLyrics?.alignedWords ?? [];
  if (words.length) {
    const successful = words.filter((word) => word.success).length / words.length;
    score += successful * 28;

    const cer = timedLyrics?.hootCer;
    if (cer !== undefined && Number.isFinite(cer)) {
      if (cer <= 0.12) score += 22;
      else if (cer <= 0.22) score += 14 - (cer - 0.12) * 40;
      else if (cer <= 0.32) score += 4 - (cer - 0.22) * 80;
      else score -= 12;
    }

    const timing = timingDiagnostics(timedLyrics);
    if ((timing.firstWordStart ?? 0) > 18) score -= 12;
    else if ((timing.firstWordStart ?? 0) > 11) score -= 5;
    if ((timing.maxWordDuration ?? 0) > 8) score -= 18;
    else if ((timing.maxWordDuration ?? 0) > 4) score -= 8;
    if (timing.longWordRatio > 0.08) score -= 10;
    if (isSpeechForwardGenre(genre) && (timing.maxWordDuration ?? 0) > 3) score -= 8;

    const root = recipientRoot(recipientName);
    if (root) {
      const sungText = normalizeWords(words.map((word) => word.word).join(" ")).replace(/\s/g, "");
      score += sungText.includes(root) ? 10 : -8;
    }
  } else {
    score += 5;
  }

  return Math.round(score * 100) / 100;
}

async function scoreCandidates(
  taskId: string,
  model: string,
  songs: SunoSong[],
  recipientName: string,
  genre: string
): Promise<ScoredCandidate[]> {
  const scored = await Promise.all(
    songs.map(async (song, candidateIndex) => {
      const timedLyrics = await getTimedLyrics(taskId, song.id).catch((error) => {
        logger.warn("Timed lyrics unavailable for candidate", {
          taskId,
          audioId: song.id,
          error: String(error),
        });
        return null;
      });
      return {
        song,
        taskId,
        model,
        candidateIndex,
        timedLyrics,
        score: candidateScore(song, timedLyrics, recipientName, genre),
      };
    })
  );
  return scored.sort((left, right) => right.score - left.score);
}

function firstUrl(value: unknown, preferredKeys: string[]): string | null {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstUrl(item, preferredKeys);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of preferredKeys) {
    const found = firstUrl(record[key], preferredKeys);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    const found = firstUrl(nested, preferredKeys);
    if (found) return found;
  }
  return null;
}

async function archiveSelectedCandidate(input: {
  orderId: number;
  userId: number;
  title: string;
  stylePrompt: string;
  negativeTags: string;
  lyrics: string;
  variantIndex: number;
  scored: ScoredCandidate[];
  selectedPosition?: number;
  giftPhotoToken?: string | null;
}) {
  const selected = input.scored[input.selectedPosition ?? 0];
  if (!selected) throw new Error(`Suno did not return a usable candidate for version ${input.variantIndex + 1}`);

  const existing = await prisma.song.findFirst({
    where: {
      orderId: input.orderId,
      variantIndex: input.variantIndex,
      isSelected: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    logger.warn("Skipping duplicate song archive", {
      orderId: input.orderId,
      variantIndex: input.variantIndex,
      existingSongId: existing.id,
    });
    return existing;
  }

  const audio = await storeRemoteMedia({
    url: selected.song.audioUrl,
    userId: input.userId,
    kind: "song_mp3",
    filename: `${input.title}.mp3`,
    fallbackMimeType: "audio/mpeg",
  });
  const giftPhotoUrl = input.giftPhotoToken ? publicMediaUrl(input.giftPhotoToken) : null;
  const image = !giftPhotoUrl && selected.song.imageUrl
    ? await storeRemoteMedia({
        url: selected.song.imageUrl,
        userId: input.userId,
        kind: "song_cover",
        filename: `${input.title}.jpg`,
        fallbackMimeType: "image/jpeg",
        maxBytes: 12 * 1024 * 1024,
      }).catch((error) => {
        logger.warn("Song cover archive failed", {
          orderId: input.orderId,
          error: String(error),
        });
        return null;
      })
    : null;

  const concurrentExisting = await prisma.song.findFirst({
    where: {
      orderId: input.orderId,
      variantIndex: input.variantIndex,
      isSelected: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (concurrentExisting) {
    await Promise.allSettled([
      deleteMediaAsset(audio.token, input.userId),
      image ? deleteMediaAsset(image.token, input.userId) : Promise.resolve(false),
    ]);
    logger.warn("Discarded concurrently archived duplicate", {
      orderId: input.orderId,
      variantIndex: input.variantIndex,
      existingSongId: concurrentExisting.id,
    });
    return concurrentExisting;
  }

  return prisma.song.create({
    data: {
      orderId: input.orderId,
      sunoId: selected.song.id,
      sunoTaskId: selected.taskId,
      title: input.title,
      audioUrl: audio.url,
      imageUrl: giftPhotoUrl ?? image?.url ?? null,
      providerAudioUrl: selected.song.audioUrl,
      providerImageUrl: selected.song.imageUrl || giftPhotoUrl || null,
      duration: selected.song.duration,
      model: selected.model,
      stylePrompt: input.stylePrompt,
      negativeTags: input.negativeTags,
      lyricsJson: JSON.stringify({
        source: input.lyrics,
        alignedWords: selected.timedLyrics?.alignedWords ?? [],
        hootCer: selected.timedLyrics?.hootCer ?? null,
      }),
      waveformJson: JSON.stringify(selected.timedLyrics?.waveformData ?? []),
      qualityScore: selected.score,
      variantIndex: input.variantIndex,
      candidateIndex: selected.candidateIndex,
      isSelected: true,
      metadata: JSON.stringify({
        candidates: input.scored.map((candidate) => ({
          sunoId: candidate.song.id,
          taskId: candidate.taskId,
          score: candidate.score,
          duration: candidate.song.duration,
          providerAudioUrl: candidate.song.audioUrl,
        })),
      }),
    },
  });
}

function needsQualityRetry(scored: ScoredCandidate[], genre: string) {
  const best = scored[0];
  if (!best) return true;
  if (!best.song.audioUrl || best.song.duration < 80) return true;
  const timing = timingDiagnostics(best.timedLyrics);
  if ((best.timedLyrics?.hootCer ?? 0) > 0.28) return true;
  if ((timing.firstWordStart ?? 0) > 20 || (timing.maxWordDuration ?? 0) > 8) return true;
  if (isSpeechForwardGenre(genre) && timing.longWordRatio > 0.08) return true;
  return best.score < MIN_DELIVERABLE_SCORE;
}

async function createStudioFiles(song: {
  id: number;
  orderId: number;
  sunoId: string;
  sunoTaskId: string | null;
  title: string;
  order: { userId: number; plan: string };
}) {
  if (!song.sunoTaskId) return;
  const plan = PRICING[song.order.plan as PlanType];

  if (plan.wav) {
    try {
      const taskId = await convertSongToWav(song.sunoTaskId, song.sunoId, {
        kind: "wav",
        orderId: song.orderId,
      });
      const result = await waitForProcessingTask(taskId, "wav");
      const remoteUrl = firstUrl(result, ["wavUrl", "wav_url", "audioUrl", "audio_url", "fileUrl"]);
      if (remoteUrl) {
        const stored = await storeRemoteMedia({
          url: remoteUrl,
          userId: song.order.userId,
          kind: "song_wav",
          filename: `${song.title}.wav`,
          fallbackMimeType: "audio/wav",
          maxBytes: 160 * 1024 * 1024,
        });
        await prisma.song.update({ where: { id: song.id }, data: { wavUrl: stored.url } });
      }
    } catch (error) {
      logger.warn("WAV processing failed without failing order", {
        songId: song.id,
        error: String(error),
      });
    }
  }

  if (plan.stems) {
    try {
      const taskId = await separateSongStems(song.sunoTaskId, song.sunoId, {
        kind: "stems",
        orderId: song.orderId,
      });
      const result = await waitForProcessingTask(taskId, "stems");
      const vocalRemote = firstUrl(result, ["vocalUrl", "vocal_url", "vocalsUrl", "vocals_url"]);
      const instrumentalRemote = firstUrl(result, [
        "instrumentalUrl",
        "instrumental_url",
        "musicUrl",
        "music_url",
        "accompanimentUrl",
      ]);
      const [vocal, instrumental] = await Promise.all([
        vocalRemote
          ? storeRemoteMedia({
              url: vocalRemote,
              userId: song.order.userId,
              kind: "song_vocal",
              filename: `${song.title} - вокал.mp3`,
              fallbackMimeType: "audio/mpeg",
              maxBytes: 100 * 1024 * 1024,
            })
          : null,
        instrumentalRemote
          ? storeRemoteMedia({
              url: instrumentalRemote,
              userId: song.order.userId,
              kind: "song_instrumental",
              filename: `${song.title} - инструментал.mp3`,
              fallbackMimeType: "audio/mpeg",
              maxBytes: 100 * 1024 * 1024,
            })
          : null,
      ]);
      await prisma.song.update({
        where: { id: song.id },
        data: {
          vocalUrl: vocal?.url ?? undefined,
          instrumentalUrl: instrumental?.url ?? undefined,
        },
      });
    } catch (error) {
      logger.warn("Stem processing failed without failing order", {
        songId: song.id,
        error: String(error),
      });
    }
  }
}

async function processGeneration(orderId: number) {
  logger.info("Worker: processing generation", { orderId });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      voiceProfile: true,
      songs: { where: { isSelected: true }, orderBy: { variantIndex: "asc" } },
    },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.status === "COMPLETED") return;
  if (!["PAID", "PROCESSING", "ENHANCING", "GENERATING"].includes(order.status)) {
    throw new UnrecoverableError(`Order ${orderId} is not paid`);
  }

  const planConfig = PRICING[order.plan as PlanType];
  if (!planConfig) throw new Error(`Unknown plan ${order.plan}`);
  const variantsLimit = Math.max(1, planConfig.variantsCount);
  const existingVariants = new Set(order.songs.map((song) => song.variantIndex));

  if (existingVariants.size < variantsLimit) {
    const credits = await getRemainingCredits().catch((error) => {
      logger.warn("Unable to check Suno credits", { error: String(error) });
      return null;
    });
    if (credits !== null && credits < planConfig.sunoCredits) {
      throw new UnrecoverableError("На музыкальном API недостаточно кредитов для полного заказа");
    }
  }

  const telegramId = order.user.telegramId;
  let baseLyrics = order.approvedLyrics?.trim() || order.enhancedLyrics?.trim() || "";
  if (!baseLyrics) {
    await setOrderProgress(orderId, 12, "lyrics", "Собираем вашу историю в цельный текст песни", "ENHANCING");
    await notifyStatus(telegramId, "ENHANCING");
    baseLyrics = await enhanceLyrics({
      userText: order.userText,
      recipientName: order.recipientName,
      recipientPronunciation: order.recipientPronunciation,
      occasion: order.occasion,
      genre: order.genre,
      mood: order.mood,
      language: (order.language ?? "ru") as "ru" | "en" | "both",
    });
    baseLyrics = await polishLyrics({
      lyrics: baseLyrics,
      recipientName: order.recipientName,
      recipientPronunciation: order.recipientPronunciation,
      genre: order.genre,
      mood: order.mood,
      language: (order.language ?? "ru") as "ru" | "en" | "both",
    });
    await prisma.order.update({
      where: { id: orderId },
      data: {
        enhancedLyrics: baseLyrics,
        progress: 24,
        progressStage: "lyrics_ready",
        progressMessage: "Проверяем рифмы, ударения и произношение имен",
      },
    });
  }

  await setOrderProgress(orderId, 30, "music", "Создаем три разные музыкальные версии", "GENERATING");
  await notifyStatus(telegramId, "GENERATING");

  const baseTitle =
    order.trackTitle?.trim() ||
    `${OCCASION_TITLE[order.occasion] ?? "Новый трек"}${order.recipientName ? ` - ${order.recipientName}` : ""}`;
  const generationSettings = parseGenerationSettings(order.generationSettings);
  const negativeTags =
    generationSettings.negativeTags ||
    buildNegativeTags({
      genre: order.genre,
      voiceType: order.voiceType,
      language: order.language,
    });

  const missingVariantIndexes = Array.from({ length: variantsLimit }, (_, index) => index).filter(
    (index) => !existingVariants.has(index)
  );
  // The provider always returns exactly two songs per request. For the current
  // three-track offer, use both songs from the first request and one from the
  // second request. This reduces generation from three paid requests to two.
  const usePairedGeneration = variantsLimit === 3 && existingVariants.size === 0;
  const generationVariantIndexes = usePairedGeneration ? [0, 2] : missingVariantIndexes;

  const variantResults = await Promise.allSettled(
    generationVariantIndexes.map(async (variantIndex) => {
      const variantHint = getVariantHint(variantIndex, variantsLimit, order.genre);
      let lyrics =
        variantIndex === 0
          ? baseLyrics
          : await createVariantLyrics({
              baseLyrics,
              userText: order.userText,
              recipientName: order.recipientName,
              recipientPronunciation: order.recipientPronunciation,
              occasion: order.occasion,
              genre: order.genre,
              mood: order.mood,
              language: (order.language ?? "ru") as "ru" | "en" | "both",
              variantHint,
            });

      if (variantIndex > 0 && lineOverlap(baseLyrics, lyrics) > 0.35) {
        lyrics = await createVariantLyrics({
          baseLyrics,
          userText: order.userText,
          recipientName: order.recipientName,
          recipientPronunciation: order.recipientPronunciation,
          occasion: order.occasion,
          genre: order.genre,
          mood: order.mood,
          language: (order.language ?? "ru") as "ru" | "en" | "both",
          variantHint: `${variantHint} Перепиши радикальнее: ни одна строка припева не должна совпадать.`,
        });
      }

      if (variantIndex > 0) {
        lyrics = await polishLyrics({
          lyrics,
          recipientName: order.recipientName,
          recipientPronunciation: order.recipientPronunciation,
          genre: order.genre,
          mood: order.mood,
          language: (order.language ?? "ru") as "ru" | "en" | "both",
        });
      }

      lyrics = await accentRussianLyrics({
        lyrics,
        recipientName: order.recipientName,
        recipientPronunciation: order.recipientPronunciation,
      });

      const stylePrompt = clampSunoStylePrompt(
        variantIndex === 0 && order.style && order.style.length >= 120
          ? order.style
          : await generateSunoPrompt({
              genre: order.genre,
              mood: order.mood,
              tempo: order.tempo,
              occasion: order.occasion,
              voiceType: order.voiceType,
              userText: order.userText,
              recipientName: order.recipientName,
              customStyle: order.style,
              variantHint,
            })
      );
      const title =
        variantsLimit > 1 ? `${baseTitle} - версия ${variantIndex + 1}` : baseTitle;
      const controls = variantControls(variantIndex);
      const resumableTask = await prisma.sunoTask.findFirst({
        where: {
          orderId,
          variantIndex,
          kind: "generate",
          status: { not: "FAILED" },
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
      });
      const scoredAttempts: ScoredCandidate[] = [];
      let primaryJobId: string | null = null;
      let primaryGenerationModel: string | null = null;

      for (let attempt = 0; attempt < MAX_QUALITY_ATTEMPTS; attempt += 1) {
        const retrying = attempt > 0;
        const generated =
          attempt === 0 && resumableTask
            ? {
                jobId: resumableTask.taskId,
                model: (order.generationModel || SUNO_MODEL()) as
                  | "V4"
                  | "V4_5"
                  | "V4_5PLUS"
                  | "V4_5ALL"
                  | "V5"
                  | "V5_5",
              }
            : await generateWithFallback(
                {
                  prompt: retrying
                    ? clampSunoStylePrompt(
                        `${stylePrompt} Quality pass: prioritize clean Russian diction, stable vocal phrasing, natural stress, clear recipient name, and a commercially polished arrangement.`
                      )
                    : stylePrompt,
                  lyrics,
                  title: retrying ? `${title} - quality pass` : title,
                  negativeTags,
                  vocalGender: order.voiceType === "male" ? "m" : "f",
                  personaId: order.voiceProfile?.voiceId ?? undefined,
                  personaModel: order.voiceProfile?.voiceId ? "voice_persona" : undefined,
                  styleWeight: retrying ? Math.min(0.9, controls.styleWeight + 0.06) : controls.styleWeight,
                  weirdnessConstraint: retrying ? Math.max(0.16, controls.weirdnessConstraint - 0.14) : controls.weirdnessConstraint,
                  model: (order.generationModel || SUNO_MODEL()) as
                    | "V4"
                    | "V4_5"
                    | "V4_5PLUS"
                    | "V4_5ALL"
                    | "V5"
                    | "V5_5",
                },
                { kind: retrying ? "quality-regenerate" : "generate", orderId, variantIndex }
              );

        primaryJobId ??= generated.jobId;
        primaryGenerationModel ??= generated.model;

        const result = await waitForCompletion(generated.jobId);
        const scored = await scoreCandidates(
          generated.jobId,
          generated.model,
          result.songs,
          order.recipientName,
          order.genre
        );
        scoredAttempts.push(...scored);
        scoredAttempts.sort((left, right) => right.score - left.score);

        if (!needsQualityRetry(scoredAttempts, order.genre)) break;
        logger.warn("Generated song candidate below quality threshold, retrying", {
          orderId,
          variantIndex,
          attempt: attempt + 1,
          bestScore: scoredAttempts[0]?.score ?? null,
          threshold: MIN_DELIVERABLE_SCORE,
        });
      }

      if (variantIndex === 0 && primaryJobId && primaryGenerationModel) {
        await prisma.order.update({
          where: { id: orderId },
          data: { sunoJobId: primaryJobId, generationModel: primaryGenerationModel },
        });
      }

      const scored = scoredAttempts.sort((left, right) => right.score - left.score);
      const archiveTargets = usePairedGeneration && variantIndex === 0 ? [0, 1] : [variantIndex];
      if (archiveTargets.length === 2 && scored.length < 2) {
        throw new Error("Suno returned fewer than two songs for the paired generation request");
      }
      const archived = await Promise.all(
        archiveTargets.map((targetVariantIndex, selectedPosition) =>
          archiveSelectedCandidate({
            orderId,
            userId: order.userId,
            title:
              variantsLimit > 1
                ? `${baseTitle} - версия ${targetVariantIndex + 1}`
                : baseTitle,
            stylePrompt,
            negativeTags,
            lyrics,
            variantIndex: targetVariantIndex,
            scored,
            selectedPosition,
            giftPhotoToken: order.addCover ? order.giftPhotoToken : null,
          })
        )
      );
      const completedCount = await prisma.song.count({
        where: { orderId, isSelected: true },
      });
      await setOrderProgress(
        orderId,
        30 + (Math.min(completedCount, variantsLimit) / variantsLimit) * 50,
        "music",
        `Готово версий: ${Math.min(completedCount, variantsLimit)} из ${variantsLimit}`,
        "GENERATING"
      );
      return archived;
    })
  );

  const createdSongs = variantResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
  const failedVariants = variantResults.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ variantIndex: generationVariantIndexes[index], reason: result.reason }]
      : []
  );
  if (failedVariants.length) {
    logger.warn("One or more song variants failed", {
      orderId,
      failedVariants: failedVariants.map((failure) => ({
        variantIndex: failure.variantIndex,
        error: String(failure.reason),
      })),
      completedVariants: createdSongs.map((song) => song.variantIndex),
    });
    const firstFailure = failedVariants[0].reason;
    throw firstFailure instanceof Error
      ? firstFailure
      : new Error(String(firstFailure ?? "Song variant generation failed"));
  }

  let allSongs = await prisma.song.findMany({
    where: { orderId, isSelected: true },
    include: { order: { select: { userId: true, plan: true } } },
    orderBy: { variantIndex: "asc" },
  });
  if (!allSongs.length) throw new Error("Музыкальная модель не вернула ни одного готового трека");


  await Promise.allSettled(createdSongs.map((song) => {
    const withOrder = allSongs.find((item) => item.id === song.id);
    return withOrder ? createStudioFiles(withOrder) : Promise.resolve();
  }));

  if (allSongs.length > 1) {
    await setOrderProgress(
      orderId,
      86,
      "selection",
      "Три версии готовы. Послушайте все и выберите лучшую",
      "AWAITING_SELECTION"
    );
    await notifySelectionReady(telegramId, orderId);
    logger.info("Worker: waiting for track selection", { orderId, variantsSaved: allSongs.length });
    return;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "COMPLETED",
      progress: 100,
      progressStage: "completed",
      progressMessage: "Все версии готовы",
      errorMessage: null,
    },
  });
  await creditReferralBonus(orderId, order.amount).catch((error) =>
    logger.warn("Referral bonus failed after completion", { orderId, error: String(error) })
  );
  await notifyCompletion(
    telegramId,
    orderId,
    allSongs.map((song) => ({
      audioUrl: song.audioUrl,
      recipientName: order.recipientName,
      title: song.title,
    }))
  );

  logger.info("Worker: order completed", {
    orderId,
    variantsSaved: allSongs.length,
    plan: order.plan,
  });
}

async function processDeliverables(orderId: number, songId: number) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      songs: { where: { isSelected: true }, orderBy: { variantIndex: "asc" } },
    },
  });
  if (!order) throw new UnrecoverableError(`Order ${orderId} not found`);
  if (!order.addVideo && !order.addCover && !order.spokenIntroToken) {
    throw new UnrecoverableError(`Order ${orderId} has no deliverables to build`);
  }
  if (order.selectedSongId !== songId) throw new UnrecoverableError("Selected song changed");
  const selectedSong = order.songs.find((song) => song.id === songId);
  if (!selectedSong) throw new UnrecoverableError("Selected song does not belong to order");

  const progressStatus = order.addVideo ? "CREATING_VIDEO" : "FINISHING";
  const progressStage = order.addVideo ? "video" : "deliverables";
  const progressMessage = order.addVideo
    ? "Собираем клип из ваших фотографий под выбранный трек"
    : "Готовим дополнительные материалы к выбранному треку";
  const doneMessage = order.addVideo
    ? "Трек и клип готовы"
    : "Выбранный трек и дополнительные материалы готовы";

  await setOrderProgress(orderId, 91, progressStage, progressMessage, progressStatus);
  await buildOrderDeliverables({
    orderId,
    userId: order.userId,
    addCover: order.addCover,
    giftPhotoToken: order.giftPhotoToken,
    addVideo: order.addVideo,
    videoPhotoTokens: order.videoPhotoTokens ? JSON.parse(order.videoPhotoTokens) : [],
    spokenIntroToken: order.spokenIntroToken,
    songs: [selectedSong],
  });
  await setOrderProgress(orderId, 98, progressStage, "Финально проверяем файлы перед выдачей", progressStatus);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "COMPLETED",
      progress: 100,
      progressStage: "completed",
      progressMessage: doneMessage,
      errorMessage: null,
    },
  });
  await creditReferralBonus(orderId, order.amount).catch((error) =>
    logger.warn("Referral bonus failed after video completion", { orderId, error: String(error) })
  );
  await notifyCompletion(
    order.user.telegramId,
    orderId,
    order.songs.map((song) => ({
      audioUrl: song.audioUrl,
      recipientName: order.recipientName,
      title: song.title,
    }))
  );
  logger.info("Worker: video completed", { orderId, songId });
}

interface SongActionInput {
  type: "replace_section" | "cover" | "extend" | "wav" | "stems";
  startS?: number;
  endS?: number;
  replacementLyrics?: string;
  prompt?: string;
  style?: string;
  title?: string;
  continueAt?: number;
  uploadMediaToken?: string;
}

function sourceLyrics(song: { lyricsJson: string | null }, fallback: string) {
  if (!song.lyricsJson) return fallback;
  try {
    const parsed = JSON.parse(song.lyricsJson) as { source?: string };
    return parsed.source?.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function completeAction(actionId: number, result: Record<string, unknown>) {
  return prisma.songAction.update({
    where: { id: actionId },
    data: {
      status: "COMPLETED",
      resultJson: JSON.stringify(result),
      errorMessage: null,
    },
  });
}

async function processSongAction(actionId: number) {
  const action = await prisma.songAction.findUnique({
    where: { id: actionId },
    include: {
      song: {
        include: {
          order: {
            include: { user: true },
          },
        },
      },
    },
  });
  if (!action) throw new Error(`Song action ${actionId} not found`);
  if (action.status === "COMPLETED") return;

  const input = JSON.parse(action.inputJson) as SongActionInput;
  const song = action.song;
  if (!song.sunoTaskId) throw new Error("Для этого трека недоступна студийная обработка");
  await prisma.songAction.update({
    where: { id: action.id },
    data: { status: "PROCESSING", errorMessage: null },
  });

  if (input.type === "wav") {
    if (song.wavUrl) {
      await completeAction(action.id, { wavUrl: song.wavUrl, songId: song.id });
      return;
    }
    const taskId =
      action.providerTaskId ||
      (await convertSongToWav(song.sunoTaskId, song.sunoId, {
        kind: "wav",
        orderId: song.orderId,
        actionId: action.id,
      }));
    if (!action.providerTaskId) {
      await prisma.songAction.update({
        where: { id: action.id },
        data: { providerTaskId: taskId },
      });
    }
    const result = await waitForProcessingTask(taskId, "wav");
    const remoteUrl = firstUrl(result, ["wavUrl", "wav_url", "audioUrl", "audio_url", "fileUrl"]);
    if (!remoteUrl) throw new Error("Suno не вернул ссылку на WAV");
    const stored = await storeRemoteMedia({
      url: remoteUrl,
      userId: song.order.userId,
      kind: "song_wav",
      filename: `${song.title}.wav`,
      fallbackMimeType: "audio/wav",
      maxBytes: 160 * 1024 * 1024,
    });
    await prisma.song.update({ where: { id: song.id }, data: { wavUrl: stored.url } });
    await completeAction(action.id, { wavUrl: stored.url, songId: song.id });
    return;
  }

  if (input.type === "stems") {
    if (song.vocalUrl && song.instrumentalUrl) {
      await completeAction(action.id, {
        vocalUrl: song.vocalUrl,
        instrumentalUrl: song.instrumentalUrl,
        songId: song.id,
      });
      return;
    }
    const taskId =
      action.providerTaskId ||
      (await separateSongStems(song.sunoTaskId, song.sunoId, {
        kind: "stems",
        orderId: song.orderId,
        actionId: action.id,
      }));
    if (!action.providerTaskId) {
      await prisma.songAction.update({
        where: { id: action.id },
        data: { providerTaskId: taskId },
      });
    }
    const result = await waitForProcessingTask(taskId, "stems");
    const vocalRemote = firstUrl(result, ["vocalUrl", "vocal_url", "vocalsUrl", "vocals_url"]);
    const instrumentalRemote = firstUrl(result, [
      "instrumentalUrl",
      "instrumental_url",
      "musicUrl",
      "music_url",
      "accompanimentUrl",
    ]);
    if (!vocalRemote || !instrumentalRemote) {
      throw new Error("Suno не вернул обе раздельные дорожки");
    }
    const [vocal, instrumental] = await Promise.all([
      storeRemoteMedia({
        url: vocalRemote,
        userId: song.order.userId,
        kind: "song_vocal",
        filename: `${song.title} - вокал.mp3`,
        fallbackMimeType: "audio/mpeg",
        maxBytes: 100 * 1024 * 1024,
      }),
      storeRemoteMedia({
        url: instrumentalRemote,
        userId: song.order.userId,
        kind: "song_instrumental",
        filename: `${song.title} - инструментал.mp3`,
        fallbackMimeType: "audio/mpeg",
        maxBytes: 100 * 1024 * 1024,
      }),
    ]);
    await prisma.song.update({
      where: { id: song.id },
      data: { vocalUrl: vocal.url, instrumentalUrl: instrumental.url },
    });
    await completeAction(action.id, {
      vocalUrl: vocal.url,
      instrumentalUrl: instrumental.url,
      songId: song.id,
    });
    return;
  }

  const lyrics = sourceLyrics(
    song,
    song.order.approvedLyrics || song.order.enhancedLyrics || song.order.userText
  );
  const style = input.style?.trim() || song.stylePrompt || song.order.style || song.order.genre;
  const titleBase = input.title?.trim() || song.title;
  let taskId = action.providerTaskId;

  if (!taskId && input.type === "extend") {
    taskId = await extendSong(
      {
        audioId: song.sunoId,
        prompt: input.prompt?.trim() || undefined,
        style: input.prompt ? style : undefined,
        title: input.prompt ? `${titleBase} - продолжение` : undefined,
        continueAt: input.prompt ? input.continueAt ?? Math.max(1, (song.duration ?? 120) - 8) : undefined,
        model: (song.model || SUNO_MODEL()) as "V5" | "V5_5",
      },
      { kind: "extend", orderId: song.orderId, actionId: action.id }
    );
  }

  if (!taskId && input.type === "cover") {
    const media = input.uploadMediaToken
      ? await getOwnedMediaAsset(input.uploadMediaToken, song.order.userId)
      : null;
    if (input.uploadMediaToken && !media) {
      throw new Error("Исходный файл принадлежит другому пользователю или удален");
    }
    const sourceUrl =
      (media ? publicMediaUrl(media.token) : null) ||
      song.providerAudioUrl ||
      (/^https?:\/\//i.test(song.audioUrl)
        ? song.audioUrl
        : `${PUBLIC_BASE_URL()}${song.audioUrl.startsWith("/") ? "" : "/"}${song.audioUrl}`);
    taskId = await coverAudio(
      {
        uploadUrl: sourceUrl,
        lyrics: input.prompt?.trim() || lyrics,
        style,
        title: `${titleBase} - новый стиль`,
        model: (song.model || SUNO_MODEL()) as "V5" | "V5_5",
        negativeTags: song.negativeTags ?? undefined,
        vocalGender: song.order.voiceType === "male" ? "m" : "f",
      },
      { kind: "cover", orderId: song.orderId, actionId: action.id }
    );
  }

  if (!taskId && input.type === "replace_section") {
    if (
      input.startS === undefined ||
      input.endS === undefined ||
      !input.replacementLyrics?.trim()
    ) {
      throw new Error("Не заданы границы или новый текст фрагмента");
    }
    taskId = await replaceSongSection(
      {
        taskId: song.sunoTaskId,
        audioId: song.sunoId,
        replacementLyrics: input.replacementLyrics.trim(),
        fullLyrics: lyrics,
        style,
        title: `${titleBase} - исправленная версия`,
        startS: input.startS,
        endS: input.endS,
        negativeTags: song.negativeTags ?? undefined,
      },
      { kind: "replace_section", orderId: song.orderId, actionId: action.id }
    );
  }

  if (!taskId) throw new Error(`Не удалось создать задачу ${input.type}`);
  if (!action.providerTaskId) {
    await prisma.songAction.update({
      where: { id: action.id },
      data: { providerTaskId: taskId },
    });
  }

  const result = await waitForCompletion(taskId);
  const scored = await scoreCandidates(
    taskId,
    song.model || SUNO_MODEL(),
    result.songs,
    song.order.recipientName,
    song.order.genre
  );
  const lastVariant = await prisma.song.aggregate({
    where: { orderId: song.orderId },
    _max: { variantIndex: true },
  });
  const title =
    input.type === "extend"
      ? `${titleBase} - продолжение`
      : input.type === "cover"
        ? `${titleBase} - новый стиль`
        : `${titleBase} - исправленная версия`;
  const created = await archiveSelectedCandidate({
    orderId: song.orderId,
    userId: song.order.userId,
    title,
    stylePrompt: style,
    negativeTags: song.negativeTags || buildNegativeTags({
      genre: song.order.genre,
      voiceType: song.order.voiceType,
    }),
    lyrics: input.type === "replace_section" ? input.replacementLyrics || lyrics : input.prompt || lyrics,
    variantIndex: (lastVariant._max.variantIndex ?? 0) + 1,
    scored,
    giftPhotoToken: song.order.addCover ? song.order.giftPhotoToken : null,
  });
  await completeAction(action.id, { songId: created.id, audioUrl: created.audioUrl });
}

const worker = new Worker(
  MUSIC_QUEUE,
  async (job) => {
    if (job.name === "song-action") {
      const { actionId } = job.data as { actionId: number };
      await processSongAction(actionId);
      return;
    }
    if (job.name === "deliverables") {
      const { orderId, songId } = job.data as { orderId: number; songId: number };
      await processDeliverables(orderId, songId);
      return;
    }
    const { orderId } = job.data as { orderId: number };
    await processGeneration(orderId);
  },
  {
    connection: { url: process.env.REDIS_URL },
    concurrency: 2,
    limiter: { max: 6, duration: 60_000 },
  }
);

worker.on("failed", async (job, error) => {
  if (!job) return;
  const maxAttempts = job.opts.attempts ?? 1;
  const isFinalAttempt =
    error.name === "UnrecoverableError" || job.attemptsMade >= maxAttempts;

  if (job.name === "song-action") {
    const { actionId } = job.data as { actionId: number };
    logger.error("Worker: song action failed", {
      actionId,
      error: error.message,
      attemptsMade: job.attemptsMade,
      maxAttempts,
      final: isFinalAttempt,
    });
    await prisma.songAction
      .update({
        where: { id: actionId },
        data: {
          status: isFinalAttempt ? "FAILED" : "PENDING",
          errorMessage: error.message,
        },
      })
      .catch(() => null);
    return;
  }

  if (job.name === "deliverables") {
    const { orderId } = job.data as { orderId: number };
    logger.error("Worker: video generation failed", {
      orderId,
      error: error.message,
      attemptsMade: job.attemptsMade,
      maxAttempts,
      final: isFinalAttempt,
    });
    if (isFinalAttempt) {
      const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
      if (order) {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: "VIDEO_FAILED",
            progress: 88,
            progressStage: "video_failed",
            progressMessage: "Клип не собрался. Треки сохранены - можно повторить",
            errorMessage: error.message,
          },
        });
        await notifyVideoError(order.user.telegramId, orderId);
      }
    }
    return;
  }

  const { orderId } = job.data as { orderId: number };
  logger.error("Worker: generation failed", {
    orderId,
    error: error.message,
    attemptsMade: job.attemptsMade,
    maxAttempts,
    final: isFinalAttempt,
  });

  if (!isFinalAttempt) {
    await prisma.order
      .update({
        where: { id: orderId },
        data: {
          status: "PAID",
          errorMessage: error.message,
          retryCount: { increment: 1 },
        },
      })
      .catch(() => null);
    return;
  }

  const order = await prisma.order
    .findUnique({
      where: { id: orderId },
      include: {
        user: true,
        songs: { where: { isSelected: true }, orderBy: { variantIndex: "asc" } },
      },
    })
    .catch(() => null);
  if (!order) return;

  if (order.songs.length) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "COMPLETED",
        errorMessage: `Заказ завершен частично: ${error.message}`,
        retryCount: { increment: 1 },
      },
    });
    await notifyCompletion(
      order.user.telegramId,
      order.id,
      order.songs.map((song) => ({
        audioUrl: song.audioUrl,
        recipientName: order.recipientName,
        title: song.title,
      }))
    );
    return;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "FAILED",
      errorMessage: error.message,
      retryCount: { increment: 1 },
    },
  });
  await notifyError(order.user.telegramId);
  await refundOrder(orderId);
});

worker.on("ready", () => logger.info("Music worker started"));
worker.on("error", (error) => logger.error("Worker error", { error }));

async function writeHeartbeat() {
  const connection = await worker.client;
  await connection.set("songcraft:worker:heartbeat", String(Date.now()), "PX", 120_000);
}

const heartbeatTimer = setInterval(() => {
  writeHeartbeat().catch((error) =>
    logger.warn("Worker heartbeat failed", { error: String(error) })
  );
}, 30_000);
heartbeatTimer.unref();
writeHeartbeat().catch(() => null);

process.on("SIGTERM", async () => {
  clearInterval(heartbeatTimer);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});
