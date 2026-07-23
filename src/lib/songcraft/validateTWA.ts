import crypto from "crypto";
import { BOT_TOKEN } from "./config";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export function validateTelegramWebAppData(initData: string): TelegramUser | null {
  // Dev bypass — accept special dev token
  if (process.env.NODE_ENV === "development" && initData === "dev") {
    return { id: 0, first_name: "Dev" };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    params.delete("hash");

    const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const checkString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(BOT_TOKEN())
      .digest();

    const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(checkString)
      .digest("hex");

    if (!/^[a-f0-9]{64}$/i.test(hash)) return null;
    const expectedBuffer = Buffer.from(expectedHash, "hex");
    const receivedBuffer = Buffer.from(hash, "hex");
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return null;
    }

    // Allow up to 24 hours old (1 hour is too strict for dev)
    const authDate = Number(params.get("auth_date"));
    const ageSeconds = Date.now() / 1000 - authDate;
    if (!Number.isFinite(authDate) || ageSeconds > 86400 || ageSeconds < -300) return null;

    const userParam = params.get("user");
    if (!userParam) return null;

    return JSON.parse(userParam) as TelegramUser;
  } catch {
    return null;
  }
}
