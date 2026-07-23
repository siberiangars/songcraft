import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requestHasAdminSession } from "@/lib/songcraft/admin-auth";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!requestHasAdminSession(req)) return unauthorized();

  const params = req.nextUrl.searchParams;
  const query = (params.get("query") || "").trim().slice(0, 80);
  const filter = params.get("filter") || "all";
  const sort = params.get("sort") || "newest";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const take = 50;

  const conditions: Record<string, unknown>[] = [];
  if (query) {
    conditions.push({
      OR: [
        { username: { contains: query.replace(/^@/, "") } },
        { firstName: { contains: query } },
        { lastName: { contains: query } },
        { telegramId: { contains: query } },
      ],
    });
  }
  if (filter === "customers") conditions.push({ totalSpent: { gt: 0 } });
  if (filter === "balance") conditions.push({ balance: { gt: 0 } });
  if (filter === "issues") conditions.push({ orders: { some: { status: "FAILED" } } });

  const where = conditions.length ? { AND: conditions } : {};
  const orderBy = sort === "balance"
    ? { balance: "desc" as const }
    : sort === "spent"
      ? { totalSpent: "desc" as const }
      : { createdAt: "desc" as const };

  const [users, filteredCount, totalUsers, balance, spent, orders, completed, failed, songs, processing] = await Promise.all([
    prisma.tgUser.findMany({
      where,
      orderBy,
      skip: (page - 1) * take,
      take,
      include: {
        _count: { select: { orders: true, transactions: true, referrals: true } },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, plan: true, createdAt: true },
        },
      },
    }),
    prisma.tgUser.count({ where }),
    prisma.tgUser.count(),
    prisma.tgUser.aggregate({ _sum: { balance: true } }),
    prisma.tgUser.aggregate({ _sum: { totalSpent: true } }),
    prisma.order.count(),
    prisma.order.count({ where: { status: "COMPLETED" } }),
    prisma.order.count({ where: { status: "FAILED" } }),
    prisma.song.count(),
    prisma.order.count({ where: { status: { in: ["PAID", "PROCESSING", "ENHANCING", "GENERATING"] } } }),
  ]);

  return NextResponse.json({
    summary: {
      users: totalUsers,
      balance: balance._sum.balance || 0,
      spent: spent._sum.totalSpent || 0,
      orders,
      completed,
      failed,
      songs,
      processing,
    },
    users: users.map((user) => ({
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      balance: user.balance,
      totalSpent: user.totalSpent,
      freeCredits: user.freeCredits,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      orderCount: user._count.orders,
      transactionCount: user._count.transactions,
      referralCount: user._count.referrals,
      lastOrder: user.orders[0] || null,
    })),
    pagination: { page, take, total: filteredCount, pages: Math.max(1, Math.ceil(filteredCount / take)) },
  }, { headers: { "Cache-Control": "no-store" } });
}
