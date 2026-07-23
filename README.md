# SongCraft — персональные песни в подарок

Telegram Mini App: пользователь рассказывает историю → Claude пишет текст → Suno генерирует 3 версии трека → пользователь выбирает лучшую. Допы: фото-обложка, видео-слайдшоу, голосовое интро.

- Бот: [@v3techtrackbot](https://t.me/v3techtrackbot)
- Канал: [t.me/V3SongCraft](https://t.me/V3SongCraft)
- Прод: https://v3techbots.online (Docker, сервер в Германии)

## Стек

Next.js 16 (App Router) · Prisma + SQLite · BullMQ + Redis (воркер генерации) · grammY (бот) · Suno API · Anthropic Claude (тексты) · ЮKassa СБП + Telegram Stars (оплата).

## Запуск локально

```bash
cp .env.example .env   # заполнить ключи
npm install
npx prisma db push
npm run dev            # приложение
npm run worker         # воркер генерации (нужен Redis)
```

## Деплой

`bash deploy.sh` — собирает исходники, копирует на сервер по SSH, пересобирает Docker (app + worker + redis + stress). См. переменные в начале скрипта.

## Структура

- `src/app/songcraft` — Mini App (создание заказа, треки, баланс, партнёрка)
- `src/app/songcraft-admin` — админка
- `src/app/api/songcraft/*` — API (заказы, оплата, вебхуки, медиа)
- `src/lib/songcraft/*` — сервисы (bot, order, payment, suno, claude, media…)
- `src/worker/music.worker.ts` — генерация треков, скоринг качества, доставка
- `tools/`, `content/` (в корне проекта) — контент-конвейер Telegram-канала

## Безопасность

Все секреты только в `.env` (не в коде). На проде обязательны: `TELEGRAM_WEBHOOK_SECRET`, `SUNO_CALLBACK_SECRET`, сильный `ADMIN_SECRET`/`ADMIN_PASSWORD`.
