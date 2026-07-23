import prisma from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");
const RECONCILIATION_ID = "2026-07-16";

async function main() {
  const refunds = await prisma.transaction.findMany({
    where: { type: "REFUND", orderId: { not: null } },
    orderBy: { id: "asc" },
  });

  const byOrder = new Map<number, typeof refunds>();
  for (const refund of refunds) {
    if (refund.orderId == null) continue;
    const group = byOrder.get(refund.orderId) ?? [];
    group.push(refund);
    byOrder.set(refund.orderId, group);
  }

  const duplicateGroups = [...byOrder.entries()].filter(([, group]) => group.length > 1);
  const deductions = new Map<number, number>();
  for (const [, group] of duplicateGroups) {
    for (const duplicate of group.slice(1)) {
      deductions.set(duplicate.userId, (deductions.get(duplicate.userId) ?? 0) + duplicate.amount);
    }
  }

  console.log(JSON.stringify({
    apply: APPLY,
    duplicateOrders: duplicateGroups.map(([orderId, group]) => ({
      orderId,
      refundCount: group.length,
      excessAmount: group.slice(1).reduce((sum, refund) => sum + refund.amount, 0),
    })),
    userDeductions: [...deductions.entries()].map(([userId, amount]) => ({ userId, amount })),
  }, null, 2));

  if (!APPLY || duplicateGroups.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const [orderId, group] of duplicateGroups) {
      const [canonical, ...duplicates] = group;
      if (!canonical.externalId) {
        await tx.transaction.update({
          where: { id: canonical.id },
          data: {
            externalId: `refund:order:${orderId}`,
            metadata: `canonical:reconciled:${RECONCILIATION_ID}`,
          },
        });
      }
      for (const duplicate of duplicates) {
        await tx.transaction.update({
          where: { id: duplicate.id },
          data: { metadata: `invalid:duplicate-refund:reconciled:${RECONCILIATION_ID}` },
        });
      }
    }

    for (const [userId, amount] of deductions) {
      const externalId = `reconcile:duplicate-refunds:${RECONCILIATION_ID}:user:${userId}`;
      const existing = await tx.transaction.findUnique({ where: { externalId } });
      if (existing) continue;

      const deducted = await tx.tgUser.updateMany({
        where: { id: userId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (deducted.count !== 1) {
        throw new Error(`Cannot reconcile user ${userId}: balance is lower than ${amount}`);
      }
      await tx.transaction.create({
        data: {
          externalId,
          userId,
          type: "ADMIN_ADJUSTMENT",
          amount: -amount,
          description: `Reversal of duplicate refunds (${RECONCILIATION_ID})`,
          metadata: `duplicate_refund_reconciliation:${RECONCILIATION_ID}`,
        },
      });
    }
  });

  console.log("Duplicate refund reconciliation applied");
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
