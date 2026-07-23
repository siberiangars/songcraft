import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withTWAAuth } from "../../middleware";
import { publicVoiceProfile, refreshVoiceProfile } from "@/lib/songcraft/voice.service";

async function ownedProfile(id: number, telegramId: string) {
  return prisma.voiceProfile.findFirst({
    where: { id, user: { telegramId } },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTWAAuth(req, async (_, tgUser) => {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
    const profile = await ownedProfile(id, String(tgUser.id));
    if (!profile) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    return NextResponse.json(publicVoiceProfile((await refreshVoiceProfile(profile.id)) ?? profile));
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTWAAuth(req, async (_, tgUser) => {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
    const profile = await ownedProfile(id, String(tgUser.id));
    if (!profile) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    await prisma.voiceProfile.update({
      where: { id: profile.id },
      data: { status: "DELETED", voiceId: null },
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
    return NextResponse.json({ ok: true });
  });
}
