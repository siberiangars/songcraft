import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withTWAAuth } from "../../../middleware";
import { getOwnedMediaAsset, publicMediaUrl } from "@/lib/songcraft/media.service";
import { createCustomVoice } from "@/lib/songcraft/suno.service";
import { publicVoiceProfile, refreshVoiceProfile } from "@/lib/songcraft/voice.service";
import { logger } from "@/lib/songcraft/logger";

const verifySchema = z.object({
  verificationMediaToken: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTWAAuth(req, async (_, tgUser) => {
    const profileId = Number((await params).id);
    if (!Number.isInteger(profileId)) {
      return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
    }
    const parsed = verifySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    let profile = await prisma.voiceProfile.findFirst({
      where: { id: profileId, user: { telegramId: String(tgUser.id) } },
    });
    if (!profile) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    profile = (await refreshVoiceProfile(profile.id)) ?? profile;
    if (
      profile.status !== "AWAITING_VERIFICATION" ||
      !profile.validationTaskId ||
      !profile.validationPhrase
    ) {
      return NextResponse.json(
        { error: "Контрольная фраза ещё не готова. Обновите страницу через несколько секунд." },
        { status: 409 }
      );
    }

    const asset = await getOwnedMediaAsset(parsed.data.verificationMediaToken, profile.userId);
    if (!asset || !asset.mimeType.startsWith("audio/")) {
      return NextResponse.json({ error: "Проверочная запись не найдена" }, { status: 404 });
    }

    try {
      const taskId = await createCustomVoice(
        {
          validationTaskId: profile.validationTaskId,
          verifyUrl: publicMediaUrl(asset.token),
          voiceName: profile.name,
          description: "Verified SongCraft customer voice",
          style: profile.style ?? undefined,
          singerSkillLevel: profile.singerSkillLevel as
            | "beginner"
            | "intermediate"
            | "advanced"
            | "professional",
        },
        { kind: "voice_create", voiceProfileId: profile.id }
      );
      const updated = await prisma.voiceProfile.update({
        where: { id: profile.id },
        data: {
          status: "CREATING",
          verificationMediaToken: asset.token,
          voiceTaskId: taskId,
          errorMessage: null,
        },
      });
      return NextResponse.json(publicVoiceProfile(updated));
    } catch (error) {
      logger.error("Voice profile creation failed", {
        profileId: profile.id,
        error: String(error),
      });
      await prisma.voiceProfile.update({
        where: { id: profile.id },
        data: { status: "FAILED", errorMessage: String(error) },
      });
      return NextResponse.json(
        { error: "Не удалось подтвердить голос. Запишите фразу ещё раз без музыки и шума." },
        { status: 502 }
      );
    }
  });
}
