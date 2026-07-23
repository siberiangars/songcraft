import { NextRequest, NextResponse } from "next/server";
import { withTWAAuth } from "../../middleware";
import prisma from "@/lib/prisma";
import { BOT_USERNAME } from "@/lib/songcraft/config";

export async function GET(req: NextRequest) {
  return withTWAAuth(req, async (_, tgUser) => {
    const user = await prisma.tgUser.findUnique({
      where: { telegramId: String(tgUser.id) },
      include: {
        _count: { select: { orders: true, referrals: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [referralAgg, completedOrders, readyTracks] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          userId: user.id,
          type: "REFERRAL_BONUS",
        },
        _sum: { amount: true },
      }),
      prisma.order.count({ where: { userId: user.id, status: "COMPLETED" } }),
      prisma.song.count({ where: { order: { userId: user.id }, isSelected: true } }),
    ]);

    return NextResponse.json({
      id: user.id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      balance: user.balance,
      totalSpent: user.totalSpent,
      totalOrders: user._count.orders,
      completedOrders,
      readyTracks,
      totalReferrals: user._count.referrals,
      referralEarned: referralAgg._sum.amount ?? 0,
      referralCode: user.referralCode,
      referralLink: `https://t.me/${BOT_USERNAME()}?start=ref_${user.referralCode}`,
    });
  });
}
