import prisma from "@/lib/prisma";
import { getCustomVoice, getVoiceValidation } from "./suno.service";
import { logger } from "./logger";
import type { VoiceProfile } from "@prisma/client";

function isFailed(status: string) {
  return /fail|error|reject/i.test(status);
}

export async function refreshVoiceProfile(profileId: number) {
  const profile = await prisma.voiceProfile.findUnique({ where: { id: profileId } });
  if (!profile) return null;

  if (profile.status === "VALIDATING" && profile.validationTaskId) {
    try {
      const result = await getVoiceValidation(profile.validationTaskId);
      if (result.phrase) {
        return prisma.voiceProfile.update({
          where: { id: profile.id },
          data: {
            status: "AWAITING_VERIFICATION",
            validationPhrase: result.phrase,
            errorMessage: null,
          },
        });
      }
      if (result.error || isFailed(result.status)) {
        return prisma.voiceProfile.update({
          where: { id: profile.id },
          data: {
            status: "FAILED",
            errorMessage: result.error ?? "Не удалось проверить исходный образец",
          },
        });
      }
    } catch (error) {
      logger.warn("Voice validation status check failed", {
        profileId,
        error: String(error),
      });
    }
  }

  if (profile.status === "CREATING" && profile.voiceTaskId) {
    try {
      const result = await getCustomVoice(profile.voiceTaskId);
      if (result.voiceId) {
        const ready = await prisma.voiceProfile.update({
          where: { id: profile.id },
          data: {
            status: "READY",
            voiceId: result.voiceId,
            errorMessage: null,
          },
        });
        await prisma.mediaAsset.updateMany({
          where: {
            token: {
              in: [profile.sourceMediaToken, profile.verificationMediaToken].filter(
                (token): token is string => Boolean(token)
              ),
            },
          },
          data: { isPublic: false },
        });
        return ready;
      }
      if (result.error || isFailed(result.status)) {
        return prisma.voiceProfile.update({
          where: { id: profile.id },
          data: {
            status: "FAILED",
            errorMessage: result.error ?? "Не удалось создать профиль голоса",
          },
        });
      }
    } catch (error) {
      logger.warn("Voice creation status check failed", {
        profileId,
        error: String(error),
      });
    }
  }

  return profile;
}

export async function listVoiceProfiles(userId: number) {
  const profiles = await prisma.voiceProfile.findMany({
    where: { userId, status: { not: "DELETED" } },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(profiles.map((profile) => refreshVoiceProfile(profile.id)));
}

export function publicVoiceProfile(profile: VoiceProfile | null) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    status: profile.status,
    validationPhrase: profile.validationPhrase,
    language: profile.language,
    style: profile.style,
    errorMessage: profile.errorMessage,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
