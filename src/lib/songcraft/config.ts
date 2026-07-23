// All env vars are read lazily via process.env - no module-load-time validation
// so Turbopack workspace-root issues don't cause startup failures.

export const PRICING = {
  BASIC: {
    name: "Старт",
    price: 199,
    description: "2 музыкальные версии и сильный текст",
    features: [
      "2 версии трека",
      "Продюсерская доработка текста",
      "Разные аранжировки и вокальная подача",
      "MP3 и постоянное хранение",
    ],
    sunoCredits: 72,
    claudeEnhance: false,
    variantsCount: 2,
    qualityReview: true,
    wav: false,
    stems: false,
    voiceProfile: false,
    freeEdits: 0,
  },
  STANDARD: {
    name: "Pro",
    price: 290,
    description: "3 продюсерские версии с разными хуками",
    features: [
      "3 самостоятельные версии",
      "Предпросмотр и редактор текста",
      "Автопроверка имен и ударений",
      "MP3 + WAV",
      "1 точечная переделка фрагмента",
    ],
    sunoCredits: 72,
    claudeEnhance: true,
    variantsCount: 3,
    qualityReview: true,
    wav: true,
    stems: false,
    voiceProfile: false,
    freeEdits: 1,
    popular: true,
  },
  PREMIUM: {
    name: "Voice Pro",
    price: 399,
    description: "4 версии, собственный голос и студийные файлы",
    features: [
      "4 самостоятельные версии",
      "Генерация с вашим подтвержденным голосом",
      "Продюсерский редактор текста",
      "MP3 + WAV + вокал и инструментал",
      "2 точечные переделки фрагментов",
      "Приоритетная генерация",
    ],
    sunoCredits: 144,
    claudeEnhance: true,
    giftCard: true,
    express: true,
    variantsCount: 4,
    qualityReview: true,
    wav: true,
    stems: true,
    voiceProfile: true,
    freeEdits: 2,
  },
} as const;

export type PlanType = keyof typeof PRICING;

// New checkout always uses one studio offer. Legacy plans remain above so
// already paid orders can still be resumed by the worker.
export const SONG_OFFER = {
  plan: "STANDARD" as const,
  name: "3 сильных трека",
  price: 290,
  regularPrice: 490,
  variantsCount: 3,
} as const;

export const ORDER_ADDONS = {
  cover: { name: "Фото-обложка подарка", price: 90 },
  video: { name: "Видео-слайдшоу из ваших фото", price: 990 },
  spokenIntro: { name: "Голосовое поздравление в начале", price: 290 },
} as const;

export const REFERRAL = { bonusRub: 200, minWithdrawal: 300 };

export const OCCASIONS = [
  { id: "birthday", label: "День рождения", emoji: "🎂" },
  { id: "wedding", label: "Свадьба", emoji: "💍" },
  { id: "anniversary", label: "Юбилей", emoji: "🎉" },
  { id: "love", label: "Признание в любви", emoji: "💕" },
  { id: "justsave", label: "Просто так", emoji: "🌟" },
  { id: "other", label: "Другое", emoji: "✏️" },
] as const;

export const GENRES = [
  { id: "pop", label: "Поп", emoji: "🎤" },
  { id: "ballad", label: "Баллада", emoji: "🎹" },
  { id: "rock", label: "Рок", emoji: "🎸" },
  { id: "jazz", label: "Джаз", emoji: "🎺" },
  { id: "electronic", label: "Электро", emoji: "🎧" },
  { id: "acoustic", label: "Акустика", emoji: "🪕" },
  { id: "hiphop", label: "Хип-хоп", emoji: "🎵" },
  { id: "classical", label: "Классика", emoji: "🎻" },
] as const;

export const MOODS = [
  { id: "romantic", label: "Романтичное", emoji: "💕" },
  { id: "joyful", label: "Веселое", emoji: "🎉" },
  { id: "touching", label: "Трогательное", emoji: "✨" },
  { id: "festive", label: "Торжественное", emoji: "👑" },
  { id: "inspiring", label: "Вдохновляющее", emoji: "✨" },
] as const;

// Runtime env helpers - read at call time, not at import time
export function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const BOT_TOKEN = () => env("BOT_TOKEN");
export const BOT_USERNAME = () => env("BOT_USERNAME", "v3techtrackbot").replace(/^@/, "");
export const ANTHROPIC_API_KEY = () => env("ANTHROPIC_API_KEY");
export const ANTHROPIC_MODEL = () => env("ANTHROPIC_MODEL", "claude-sonnet-5");
export const DEEPSEEK_API_KEY = () => env("DEEPSEEK_API_KEY");
export const DEEPSEEK_API_URL = () =>
  env("DEEPSEEK_API_URL", "https://api.deepseek.com/anthropic").replace(/\/$/, "");
export const DEEPSEEK_MODEL = () => env("DEEPSEEK_MODEL", "deepseek-v4-pro");
export const TEXT_AI_PROVIDER = () =>
  env("TEXT_AI_PROVIDER", DEEPSEEK_API_KEY() ? "deepseek" : "anthropic") as
    | "deepseek"
    | "anthropic";
export const SUNO_API_KEY = () => env("SUNO_API_KEY");
export const SUNO_API_URL = () => env("SUNO_API_URL", "https://api.sunoapi.org/api/v1").replace(/\/$/, "");
export const SUNO_MODEL = () => env("SUNO_MODEL", "V5_5");
export const SUNO_FALLBACK_MODEL = () => env("SUNO_FALLBACK_MODEL", "V5");
export const SUNO_STYLE_WEIGHT = () => Number(env("SUNO_STYLE_WEIGHT", "0.78"));
export const SUNO_WEIRDNESS = () => Number(env("SUNO_WEIRDNESS", "0.34"));
export const SUNO_AUDIO_WEIGHT = () => Number(env("SUNO_AUDIO_WEIGHT", "0.65"));
export const SUNO_CALLBACK_SECRET = () => env("SUNO_CALLBACK_SECRET");
export const SUNO_PROVIDER = () => env("SUNO_PROVIDER", "sunoapi") as "sunoapi" | "kie" | "self";
export const MINI_APP_URL = () => env("MINI_APP_URL", "http://localhost:3001/songcraft");
export const REDIS_URL = () => env("REDIS_URL", "redis://localhost:6379");
export const PUBLIC_BASE_URL = () => env("PUBLIC_BASE_URL", env("NEXTAUTH_URL", "http://localhost:3000")).replace(/\/$/, "");
export const MEDIA_STORAGE_DIR = () => env("MEDIA_STORAGE_DIR", "/app/data/songcraft-media");
export const MAX_AUDIO_UPLOAD_MB = () => Number(env("MAX_AUDIO_UPLOAD_MB", "25"));
export const TELEGRAM_WEBHOOK_SECRET = () => env("TELEGRAM_WEBHOOK_SECRET");
export const YOOKASSA_SHOP_ID = () => env("YOOKASSA_SHOP_ID");
export const YOOKASSA_SECRET_KEY = () => env("YOOKASSA_SECRET_KEY");
export const YOOKASSA_RECEIPT_EMAIL = () => env("YOOKASSA_RECEIPT_EMAIL", "pay@v3techbots.online");
export const STRESS_SERVICE_URL = () => env("STRESS_SERVICE_URL", "").replace(/\/$/, "");

