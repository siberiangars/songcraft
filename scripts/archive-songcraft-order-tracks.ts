import prisma from "../src/lib/prisma";

const orderId = Number(process.argv[2]);
const replacementOrderId = Number(process.argv[3]);

if (!Number.isSafeInteger(orderId) || orderId <= 0) {
  throw new Error(
    "Usage: npx tsx scripts/archive-songcraft-order-tracks.ts <order-id> [replacement-order-id]"
  );
}

const order = await prisma.order.findUnique({
  where: { id: orderId },
  select: { id: true, userId: true, status: true, songs: { select: { id: true, isSelected: true } } },
});
if (!order) throw new Error(`Order ${orderId} not found`);

if (Number.isSafeInteger(replacementOrderId) && replacementOrderId > 0) {
  const replacement = await prisma.order.findUnique({
    where: { id: replacementOrderId },
    select: { id: true, userId: true, status: true, songs: { where: { isSelected: true } } },
  });
  if (!replacement || replacement.userId !== order.userId) {
    throw new Error("Replacement order is missing or belongs to another user");
  }
  if (replacement.status !== "COMPLETED" || replacement.songs.length < 3) {
    throw new Error("Replacement order is not complete");
  }
}

const result = await prisma.song.updateMany({
  where: { orderId, isSelected: true },
  data: { isSelected: false },
});

console.log(JSON.stringify({ orderId, replacementOrderId, archivedTracks: result.count }));
await prisma.$disconnect();
