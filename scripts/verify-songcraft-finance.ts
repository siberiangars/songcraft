import assert from "node:assert/strict";
import prisma from "@/lib/prisma";
import { createOrder } from "@/lib/songcraft/order.service";
import { refundOrder } from "@/lib/songcraft/payment.service";

if (!process.env.DATABASE_URL?.includes("songcraft-finance-test")) {
  throw new Error("Refusing to run finance verification outside the isolated test database");
}

const telegramId = "finance-smoke-user";
const basicPrice = 199 * 100;

async function main() {
  const user = await prisma.tgUser.create({
    data: {
      telegramId,
      firstName: "Finance Smoke",
      balance: basicPrice,
      freeCredits: 0,
    },
  });

  const input = {
    telegramId,
    plan: "BASIC" as const,
    recipientName: "Тест",
    occasion: "other",
    userText: "Проверочный текст для безопасного финансового сценария.",
    genre: "поп",
    mood: "спокойное",
    voiceType: "female" as const,
  };

  const orders = await Promise.all([createOrder(input), createOrder(input)]);
  const paid = orders.filter((order) => order.status === "PAID");
  const pending = orders.filter((order) => order.status === "PENDING");
  assert.equal(paid.length, 1, "Only one concurrent order may use the available balance");
  assert.equal(pending.length, 1, "The second concurrent order must remain unpaid");

  const afterCharge = await prisma.tgUser.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(afterCharge.balance, 0, "Balance must never become negative");

  await refundOrder(paid[0].id);
  await refundOrder(paid[0].id);
  await refundOrder(paid[0].id);

  const afterRefund = await prisma.tgUser.findUniqueOrThrow({ where: { id: user.id } });
  const refunds = await prisma.transaction.count({
    where: { orderId: paid[0].id, type: "REFUND" },
  });
  assert.equal(afterRefund.balance, basicPrice, "A paid balance order must be refunded once");
  assert.equal(refunds, 1, "Repeated refund calls must be idempotent");

  await refundOrder(pending[0].id);
  const afterUnpaidRefund = await prisma.tgUser.findUniqueOrThrow({ where: { id: user.id } });
  const unpaidRefunds = await prisma.transaction.count({
    where: { orderId: pending[0].id, type: "REFUND" },
  });
  assert.equal(afterUnpaidRefund.balance, basicPrice, "An unpaid order must not credit balance");
  assert.equal(unpaidRefunds, 0, "An unpaid order must not create a refund transaction");

  console.log("SongCraft finance smoke test passed");
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
