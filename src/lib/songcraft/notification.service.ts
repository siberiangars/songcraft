import { BOT_TOKEN, MINI_APP_URL } from "./config";
import { logger } from "./logger";

type NotifyStatus = "ENHANCING" | "GENERATING" | "COMPLETED" | "FAILED";

const STATUS_MESSAGES: Record<NotifyStatus, string> = {
  ENHANCING: "✍️ Улучшаем ваш текст, делая его более музыкальным...",
  GENERATING: "🎸 Пишем ваш трек. Это займет 2–5 минут...",
  COMPLETED: "🎉 *Твой трек готов!* Нажми кнопку ниже, чтобы послушать и скачать.",
  FAILED: "❌ Произошла ошибка при создании трека. Деньги будут возвращены.",
};

async function sendMessage(chatId: string, text: string, extra?: Record<string, unknown>) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN()}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", ...extra }),
    });
    if (!res.ok) logger.warn("Telegram sendMessage failed", { status: res.status });
  } catch (err) {
    logger.error("Telegram sendMessage error", { err });
  }
}

async function sendAudio(chatId: string, audioUrl: string, caption: string, title: string) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN()}/sendAudio`;
  const safeTitle =
    title
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80) || "Твой трек";
  try {
    const audioResponse = await fetch(audioUrl, { cache: "no-store", redirect: "follow" });
    if (!audioResponse.ok) throw new Error(`Unable to read audio: HTTP ${audioResponse.status}`);
    const contentLength = Number(audioResponse.headers.get("content-length") ?? 0);
    if (contentLength > 49 * 1024 * 1024) throw new Error("Audio is too large for Telegram upload");

    const bytes = await audioResponse.arrayBuffer();
    if (bytes.byteLength > 49 * 1024 * 1024) throw new Error("Audio is too large for Telegram upload");
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("caption", caption);
    form.set("parse_mode", "Markdown");
    form.set("title", safeTitle);
    form.set("performer", "ТВОЙ ТРЕК");
    form.set(
      "audio",
      new Blob([bytes], { type: audioResponse.headers.get("content-type") || "audio/mpeg" }),
      `${safeTitle}.mp3`
    );

    const res = await fetch(url, {
      method: "POST",
      body: form,
    });
    if (!res.ok) logger.warn("Telegram sendAudio upload failed", { status: res.status });
  } catch (err) {
    logger.warn("Telegram audio upload failed; sending by URL", { err: String(err) });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        audio: audioUrl,
        caption,
        parse_mode: "Markdown",
        title: safeTitle,
        performer: "ТВОЙ ТРЕК",
      }),
    }).catch(() => null);
    if (!res?.ok) logger.error("Telegram sendAudio fallback failed", { status: res?.status });
  }
}

export async function notifyStatus(telegramId: string, status: NotifyStatus) {
  await sendMessage(telegramId, STATUS_MESSAGES[status]);
}

export async function notifyCompletion(
  telegramId: string,
  orderId: number,
  track?:
    | { audioUrl: string; recipientName: string; title?: string }
    | { audioUrl: string; recipientName: string; title?: string }[]
) {
  const url = `${MINI_APP_URL()}/order/${orderId}`;

  await sendMessage(telegramId, STATUS_MESSAGES.COMPLETED, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎵 Слушать трек", web_app: { url } }],
        [{ text: "🔗 Открыть по ссылке", url }],
      ],
    },
  });

  await sendMessage(telegramId, "Открыть трек в полном экране:", {
    reply_markup: {
      keyboard: [[{ text: "🎵 Слушать трек", web_app: { url } }]],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });

  const list = Array.isArray(track) ? track : track ? [track] : [];
  for (const item of list) {
    await sendAudio(
      telegramId,
      item.audioUrl,
      "💖 *Лови трек!* Пусть он подарит улыбку и тёплые эмоции.",
      item.title || `Песня для ${item.recipientName}`
    );
  }
}

export async function notifyError(telegramId: string) {
  await sendMessage(telegramId, STATUS_MESSAGES.FAILED);
}

export async function notifySelectionReady(telegramId: string, orderId: number) {
  const url = `${MINI_APP_URL()}/order/${orderId}`;
  await sendMessage(
    telegramId,
    "🎧 *Три версии готовы.* Послушайте их и выберите одну — именно с ней мы соберём ваш клип.",
    {
      reply_markup: {
        inline_keyboard: [[{ text: "Выбрать трек для клипа", web_app: { url } }]],
      },
    }
  );
}

export async function notifyVideoError(telegramId: string, orderId: number) {
  const url = `${MINI_APP_URL()}/order/${orderId}`;
  await sendMessage(telegramId, "Не удалось собрать клип с первого раза. Треки сохранены — откройте заказ и повторите запуск.", {
    reply_markup: {
      inline_keyboard: [[{ text: "Открыть заказ", web_app: { url } }]],
    },
  });
}

export async function notifyPaid(telegramId: string) {
  await sendMessage(telegramId, "✅ Оплата получена! Начинаем создавать твой трек...");
}
