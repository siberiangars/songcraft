import prisma from "../src/lib/prisma";

const query = process.argv.slice(2).join(" ").trim();

if (!query) {
  throw new Error("Usage: npx tsx scripts/inspect-songcraft-user.ts <name or username>");
}

const users = await prisma.tgUser.findMany({
  where: {
    OR: [
      { firstName: { contains: query } },
      { lastName: { contains: query } },
      { username: { contains: query.replace(/^@/, "") } },
    ],
  },
  select: {
    id: true,
    telegramId: true,
    username: true,
    firstName: true,
    lastName: true,
    balance: true,
    orders: {
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        plan: true,
        recipientName: true,
        recipientPronunciation: true,
        trackTitle: true,
        userText: true,
        enhancedLyrics: true,
        approvedLyrics: true,
        amount: true,
        errorMessage: true,
        createdAt: true,
        songs: {
          where: { isSelected: true },
          orderBy: { variantIndex: "asc" },
          select: {
            id: true,
            title: true,
            variantIndex: true,
            lyricsJson: true,
            createdAt: true,
          },
        },
      },
    },
  },
});

console.log(JSON.stringify(users, null, 2));
await prisma.$disconnect();
