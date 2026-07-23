import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withTWAAuth } from "../middleware";
import { getOwnedMediaAsset, publicMediaUrl } from "@/lib/songcraft/media.service";
import { createVoiceValidationTask } from "@/lib/songcraft/suno.service";
import { listVoiceProfiles, publicVoiceProfile } from "@/lib/songcraft/voice.service";
import { logger } from "@/lib/songcraft/logger";

const createVoiceSchema = z.object({
  name: z.string().min(2).max(50),
  sourceMediaToken: z.string().min(1),
  vocalStartS: z.number().min(0).max(300).default(0),
  vocalEndS: z.number().min(5).max(300),
  language: z.string().min(2).max(10).default("ru"),
  style: z.string().max(200).optional(),
  singerSkillLevel: z
    .enum(["beginner", "intermediate", "advanced", "professional"])
    .default("intermediate"),
  consent: z.literal(true),
});

export async function GET(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const user = await prisma.tgUser.findUnique({
      where: { telegramId: String(tgUser.id) },
    });
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    const profiles = await listVoiceProfiles(user.id);
    return NextResponse.json(profiles.map(publicVoiceProfile).filter(Boolean));
  });
}

export async function POST(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const parsed = createVoiceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const user = await prisma.tgUser.findUnique({
      where: { telegramId: String(tgUser.id) },
    });
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const asset = await getOwnedMediaAsset(parsed.data.sourceMediaToken, user.id);
    if (!asset || !asset.mimeType.startsWith("audio/")) {
      return NextResponse.json({ error: "Исходный аудиофайл не найден" }, { status: 404 });
    }
    if (parsed.data.vocalEndS - parsed.data.vocalStartS < 5) {
      return NextResponse.json(
        { error: "Для профиля голоса нужно минимум 5 секунд чистого вокала" },
        { status: 422 }
      );
    }

    const profile = await prisma.voiceProfile.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        status: "VALIDATING",
        sourceMediaToken: asset.token,
        language: parsed.data.language,
        style: parsed.data.style,
        singerSkillLevel: parsed.data.singerSkillLevel,
        consentAt: new Date(),
      },
    });

    try {
      const taskId = await createVoiceValidationTask(
        {
          voiceUrl: publicMediaUrl(asset.token),
          vocalStartS: parsed.data.vocalStartS,
          vocalEndS: parsed.data.vocalEndS,
          language: parsed.data.language,
        },
        { kind: "voice_validate", voiceProfileId: profile.id }
      );
      const updated = await prisma.voiceProfile.update({
        where: { id: profile.id },
        data: { validationTaskId: taskId },
      });
      return NextResponse.json(publicVoiceProfile(updated), { status: 201 });
    } catch (error) {
      logger.error("Voice validation task creation failed", {
        profileId: profile.id,
        error: String(error),
      });
      await prisma.voiceProfile.update({
        where: { id: profile.id },
        data: { status: "FAILED", errorMessage: String(error) },
      });
      return NextResponse.json(
        { error: "Не удалось начать проверку голоса. Попробуйте другой образец." },
        { status: 502 }
      );
    }
  });
}
