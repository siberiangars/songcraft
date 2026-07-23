import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withTWAAuth } from "../../../middleware";
import { PRICING, PlanType } from "@/lib/songcraft/config";
import { enqueueSongAction } from "@/lib/songcraft/queue";

const actionSchema = z
  .object({
    type: z.enum(["replace_section", "cover", "extend", "wav", "stems"]),
    startS: z.number().min(0).max(900).optional(),
    endS: z.number().min(1).max(900).optional(),
    replacementLyrics: z.string().max(3000).optional(),
    prompt: z.string().max(5000).optional(),
    style: z.string().max(1000).optional(),
    title: z.string().max(80).optional(),
    continueAt: z.number().min(1).max(900).optional(),
    uploadMediaToken: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "replace_section") {
      if (value.startS === undefined || value.endS === undefined || !value.replacementLyrics) {
        ctx.addIssue({
          code: "custom",
          message: "Для замены фрагмента нужны начало, конец и новый текст",
        });
      } else if (value.endS - value.startS < 5 || value.endS - value.startS > 30) {
        ctx.addIssue({
          code: "custom",
          message: "Заменяемый фрагмент должен длиться от 5 до 30 секунд",
        });
      }
    }
  });

async function ownedSong(songId: number, telegramId: string) {
  return prisma.song.findFirst({
    where: { id: songId, order: { user: { telegramId } } },
    include: { order: { include: { user: true } } },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTWAAuth(req, async (_, tgUser) => {
    const songId = Number((await params).id);
    if (!Number.isInteger(songId)) {
      return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
    }
    const song = await ownedSong(songId, String(tgUser.id));
    if (!song) return NextResponse.json({ error: "Трек не найден" }, { status: 404 });
    const actions = await prisma.songAction.findMany({
      where: { songId: song.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(actions);
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTWAAuth(req, async (_, tgUser) => {
    const songId = Number((await params).id);
    if (!Number.isInteger(songId)) {
      return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
    }
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const song = await ownedSong(songId, String(tgUser.id));
    if (!song) return NextResponse.json({ error: "Трек не найден" }, { status: 404 });
    const plan = PRICING[song.order.plan as PlanType];
    if (!plan) return NextResponse.json({ error: "Тариф заказа не найден" }, { status: 409 });

    if (parsed.data.type === "wav" && !plan.wav) {
      return NextResponse.json({ error: "WAV доступен в тарифах Pro и Voice Pro" }, { status: 403 });
    }
    if (parsed.data.type === "stems" && !plan.stems) {
      return NextResponse.json(
        { error: "Вокал и инструментал доступны в тарифе Voice Pro" },
        { status: 403 }
      );
    }
    if (["replace_section", "cover", "extend"].includes(parsed.data.type)) {
      const usedEdits = await prisma.songAction.count({
        where: {
          userId: song.order.userId,
          song: { orderId: song.orderId },
          type: { in: ["replace_section", "cover", "extend"] },
          status: { in: ["PENDING", "PROCESSING", "COMPLETED"] },
        },
      });
      if (usedEdits >= plan.freeEdits) {
        return NextResponse.json(
          { error: "Бесплатные продюсерские правки по этому заказу уже использованы" },
          { status: 403 }
        );
      }
    }

    const duplicate = await prisma.songAction.findFirst({
      where: {
        songId: song.id,
        type: parsed.data.type,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    if (duplicate) {
      return NextResponse.json(duplicate, { status: 202 });
    }

    const action = await prisma.songAction.create({
      data: {
        userId: song.order.userId,
        songId: song.id,
        type: parsed.data.type,
        inputJson: JSON.stringify(parsed.data),
      },
    });
    const jobId = await enqueueSongAction(action.id);
    if (!jobId) {
      await prisma.songAction.update({
        where: { id: action.id },
        data: { status: "FAILED", errorMessage: "Очередь обработки временно недоступна" },
      });
      return NextResponse.json(
        { error: "Сервис обработки временно недоступен" },
        { status: 503 }
      );
    }

    return NextResponse.json({ ...action, jobId }, { status: 202 });
  });
}
