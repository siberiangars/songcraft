import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withTWAAuth } from "../../middleware";

const trackSchema = z.object({
  event: z.string().min(2).max(80),
  path: z.string().max(300).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
  medium: z.string().max(80).optional().nullable(),
  campaign: z.string().max(120).optional().nullable(),
  content: z.string().max(120).optional().nullable(),
  term: z.string().max(120).optional().nullable(),
  startParam: z.string().max(180).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
  shareToken: z.string().max(120).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

export async function POST(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const parsed = trackSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid marketing event" }, { status: 422 });
    }

    const input = parsed.data;
    const user = await prisma.tgUser.findUnique({
      where: { telegramId: String(tgUser.id) },
      select: {
        id: true,
        acquisitionSource: true,
        acquisitionStartParam: true,
      },
    });
    if (!user) return NextResponse.json({ ok: true });

    const source = clean(input.source);
    const startParam = clean(input.startParam);

    await prisma.$transaction(async (tx) => {
      if (!user.acquisitionSource && (source || startParam)) {
        await tx.tgUser.update({
          where: { id: user.id },
          data: {
            acquisitionSource: source,
            acquisitionMedium: clean(input.medium),
            acquisitionCampaign: clean(input.campaign),
            acquisitionContent: clean(input.content),
            acquisitionTerm: clean(input.term),
            acquisitionStartParam: startParam,
          },
        });
      }

      await tx.marketingEvent.create({
        data: {
          userId: user.id,
          event: clean(input.event) ?? "unknown",
          path: clean(input.path),
          source,
          medium: clean(input.medium),
          campaign: clean(input.campaign),
          content: clean(input.content),
          term: clean(input.term),
          startParam,
          referrer: clean(input.referrer),
          shareToken: clean(input.shareToken),
          metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 2000) : null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  });
}
