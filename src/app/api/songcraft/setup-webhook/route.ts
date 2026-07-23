import { NextRequest, NextResponse } from "next/server";
import { BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } from "@/lib/songcraft/config";

export async function GET(req: NextRequest) {
  const adminSecret = req.nextUrl.searchParams.get("secret");
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const webhookUrl = `${proto}://${host}/api/songcraft/bot`;

  const result = await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: TELEGRAM_WEBHOOK_SECRET(),
      allowed_updates: ["message", "callback_query", "pre_checkout_query"],
    }),
  });

  const data = await result.json();
  return NextResponse.json({ webhookUrl, telegramResponse: data });
}
