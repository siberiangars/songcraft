import { TELEGRAM_WEBHOOK_SECRET } from "@/lib/songcraft/config";
import { logger } from "@/lib/songcraft/logger";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  const webhookSecret = TELEGRAM_WEBHOOK_SECRET();

  if (webhookSecret && secret !== webhookSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: object;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  logger.info("Webhook received", { update_id: (body as { update_id?: number }).update_id });

  // Process update in background so we respond to Telegram instantly
  setImmediate(async () => {
    try {
      logger.info("Processing update async...");
      const { processUpdate } = await import("@/lib/songcraft/bot");
      logger.info("Module imported, calling processUpdate");
      await processUpdate(body);
      logger.info("processUpdate completed OK");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 4).join(" | ") : "";
      logger.error("Bot update error", { msg, stack });
    }
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "songcraft-bot", bot: "@v3techtrackbot" });
}
