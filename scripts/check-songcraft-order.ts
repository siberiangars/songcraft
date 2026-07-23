import prisma from "../src/lib/prisma";
import { isLyricsOutputSafe, sanitizeLyricsOutput } from "../src/lib/songcraft/claude.service";

const orderId = Number(process.argv[2]);
if (!Number.isSafeInteger(orderId) || orderId <= 0) {
  throw new Error("Usage: npx tsx scripts/check-songcraft-order.ts <order-id>");
}

const order = await prisma.order.findUnique({
  where: { id: orderId },
  select: {
    id: true,
    status: true,
    amount: true,
    errorMessage: true,
    createdAt: true,
    updatedAt: true,
    user: { select: { username: true, firstName: true, balance: true } },
    songs: {
      where: { isSelected: true },
      orderBy: { variantIndex: "asc" },
      select: { id: true, title: true, variantIndex: true, lyricsJson: true, audioUrl: true },
    },
  },
});

if (!order) throw new Error(`Order ${orderId} not found`);

console.log(
  JSON.stringify(
    {
      ...order,
      songs: order.songs.map((song) => {
        let source = "";
        const rawLyricsJson = song.lyricsJson ?? "";
        try {
          source = String(JSON.parse(rawLyricsJson || "{}").source ?? "");
        } catch {}
        const cleaned = sanitizeLyricsOutput(source);
        const leakPattern = /вот финальная редактура|я проверил[аи]? текст|что было исправлено/i;
        return {
          id: song.id,
          title: song.title,
          variantIndex: song.variantIndex,
          audioUrl: song.audioUrl,
          lyricsSafe: isLyricsOutputSafe(cleaned),
          editorialLeak: leakPattern.test(source),
          audioTranscriptLeak: leakPattern.test(rawLyricsJson),
          lyricsStart: cleaned.slice(0, 100),
          lyricsEnd: cleaned.slice(-100),
        };
      }),
    },
    null,
    2
  )
);

await prisma.$disconnect();
