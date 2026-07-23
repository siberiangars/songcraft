import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMusicQueue } from "@/lib/songcraft/queue";
import Redis from "ioredis";
import {
  ANTHROPIC_API_KEY,
  BOT_TOKEN,
  REDIS_URL,
  SUNO_API_KEY,
  YOOKASSA_SECRET_KEY,
  YOOKASSA_SHOP_ID,
} from "@/lib/songcraft/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shallow = req.nextUrl.searchParams.get("shallow") === "1";
  const admin = Boolean(
    process.env.ADMIN_SECRET &&
      req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET
  );
  const startedAt = Date.now();
  let database = false;
  let redis = false;
  let worker = shallow;
  let queueCounts: Record<string, number> = {};
  let workerAgeSeconds: number | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  const redisClient = new Redis(REDIS_URL(), {
    lazyConnect: true,
    connectTimeout: 1500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  try {
    await redisClient.connect();
    redis = (await redisClient.ping()) === "PONG";
    if (!shallow) {
      const heartbeat = await redisClient.get("songcraft:worker:heartbeat");
      workerAgeSeconds = heartbeat
        ? Math.max(0, Math.round((Date.now() - Number(heartbeat)) / 1000))
        : null;
      worker = workerAgeSeconds !== null && workerAgeSeconds < 90;
      if (admin) {
        const queue = await getMusicQueue();
        if (queue) {
          queueCounts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
        }
      }
    }
  } catch {
    redis = false;
    worker = false;
  } finally {
    redisClient.disconnect();
  }

  const ok = database && redis && worker;
  const response = {
    ok,
    database,
    redis,
    worker,
    ...(admin
      ? {
          workerAgeSeconds,
          queue: queueCounts,
          uptimeSeconds: Math.round(process.uptime()),
          responseMs: Date.now() - startedAt,
          configuration: {
            telegram: Boolean(BOT_TOKEN()),
            anthropic: Boolean(ANTHROPIC_API_KEY()),
            suno: Boolean(SUNO_API_KEY()),
            yookassa: Boolean(YOOKASSA_SHOP_ID() && YOOKASSA_SECRET_KEY()),
          },
        }
      : {}),
  };

  return NextResponse.json(response, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
