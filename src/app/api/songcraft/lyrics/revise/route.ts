import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ProducerDraftParams,
  reviseProducerLyrics,
} from "@/lib/songcraft/claude.service";
import { logger } from "@/lib/songcraft/logger";
import { withTWAAuth } from "../../middleware";

const revisionSchema = z.object({
  draftId: z.string().min(1),
  instruction: z.string().min(3).max(1000),
  currentLyrics: z.string().min(100).max(10000).optional(),
  currentTitle: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const parsed = revisionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const user = await prisma.tgUser.findUnique({
      where: { telegramId: String(tgUser.id) },
    });
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const saved = await prisma.songDraft.findFirst({
      where: { id: parsed.data.draftId, userId: user.id },
    });
    if (!saved) return NextResponse.json({ error: "Черновик не найден" }, { status: 404 });
    if (saved.revision >= 8) {
      return NextResponse.json(
        { error: "Лимит автоматических правок исчерпан. Текст можно отредактировать вручную." },
        { status: 429 }
      );
    }

    try {
      const brief = JSON.parse(saved.briefJson) as ProducerDraftParams;
      const draft = await reviseProducerLyrics({
        ...brief,
        trackTitle: parsed.data.currentTitle ?? saved.title,
        currentLyrics: parsed.data.currentLyrics ?? saved.lyrics,
        instruction: parsed.data.instruction,
      });

      const updated = await prisma.songDraft.update({
        where: { id: saved.id },
        data: {
          title: draft.title,
          lyrics: draft.lyrics,
          stylePrompt: draft.stylePrompt,
          negativeTags: draft.negativeTags,
          pronunciationJson: JSON.stringify(draft.pronunciationHints),
          revision: { increment: 1 },
        },
      });

      return NextResponse.json({
        id: updated.id,
        revision: updated.revision,
        ...draft,
      });
    } catch (error) {
      logger.error("Producer revision failed", {
        draftId: saved.id,
        error: String(error),
      });
      return NextResponse.json(
        { error: "Не удалось применить правку. Сформулируйте её короче и попробуйте снова." },
        { status: 502 }
      );
    }
  });
}

