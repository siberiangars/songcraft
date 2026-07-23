import { Bot, InlineKeyboard, type ApiClientOptions } from "grammy";
import { BOT_TOKEN, MINI_APP_URL, ORDER_ADDONS, PRICING, SONG_OFFER } from "./config";
import { getOrCreateUser, processReferral } from "./order.service";
import { logger } from "./logger";
import https from "https";
import http from "http";
import { ProxyAgent } from "proxy-agent";

// Bot info from @v3techtrackbot - avoids calling getMe().
const BOT_INFO = {
  id: 8207343893,
  is_bot: true as const,
  first_name: "ТВОЙ ТРЕК",
  username: "v3techtrackbot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
};

const proxyAgent = new ProxyAgent();
const grammyFetch = proxyFetch as unknown as NonNullable<ApiClientOptions["fetch"]>;

function proxyFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url instanceof Request ? url.url : String(url));
    const isHttps = targetUrl.protocol === "https:";

    const body = init?.body as string | Buffer | undefined;
    const headers = (init?.headers as Record<string, string>) || {};

    const options: https.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: init?.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...headers,
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
      },
      agent: proxyAgent,
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString("utf-8");
        resolve(
          new Response(text, {
            status: res.statusCode ?? 200,
            headers: res.headers as Record<string, string>,
          })
        );
      });
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

let _bot: Bot | null = null;

export function getBot(): Bot {
  if (!_bot) {
    const useProxy = !!(process.env.HTTPS_PROXY || process.env.https_proxy);
    _bot = new Bot(BOT_TOKEN(), {
      botInfo: BOT_INFO,
      ...(useProxy ? { client: { fetch: grammyFetch } } : {}),
    });
    registerHandlers(_bot);
    logger.info(useProxy ? "Bot instance created with proxy fetch" : "Bot instance created with direct fetch");
  }
  return _bot;
}

export function warmupBot() {
  getBot();
  logger.info("Bot warmed up");
}

function helpKeyboard() {
  return new InlineKeyboard()
    .url("💬 Написать в поддержку", "https://t.me/helpv3techbot")
    .row()
    .webApp("🛡 Политика конфиденциальности", `${MINI_APP_URL()}/privacy`);
}

function helpText() {
  return (
    `❓ *Помощь SongCraft*\n\n` +
    `1. Открой Mini App\n` +
    `2. Заполни историю и выбери дополнения\n` +
    `3. Проверь заказ и оплати по СБП\n` +
    `4. Получи 3 версии трека и выбери лучшую\n\n` +
    `Поддержка: @helpv3techbot`
  );
}

