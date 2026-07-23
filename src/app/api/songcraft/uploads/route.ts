import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTWAAuth } from "../middleware";
import prisma from "@/lib/prisma";
import { normalizeVoiceAudio } from "@/lib/songcraft/audio.service";
import { MAX_AUDIO_UPLOAD_MB } from "@/lib/songcraft/config";
import { logger } from "@/lib/songcraft/logger";
import { storeMediaBuffer } from "@/lib/songcraft/media.service";

export const runtime = "nodejs";

const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/3gpp",
  "audio/x-caf",
  "video/mp4",
  "video/webm",
  "application/octet-stream",
]);

const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const uploadKindSchema = z.enum([
  "voice_source",
  "voice_verification",
  "song_cover_source",
  "gift_cover_photo",
  "spoken_intro",
  "slideshow_photo",
]);

export async function POST(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const formData = await req.formData().catch(() => null);
    const file = formData?.get("file");
    const parsedKind = uploadKindSchema.safeParse(
      String(formData?.get("kind") ?? "voice_source")
    );
    if (!parsedKind.success) {
      return NextResponse.json({ error: "Недопустимый тип загрузки" }, { status: 422 });
    }
    const kind = parsedKind.data;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
    }

    const mimeType = file.type.split(";", 1)[0].trim().toLowerCase();
    const isVoiceUpload = kind === "voice_source" || kind === "voice_verification" || kind === "spoken_intro";
    const isPhotoUpload = kind === "slideshow_photo" || kind === "gift_cover_photo";
    if (isPhotoUpload && !ALLOWED_PHOTO_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: "Подойдут фотографии JPG, PNG или WEBP." },
        { status: 415 }
      );
    }
    if (!isPhotoUpload && ((!mimeType && !isVoiceUpload) || (mimeType && !ALLOWED_AUDIO_TYPES.has(mimeType)))) {
      return NextResponse.json(
        { error: "Не удалось распознать аудио. Запишите голос ещё раз." },
        { status: 415 }
      );
    }

    const maxBytes = isPhotoUpload ? 15 * 1024 * 1024 : MAX_AUDIO_UPLOAD_MB() * 1024 * 1024;
    if (file.size <= 0 || file.size > maxBytes) {
      return NextResponse.json(
        { error: isPhotoUpload ? "Максимальный размер фотографии: 15 МБ" : `Максимальный размер файла: ${MAX_AUDIO_UPLOAD_MB()} МБ` },
        { status: 413 }
      );
    }

    const user = await prisma.tgUser.findUnique({
      where: { telegramId: String(tgUser.id) },
    });
    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const uploadedBuffer = Buffer.from(await file.arrayBuffer());
    let storedBuffer: Buffer = uploadedBuffer;
    let storedFilename = file.name || `${kind}.webm`;
    let storedMimeType = mimeType || "application/octet-stream";

    if (isVoiceUpload) {
      try {
        storedBuffer = await normalizeVoiceAudio(uploadedBuffer);
        storedFilename = `${storedFilename.replace(/\.[^.]+$/, "") || kind}.mp3`;
        storedMimeType = "audio/mpeg";
      } catch (error) {
        logger.warn("Voice upload normalization failed", {
          telegramId: String(tgUser.id),
          mimeType: file.type,
          size: file.size,
          error: String(error),
        });
        return NextResponse.json(
          {
            error:
              "Запись не удалось обработать. Запишите 15–30 секунд голоса ещё раз.",
          },
          { status: 415 }
        );
      }
    }

    const asset = await storeMediaBuffer({
      buffer: storedBuffer,
      userId: user.id,
      kind,
      filename: storedFilename,
      mimeType: storedMimeType,
    });

    return NextResponse.json({
      token: asset.token,
      url: asset.url,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
    });
  });
}
