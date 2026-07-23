import prisma from "../src/lib/prisma";

const usernames = process.argv.slice(2).map((value) => value.replace(/^@/, "").trim()).filter(Boolean);
if (!usernames.length) {
  throw new Error("Usage: npx tsx scripts/audit-songcraft-balances.ts <username...>");
}

const users = await prisma.tgUser.findMany({
  where: { username: { in: usernames } },
  select: {
    id: true,
    username: true,
    firstName: true,
    lastName: true,
    balance: true,
    totalSpent: true,
    _count: { select: { orders: true } },
    transactions: {
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        type: true,
        amount: true,
        description: true,
        orderId: true,
        externalId: true,
        createdAt: true,
      },
    },
  },
});

console.log(JSON.stringify(users, null, 2));
await prisma.$disconnect();