function registerHandlers(bot: Bot) {
  bot.catch((err) => {
    logger.error("grammy error", { msg: String(err.message) });
  });

  bot.command("start", async (ctx) => {
    logger.info("/start triggered", { from: ctx.from?.id });
    const from = ctx.from;
    if (!from) return;

    const keyboard = new InlineKeyboard()
      .webApp("🎵 Открыть Mini App", MINI_APP_URL())
      .row()
      .text("📦 Мои заказы", "my_orders")
      .text("👥 Пригласить друга", "referral")
      .row()
      .text("💰 Стоимость", "pricing")
      .text("❓ Помощь", "help");

    await ctx.reply(
      `🎵 *SongCraft - персональные треки в подарок*\n\n` +
        `Привет, ${from.first_name}!\n\n` +
        `Создай уникальную песню для близкого человека за несколько минут.\n\n` +
        `🎂 День рождения\n💍 Свадьба\n💕 Признание или просто теплый подарок\n\n` +
        `Напиши историю своими словами или наговори ее голосом в Mini App. Мы подготовим 3 версии трека с разным звучанием.\n\n` +
        `Открой Mini App синей кнопкой слева от поля сообщения. Если кнопки не видно, нажми кнопку под этим сообщением.`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );

    logger.info("Reply sent to", { from: from.id });

    getOrCreateUser({
      id: from.id,
      username: from.username,
      first_name: from.first_name,
      last_name: from.last_name,
      language_code: from.language_code,
    })
      .then((user) => {
        const startParam = ctx.match as string | undefined;
        if (startParam?.startsWith("ref_")) {
          processReferral(user.id, startParam.replace("ref_", "")).catch(() => null);
        }
        if (startParam?.startsWith("gift_share_")) {
          import("@/lib/prisma")
            .then(({ default: prisma }) =>
              prisma.$transaction(async (tx) => {
                if (!user.acquisitionSource) {
                  await tx.tgUser.update({
                    where: { id: user.id },
                    data: {
                      acquisitionSource: "share",
                      acquisitionMedium: "gift",
                      acquisitionCampaign: "track_share",
                      acquisitionStartParam: startParam,
                    },
                  });
                }
                await tx.marketingEvent.create({
                  data: {
                    userId: user.id,
                    event: "bot_start_from_shared_track",
                    source: "share",
                    medium: "gift",
                    campaign: "track_share",
                    startParam,
                    shareToken: startParam.replace("gift_share_", ""),
                  },
                });
              })
            )
            .catch(() => null);
        }
      })
      .catch((e) => logger.warn("DB save failed", { e: String(e) }));
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(helpText(), { parse_mode: "Markdown", reply_markup: helpKeyboard() });
  });

  bot.callbackQuery("my_orders", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Все ваши треки и заказы здесь:", {
      reply_markup: new InlineKeyboard().webApp("📦 Мои треки", `${MINI_APP_URL()}/songs`),
    });
  });

  bot.callbackQuery("referral", async (ctx) => {
    await ctx.answerCallbackQuery();
    const from = ctx.from;
    if (!from) return;
    const user = await getOrCreateUser({ id: from.id, first_name: from.first_name });
    const link = `https://t.me/v3techtrackbot?start=ref_${user.referralCode}`;
    await ctx.reply(
      `👥 *Партнерская программа*\n\n` +
        `1 друг = *200 ₽* на ваш баланс.\n` +
        `Бонус начисляется, когда приглашенный друг использует свой подарочный баланс *300 ₽*.\n\n` +
        `Ваша ссылка:\n\`${link}\``,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().webApp("💸 Открыть партнерку", `${MINI_APP_URL()}/partners`),
      }
    );
  });

  bot.callbackQuery("pricing", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `💰 *SongCraft - один понятный заказ*\n\n` +
        `*${SONG_OFFER.name} - ${SONG_OFFER.price} ₽ вместо ${SONG_OFFER.regularPrice} ₽*\n` +
        `Стартовая цена проекта. Три разные версии текста, хука и аранжировки.\n\n` +
        `Дополнительно:\n` +
        `• ${ORDER_ADDONS.cover.name} +${ORDER_ADDONS.cover.price} ₽\n` +
        `• ${ORDER_ADDONS.video.name} +${ORDER_ADDONS.video.price} ₽\n` +
        `• ${ORDER_ADDONS.spokenIntro.name} +${ORDER_ADDONS.spokenIntro.price} ₽`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().webApp("🎵 Создать", `${MINI_APP_URL()}/create`),
      }
    );
  });

  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(helpText(), { parse_mode: "Markdown", reply_markup: helpKeyboard() });
  });

  bot.on("pre_checkout_query", async (ctx) => {
    try {
      const query = ctx.preCheckoutQuery;
      const payload = JSON.parse(query.invoice_payload) as
        | { orderId: number }
        | { kind: "TOPUP"; amountKopeks: number };

      if ("kind" in payload && payload.kind === "TOPUP") {
        const expectedStars = Math.floor(Number(payload.amountKopeks || 0) / 100);
        if (expectedStars <= 0 || query.total_amount !== expectedStars) {
          throw new Error("Некорректная сумма пополнения");
        }
      } else if ("orderId" in payload) {
        const { default: prisma } = await import("@/lib/prisma");
        const order = await prisma.order.findUnique({ where: { id: payload.orderId } });
        const plan = order ? PRICING[order.plan as keyof typeof PRICING] : null;
        if (!order || order.status !== "PENDING" || !plan || query.total_amount !== plan.priceStars) {
          throw new Error("Заказ уже оплачен или сумма изменилась");
        }
      } else {
        throw new Error("Неизвестный платеж");
      }

      await ctx.answerPreCheckoutQuery(true);
    } catch (error) {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: error instanceof Error ? error.message : "Платеж отклонен",
      });
    }
  });

  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;
    try {
      const payload = JSON.parse(payment.invoice_payload) as
        | { orderId: number }
        | { kind: "TOPUP"; topupToken: string; amountKopeks: number };

      if ("kind" in payload && payload.kind === "TOPUP") {
        const from = ctx.from;
        if (!from) return;
        const user = await getOrCreateUser({ id: from.id, first_name: from.first_name });
        const topupAmount = Math.max(0, Number(payload.amountKopeks || 0));
        if (topupAmount > 0) {
          const expectedStars = Math.floor(topupAmount / 100);
          if (payment.total_amount !== expectedStars) {
            throw new Error("Unexpected Stars amount for balance topup");
          }
          const { default: prisma } = await import("@/lib/prisma");
          const externalId = `stars-topup:${payment.telegram_payment_charge_id}`;
          try {
            await prisma.$transaction(async (tx) => {
              const exists = await tx.transaction.findUnique({ where: { externalId } });
              if (exists) return;
              await tx.tgUser.update({
                where: { id: user.id },
                data: { balance: { increment: topupAmount } },
              });
              await tx.transaction.create({
                data: {
                  externalId,
                  userId: user.id,
                  type: "PAYMENT",
                  amount: topupAmount,
                  description: `Stars topup ${Math.floor(topupAmount / 100)} RUB`,
                  metadata: `topup:stars:${payload.topupToken}`,
                },
              });
            });
          } catch (error) {
            if ((error as { code?: string }).code !== "P2002") throw error;
          }
        }
        await ctx.reply(`✅ Баланс пополнен на ${Math.floor(topupAmount / 100)} ₽`);
        return;
      }

      if (!("orderId" in payload)) {
        throw new Error("Unknown payment payload");
      }
      const { processSuccessfulPayment } = await import("./payment.service");
      const { enqueueGeneration } = await import("./queue");
      await processSuccessfulPayment(payload.orderId, payment.telegram_payment_charge_id, payment.total_amount);
      await enqueueGeneration(payload.orderId);
      await ctx.reply("✅ Оплата прошла. Начинаем создавать твой трек.");
    } catch (err) {
      logger.error("Payment error", { err: String(err) });
      await ctx.reply("❌ Ошибка платежа. Напишите в поддержку: @helpv3techbot");
    }
  });
}

export async function processUpdate(update: object): Promise<void> {
  await getBot().handleUpdate(update as Parameters<ReturnType<typeof getBot>["handleUpdate"]>[0]);
}
