import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { prepareProducerDraft } from "@/lib/songcraft/claude.service";
import { logger } from "@/lib/songcraft/logger";
import { withTWAAuth } from "../../middleware";

const workspaceSchema = z.object({
  draftId: z.string().min(1).optional(),
  mode: z.enum(["gift", "rap"]).default("gift"),
  step: z.number().int().min(0).max(8).default(0),
  recipientName: z.string().max(100).default(""),
  recipientPronunciation: z.string().max(100).optional().nullable(),
  trackTitle: z.string().max(80).optional().nullable(),
  occasion: z.string().max(80).default(""),
  userText: z.string().max(3000).default(""),
  genre: z.string().max(100).default(""),
  mood: z.string().max(100).default(""),
  voiceType: z.enum(["female", "male", "child"]).default("female"),
  voiceProfileId: z.number().int().positive().optional().nullable(),
  customStyle: z.string().max(500).optional().nullable(),
  tempo: z.enum(["slow", "medium", "fast"]).default("medium"),
  language: z.enum(["ru", "en", "both"]).default("ru"),
});

const draftSchema = workspaceSchema.extend({
  occasion: z.string().min(1).max(80),
  userText: z.string().min(10).max(3000),
  genre: z.string().min(1).max(100),
});

const editSchema = z.object({
  draftId: z.string().min(1),
  title: z.string().min(1).max(80),
  lyrics: z.string().min(100).max(10000),
});

type DraftRecord = Awaited<ReturnType<typeof prisma.songDraft.findFirst>>;

function parseBrief(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parsePronunciation(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function serializeDraft(record: NonNullable<DraftRecord>, producerNote?: string) {
  return {
    id: record.id,
    revision: record.revision,
    title: record.title,
    lyrics: record.lyrics,
    stylePrompt: record.stylePrompt,
    negativeTags: record.negativeTags ?? "",
    pronunciationHints: parsePronunciation(record.pronunciationJson),
    producerNote:
      producerNote ??
      (record.lyrics.trim()
        ? "Черновик сохранён. Можно продолжить с любого устройства."
        : "История сохранена. Подготовьте текст, когда будет удобно."),
    hasLyrics: record.lyrics.trim().length > 0,
    brief: parseBrief(record.briefJson),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function findUser(telegramId: number) {
  return prisma.tgUser.findUnique({ where: { telegramId: String(telegramId) } });
}

function briefWithoutId(input: z.infer<typeof workspaceSchema>) {
  const brief = { ...input };
  delete brief.draftId;
  return brief;
}

function fallbackTitle(input: z.infer<typeof workspaceSchema>) {
  return (
    input.trackTitle?.trim() ||
    (input.recipientName.trim() ? `Песня для ${input.recipientName.trim()}` : "Новый черновик")
  ).slice(0, 80);
}

export async function GET(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const user = await findUser(tgUser.id);
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const records = await prisma.songDraft.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
    return NextResponse.json(records.map((record) => serializeDraft(record)));
  });
}

export async function PUT(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const parsed = workspaceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const user = await findUser(tgUser.id);
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const input = parsed.data;
    const briefJson = JSON.stringify(briefWithoutId(input));
    const existing = input.draftId
      ? await prisma.songDraft.findFirst({ where: { id: input.draftId, userId: user.id } })
      : null;

    if (existing) {
      const updated = await prisma.songDraft.update({
        where: { id: existing.id },
        data: {
          mode: input.mode,
          briefJson,
          title: existing.lyrics.trim() ? existing.title : fallbackTitle(input),
        },
      });
      return NextResponse.json(serializeDraft(updated));
    }

    const recentDrafts = await prisma.songDraft.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (recentDrafts >= 30) {
      return NextResponse.json({ error: "Слишком много черновиков. Удалите лишние или продолжите последний." }, { status: 429 });
    }

    const created = await prisma.songDraft.create({
      data: {
        userId: user.id,
        mode: input.mode,
        briefJson,
        lyrics: "",
        title: fallbackTitle(input),
        stylePrompt: "",
        negativeTags: null,
        pronunciationJson: null,
      },
    });
    return NextResponse.json(serializeDraft(created));
  });
}

export async function PATCH(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const parsed = editSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const user = await findUser(tgUser.id);
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    const existing = await prisma.songDraft.findFirst({
      where: { id: parsed.data.draftId, userId: user.id },
    });
    if (!existing) return NextResponse.json({ error: "Черновик не найден" }, { status: 404 });

    const updated = await prisma.songDraft.update({
      where: { id: existing.id },
      data: { title: parsed.data.title.trim(), lyrics: parsed.data.lyrics.trim() },
    });
    return NextResponse.json(serializeDraft(updated));
  });
}

export async function POST(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const parsed = draftSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const user = await findUser(tgUser.id);
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const recentGeneratedDrafts = await prisma.songDraft.count({
      where: {
        userId: user.id,
        lyrics: { not: "" },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentGeneratedDrafts >= 15) {
      return NextResponse.json(
        { error: "Слишком много генераций за короткое время. Все тексты сохранены в черновиках." },
        { status: 429 }
      );
    }

    const input = parsed.data;
    const brief = briefWithoutId(input);
    const requested = input.draftId
      ? await prisma.songDraft.findFirst({ where: { id: input.draftId, userId: user.id } })
      : null;
    const record = requested && !requested.lyrics.trim()
      ? await prisma.songDraft.update({
          where: { id: requested.id },
          data: { mode: input.mode, briefJson: JSON.stringify(brief), title: fallbackTitle(input) },
        })
      : await prisma.songDraft.create({
          data: {
            userId: user.id,
            mode: input.mode,
            briefJson: JSON.stringify(brief),
            lyrics: "",
            title: fallbackTitle(input),
            stylePrompt: "",
          },
        });

    try {
      const draft = await prepareProducerDraft(brief);
      const updated = await prisma.songDraft.update({
        where: { id: record.id },
        data: {
          lyrics: draft.lyrics,
          title: draft.title,
          stylePrompt: draft.stylePrompt,
          negativeTags: draft.negativeTags,
          pronunciationJson: JSON.stringify(draft.pronunciationHints),
        },
      });

      return NextResponse.json(serializeDraft(updated, draft.producerNote));
    } catch (error) {
      logger.error("Producer draft failed", {
        telegramId: tgUser.id,
        draftId: record.id,
        error: String(error),
      });
      return NextResponse.json(
        {
          error: "Не удалось подготовить текст. Ваша история сохранена — попробуйте ещё раз позже.",
          draftId: record.id,
        },
        { status: 502 }
      );
    }
  });
}
