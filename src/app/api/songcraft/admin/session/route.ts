import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  SONGCRAFT_ADMIN_COOKIE,
  adminCookieOptions,
  adminSessionValue,
  isAdminConfigured,
  requestHasAdminSession,
  verifyAdminPassword,
} from "@/lib/songcraft/admin-auth";

const loginSchema = z.object({ password: z.string().min(1).max(256) });
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function GET(req: NextRequest) {
  return NextResponse.json(
    { authenticated: requestHasAdminSession(req), configured: isAdminConfigured() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Админ-пароль не настроен" }, { status: 503 });
  }

  const key = clientKey(req);
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.resetAt > now && current.count >= 8) {
    return NextResponse.json({ error: "Слишком много попыток. Подождите 15 минут." }, { status: 429 });
  }

  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !verifyAdminPassword(parsed.data.password)) {
    const next = current && current.resetAt > now
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + 15 * 60 * 1000 };
    attempts.set(key, next);
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  attempts.delete(key);
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(SONGCRAFT_ADMIN_COOKIE, adminSessionValue(), adminCookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SONGCRAFT_ADMIN_COOKIE, "", { ...adminCookieOptions, maxAge: 0 });
  return response;
}
