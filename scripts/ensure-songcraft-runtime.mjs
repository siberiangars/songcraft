const token = process.env.BOT_TOKEN;
const miniAppUrl = process.env.MINI_APP_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "").replace(
  /\/$/,
  ""
);

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(`${method}: ${result.description || `HTTP ${response.status}`}`);
  }
}

async function main() {
  if (!token || !miniAppUrl || !webhookSecret || !publicBaseUrl) {
    console.warn("SongCraft Telegram bootstrap skipped: configuration is incomplete");
    return;
  }

  await telegram("setWebhook", {
    url: `${publicBaseUrl}/api/songcraft/bot`,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query", "pre_checkout_query"],
    drop_pending_updates: false,
    max_connections: 40,
  });
  await telegram("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "🎵 Открыть приложение",
      web_app: { url: miniAppUrl },
    },
  });
  await telegram("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть Mini App" },
      { command: "help", description: "Поддержка и документы" },
    ],
  });

  console.log("SongCraft Telegram webhook and menu are configured");
}

main().catch((error) => {
  console.warn(`SongCraft Telegram bootstrap failed: ${String(error)}`);
});
