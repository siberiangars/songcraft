import { NextRequest, NextResponse } from "next/server";
import { validateTelegramWebAppData, TelegramUser } from "@/lib/songcraft/validateTWA";
import { getOrCreateUser } from "@/lib/songcraft/order.service";

export async function withTWAAuth(
  req: NextRequest,
  handler: (req: NextRequest, tgUser: TelegramUser) => Promise<NextResponse>
): Promise<NextResponse> {
  const initData = req.headers.get("x-telegram-init-data") ?? "";

  const tgUser = validateTelegramWebAppData(initData);
  if (!tgUser) {
    return NextResponse.json(
      { error: "Invalid Telegram auth", hint: "Send x-telegram-init-data header from WebApp" },
      { status: 401 }
    );
  }

  // Upsert user on every authenticated request (including dev user id=0)
  await getOrCreateUser({
    id: tgUser.id,
    first_name: tgUser.first_name,
    last_name: tgUser.last_name,
    username: tgUser.username,
    language_code: tgUser.language_code,
  }).catch(() => null);

  return handler(req, tgUser);
}
