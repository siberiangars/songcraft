import assert from "node:assert/strict";
import prisma from "@/lib/prisma";
import { createOrder } from "@/lib/songcraft/order.service";
import { refundOrder } from "@/lib/songcraft/payment.service";

if (!process.env.DATABASE_URL?.includes("songcraft-billing-test")) {
  throw new Error("Refusing to run billing verification outside the isolated test database");
}

const baseOrder = {
  plan: "BASIC" as const,
  recipientName: "Тест",
  occasion: "other",
  userText: "Тестовый бриф с достаточной длиной для безопасной проверки заказа.",
  genre: "поп",
  mood: "тёплое",
  voiceType: "female" as const,
  tempo: "medium",
  language: "ru",
};

async function run() {
  await prisma.songAction.deleteMany();
  await prisma.song.deleteMany();
  await prisma.sunoTask.deleteMany();
  await prisma.order.deleteMany();
  await prisma.voiceProfile.deleteMany();
  await prisma.songDraft.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.tgUser.deleteMany();

  const emptyUser = await prisma.tgUser.create({
    data: { telegramId: "billing-empty", firstName: "Empty", balance: 0 },
  });
  const unpaid = await createOrder({ telegramId: emptyUser.telegramId, ...baseOrder });
  assert.equal(unpaid.status, "PENDING");
  assert.equal(unpaid.usedBalanceCredit, false);
  await refundOrder(unpaid.id);
  const emptyAfter = await prisma.tgUser.findUniqueOrThrow({ where: { id: emptyUser.id } });
  assert.equal(emptyAfter.balance, 0, "Unpaid order must never create refund credit");
  assert.equal(
    await prisma.transaction.count({ where: { userId: emptyUser.id } }),
    0,
    "Unpaid order must not create payment/refund transactions"
  );

  const fundedUser = await prisma.tgUser.create({
    data: { telegramId: "billing-funded", firstName: "Funded", balance: 50_000 },
  });
  const paid = await createOrder({ telegramId: fundedUser.telegramId, ...baseOrder });
  assert.equal(paid.status, "PAID");
  assert.equal(paid.usedBalanceCredit, true);
  assert.equal(
    (await prisma.tgUser.findUniqueOrThrow({ where: { id: fundedUser.id } })).balance,
    30_100
  );

  await refundOrder(paid.id);
  await refundOrder(paid.id);
  const fundedAfter = await prisma.tgUser.findUniqueOrThrow({ where: { id: fundedUser.id } });
  assert.equal(fundedAfter.balance, 50_000, "Paid order must be refunded exactly once");
  assert.equal(
    await prisma.transaction.count({
      where: { userId: fundedUser.id, type: "REFUND" },
    }),
    1,
    "Duplicate refund events must remain idempotent"
  );

  console.log("SongCraft billing verification passed");
}

run()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
