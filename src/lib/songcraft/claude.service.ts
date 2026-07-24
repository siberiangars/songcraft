import Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL,
  DEEPSEEK_API_KEY,
  DEEPSEEK_API_URL,
  DEEPSEEK_MODEL,
  TEXT_AI_PROVIDER,
} from "./config";
import { logger } from "./logger";

function getAnthropicClient() {
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY() });
}

function getDeepSeekClient() {
  return new Anthropic({
    apiKey: DEEPSEEK_API_KEY(),
    baseURL: DEEPSEEK_API_URL(),
  });
}

function songwriterModel() {
  return TEXT_AI_PROVIDER() === "deepseek" ? DEEPSEEK_MODEL() : ANTHROPIC_MODEL();
}

// Современные модели Anthropic (Sonnet 5, Opus 4.7/4.8) не принимают temperature/
// top_p/top_k — вернут 400. Убираем их и явно выключаем thinking, чтобы структурные
// ответы (JSON, тексты с тегами) не съедались бюджетом max_tokens. Вариативность
// трёх версий держится на промпт-блюпринтах, а не на temperature.
function toAnthropicRequest(
  request: Anthropic.Messages.MessageCreateParamsNonStreaming
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const { temperature: _t, top_p: _p, top_k: _k, ...rest } = request;
  return {
    ...rest,
    model: ANTHROPIC_MODEL(),
    // Adaptive thinking: модель реально выполняет «молча проверь рифму/склонение/метр»,
    // чего прямо требуют промпты — главный рычаг качества текста на Sonnet 5.
    // (budget_tokens на sonnet-5 запрещён — 400; disabled душит внутреннюю проверку;
    // adaptive — единственный рабочий режим размышления.) Тип не описан в SDK 0.39.0,
    // но runtime API принимает его для sonnet-5.
    thinking: { type: "adaptive" } as unknown as Anthropic.Messages.ThinkingConfigParam,
    // Запас под размышление + полный текст, чтобы ответ не обрезался по лимиту.
    max_tokens: Math.max(rest.max_tokens ?? 0, 8000),
  };
}

const DEEPSEEK_CLAUDE_COACH = `
DeepSeek execution discipline:
- Work with Claude-level obedience to structure: never add explanations, markdown fences, reports, "вот финальная версия", or any service text.
- Do the reasoning silently. The visible answer must contain only the requested artifact.
- Use a two-pass internal workflow: first draft, then brutally critique hook, rhyme, factual accuracy, natural Russian speech, singability and format, then rewrite weak sections before answering.
- If the hook, rhyme, natural Russian speech, or vocal singability is below 9/10, rewrite the section; do not cosmetically polish it.
- Prefer short concrete Russian phrases over abstract poetic filler.
- Preserve all section tags and exact JSON shape when JSON is requested.
- Never imitate or name real artists. Use only general professional songwriting principles.
`;

function textAiSystem(system?: Anthropic.Messages.MessageCreateParamsNonStreaming["system"]) {
  if (TEXT_AI_PROVIDER() !== "deepseek") return system;
  if (!system) return DEEPSEEK_CLAUDE_COACH.trim();
  if (typeof system === "string") return `${system}\n\n${DEEPSEEK_CLAUDE_COACH.trim()}`;
  return [
    ...system,
    {
      type: "text" as const,
      text: DEEPSEEK_CLAUDE_COACH.trim(),
    },
  ];
}

async function createMessage(input: Anthropic.Messages.MessageCreateParamsNonStreaming) {
  const request = { ...input, system: textAiSystem(input.system) };
  if (TEXT_AI_PROVIDER() !== "deepseek") {
    return getAnthropicClient().messages.create(toAnthropicRequest(request));
  }

  if (!DEEPSEEK_API_KEY()) {
    logger.warn("DeepSeek is selected but the API key is missing; using Anthropic fallback");
    return getAnthropicClient().messages.create(toAnthropicRequest(request));
  }

  try {
    return await getDeepSeekClient().messages.create({
      ...request,
      model: DEEPSEEK_MODEL(),
      thinking: { type: "disabled" },
    });
  } catch (error) {
    if (!ANTHROPIC_API_KEY()) throw error;
    logger.warn("DeepSeek request failed; using Anthropic fallback", {
      model: DEEPSEEK_MODEL(),
      error: String(error),
    });
    return getAnthropicClient().messages.create(toAnthropicRequest(request));
  }
}

export interface EnhanceLyricsParams {
  userText: string;
  recipientName: string;
  recipientPronunciation?: string | null;
  occasion: string;
  genre: string;
  mood: string;
  language: "ru" | "en" | "both";
}

export interface SunoPromptParams {
  genre: string;
  mood: string;
  tempo: string;
  occasion: string;
  voiceType?: "female" | "male" | "child" | string | null;
  userText?: string;
  recipientName?: string;
  customStyle?: string | null;
  variantHint?: string | null;
}

export interface VariantLyricsParams {
  baseLyrics: string;
  userText: string;
  recipientName: string;
  recipientPronunciation?: string | null;
  occasion: string;
  genre: string;
  mood: string;
  language: "ru" | "en" | "both";
  variantHint: string;
}

export interface ProducerDraftParams extends EnhanceLyricsParams {
  mode?: "gift" | "rap";
  tempo?: string;
  voiceType?: "female" | "male" | "child" | string | null;
  customStyle?: string | null;
  trackTitle?: string | null;
}

export interface ProducerDraft {
  title: string;
  lyrics: string;
  stylePrompt: string;
  negativeTags: string;
  pronunciationHints: string[];
  producerNote: string;
}

export interface ReviseProducerLyricsParams extends ProducerDraftParams {
  currentLyrics: string;
  instruction: string;
}

const RUSSIAN_VOWELS = /[АЕЁИОУЫЭЮЯ]/;

function extractText(message: Anthropic.Messages.Message) {
  const block = message.content.find(
    (item): item is Anthropic.Messages.TextBlock => item.type === "text"
  );
  return block?.text.trim() ?? "";
}

const SONG_SECTION_LINE =
  /^\s*\[(?:Intro|Verse(?:\s+\d+)?|Pre-Chorus|Chorus|Bridge|Final Chorus|Outro|Куплет(?:\s+\d+)?|Предприпев|Припев|Бридж|Финальный припев)\]\s*$/gim;
const REQUIRED_VERSE = /\[(?:Verse(?:\s+\d+)?|Куплет(?:\s+\d+)?)\]/i;
const REQUIRED_CHORUS = /\[(?:Chorus|Final Chorus|Припев|Финальный припев)\]/i;
const EDITORIAL_LEAK =
  /(?:вот\s+финальн(?:ая|ый)\s+редактур|я\s+проверил[аи]?\s+текст|что\s+(?:было\s+)?исправлено|готов[а-я]*\s+к\s+загрузке\s+в\s+suno|рекомендую\s+[^\n]{0,100}(?:аранжиров|баллад|ритм-секц))/i;
const TRAILING_EDITORIAL_HEADING =
  /\n\s*(?:#{1,6}\s*)?(?:\*{1,2})?(?:Что\s+(?:было\s+)?исправлено|Комментарий|Пояснение|Примечание|Редакторская заметка|Рекомендации)(?:\*{1,2})?\s*:?/i;

export function sanitizeLyricsOutput(raw: string): string {
  let value = raw.replace(/\r\n?/g, "\n").trim();
  const firstSection = SONG_SECTION_LINE.exec(value);
  SONG_SECTION_LINE.lastIndex = 0;
  if (firstSection) value = value.slice(firstSection.index);

  const closingFence = value.search(/\n\s*```/);
  if (closingFence > 0) value = value.slice(0, closingFence);

  const trailingComment = value.search(TRAILING_EDITORIAL_HEADING);
  if (trailingComment > 0) value = value.slice(0, trailingComment);

  return value
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function isLyricsOutputSafe(value: string): boolean {
  return REQUIRED_VERSE.test(value) && REQUIRED_CHORUS.test(value) && !EDITORIAL_LEAK.test(value);
}

function requireSafeLyrics(raw: string, errorMessage: string): string {
  const sanitized = sanitizeLyricsOutput(raw);
  if (!isLyricsOutputSafe(sanitized)) throw new Error(errorMessage);
  return sanitized;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const withoutFence = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Producer response does not contain JSON");
  return JSON.parse(withoutFence.slice(start, end + 1)) as Record<string, unknown>;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
    : [];
}

function isShortUserText(input: string): boolean {
  const normalized = input.trim().replace(/\s+/g, " ");
  const words = normalized ? normalized.split(" ").length : 0;
  return normalized.length < 120 || words < 18;
}

function withStressMarkOnUppercaseVowel(value: string): string | null {
  const index = value.search(RUSSIAN_VOWELS);
  if (index === -1) return null;
  const vowel = value[index];
  return `${value.slice(0, index)}${vowel.toLowerCase()}\u0301${value.slice(index + 1)}`;
}

function pronunciationHint(
  recipientName: string,
  recipientPronunciation?: string | null
): string | null {
  const explicit = recipientPronunciation?.trim();
  if (explicit) return withStressMarkOnUppercaseVowel(explicit) ?? explicit;
  return withStressMarkOnUppercaseVowel(recipientName.trim());
}

function buildRussianNameRules(
  recipientName: string,
  recipientPronunciation?: string | null
): string {
  const name = recipientName.trim();
  if (!name) {
    return [
      "В брифе нет имени адресата.",
      "Не придумывай имя и не добавляй случайные обращения по имени.",
    ].join("\n");
  }

  const stressed = pronunciationHint(name, recipientPronunciation);
  return [
    "КРИТИЧЕСКИ ВАЖНО: имя должно звучать естественно и с правильным русским ударением.",
    `Имя в исходной форме: "${name}".`,
    stressed ? `Форма для произношения: "${stressed}".` : "",
    "Правила:",
    "1) Склоняй имя только по нормам русского языка.",
    "2) Во всех формах сохраняй ударение на том же слоге.",
    "3) В готовом русском тексте ставь комбинируемый знак ударения над нужной гласной.",
    "4) Не заменяй, не сокращай и не искажай имя без прямой просьбы клиента.",
    "5) Не ставь имя в конец строки только ради слабой рифмы.",
  ]
    .filter(Boolean)
    .join("\n");
}

function languageInstruction(language: "ru" | "en" | "both") {
  if (language === "both") {
    return "Русский язык основной. Английские фразы используй редко и только если они естественно работают как хук.";
  }
  if (language === "en") return "Write the complete song in natural contemporary English.";
  return "Пиши только на естественном современном русском языке.";
}

function tempoToBpm(tempo: string) {
  if (tempo === "slow") return "72-84 BPM";
  if (tempo === "fast") return "118-132 BPM";
  return "92-108 BPM";
}

function voiceDescription(voiceType?: string | null) {
  if (voiceType === "male") return "expressive adult male lead vocal";
  return "expressive adult female lead vocal";
}

function isSpeechForwardGenre(genre?: string | null) {
  return /(?:рэп|хип[ -]?хоп|trap|трэп|rap|hip[ -]?hop)/i.test(genre ?? "");
}

function dictionDirection(genre?: string | null) {
  if (!isSpeechForwardGenre(genre)) {
    return "syllabic lead vocal, one clear syllable per note, precise consonants, no melisma or drawn-out vowels";
  }
  return [
    "speech-forward Russian rap delivery in a comfortable low-to-mid register",
    "close-mic dry vocal with firm consonant attacks and every word fully articulated",
    "short breath-sized bars, one syllable per rhythmic subdivision, no swallowed endings",
    "restrained chant-like hook instead of melodic singing",
    "no melisma, no long held vowels, no high-pitched youthful tone",
  ].join(", ");
}

const PRODUCTION_RULES = `
Ты работаешь как выпускающая продюсерская команда: хит-сонграйтер, редактор современной русской
речи, вокальный продюсер и строгий факт-чекер. Результат должен ощущаться как песня, написанная
для одного конкретного человека, а не как поздравительный шаблон.

Рубрика качества уровня Claude, обязательная перед каждым ответом:
1) Hook test: припев можно пересказать одной сильной фразой, его хочется повторить, он не распадается на список пожеланий.
2) Speech test: каждая строка звучит как современная живая русская речь. Если человек так не сказал бы вслух, строку нужно переписать.
3) Singability test: строка помещается в дыхание, без длинных канцелярских конструкций, без спотыкающихся согласных подряд.
4) Rhyme test: рифма слышна на ударной гласной и согласных, не ломает порядок слов, не требует неверного падежа.
5) Detail test: в куплете есть узнаваемая деталь из брифа или честный нейтральный образ, а не абстрактная похвала.
6) Growth test: Verse 2, Bridge и Final Chorus добавляют новый смысл, а не повторяют уже сказанное.
7) Clean output test: в ответе нет пояснений, редакторских заметок, markdown и служебных фраз.
Если любой тест ниже 9/10, молча перепиши проблемную секцию до финального ответа.

Перед написанием молча собери карту материала:
- подтверждённые факты, которые можно использовать;
- 3–5 самых узнаваемых деталей или сцен;
- одно невысказанное чувство и одна главная мысль;
- центральный образ и хук из 4–8 слов.
Не выводи эту карту. Если история длинная, не пытайся пересказать всё: выбери эмоциональный стержень.

Работай по процессу сильной продюсерской демки:
1) Сначала найди chorus promise: одну фразу "что я на самом деле хочу сказать".
2) Из этой фразы сделай короткий хук с простой артикуляцией, сильной ударной гласной и возможностью повторить его после первого прослушивания.
3) Вокруг хука строй куплеты, а не наоборот. Каждая строка должна либо раскрывать сцену, либо усиливать чувство, либо вести к припеву.
4) Перед финалом молча проверь текст как A&R: хочется ли повторить припев, есть ли конкретика, не звучит ли как открытка, удобно ли это спеть.

ФАКТЫ НЕПРИКОСНОВЕННЫ. Нельзя придумывать даты, места, родственников, события, обещания,
черты характера и детали отношений, которых клиент не сообщал. При нехватке фактов развивай
эмоцию, наблюдение и музыкальный образ, а не биографию.

Критерии сильного текста:
- Verse 1 открывается конкретной сценой или действием, без общего вступления;
- Verse 2 не пересказывает первый, а раскрывает значение этой истории сегодня;
- Pre-Chorus поднимает напряжение: более короткие строки, ожидание, незакрытая мысль перед припевом;
- Chorus можно понять с первого прослушивания: одна мысль, короткий хук, эмоциональная отдача;
- Bridge меняет ракурс или признаётся в том, что раньше не было сказано прямо;
- Final Chorus усиливается одной новой строкой, а не механически копируется;
- в основном 6–11 слогов в строке, естественные паузы и место для вдоха;
- рифма поддерживает разговорную фразу: используй точные и созвучные рифмы, ассонанс,
  внутренние рифмы и цепочки созвучий внутри строки;
- одинаковые секции имеют узнаваемую рифмовку: если Verse 1 держит ABAB или AABB, Verse 2 должен ощущаться так же аккуратно;
- сильная строка важнее полного совпадения окончания: запрещены инверсии, неверные падежи, канцелярит и слова-затычки ради рифмы;
- не рифмуй очевидное с очевидным: "любовь/вновь", "мечты/ты", "душа/хороша", "глаза/слеза" допустимы только при реально свежем образе;
- проверяй ударные гласные в рифмующихся словах: рифма должна звучать, а не только выглядеть на бумаге;
- конкретные существительные и глаголы важнее абстрактных прилагательных;
- имя звучит не чаще 1–2 раз и не ставится в конец строки ради слабой рифмы;
- название берётся из хука или уникального образа, а не из повода праздника.

Современная подача без имитации артистов:
- не называй и не копируй реальных исполнителей, их строки, фирменные фразы или узнаваемые сюжеты;
- бери только общие профессиональные принципы: плотный первый образ, ясный хук, разговорная правда,
  музыкальные повторы, контраст куплет/припев/бридж, экономия слов;
- для рэпа добавляй внутренние рифмы, аллитерацию, точные согласные и фразы, которые можно произнести на одном дыхании;
- для попа и баллады делай припев шире куплета: меньше слов, больше повторяемости, ясная эмоциональная вершина.

Удали всё, что звучит как открытка, реклама или текст нейросети. Запрещены без конкретного смысла:
"сквозь время и пространство", "свет в окне", "сердце поёт", "навсегда в душе", "каждый миг",
"судьба свела", "ты мой маяк", "крылья за спиной", "в этом мире", "день за днём",
"верь в мечту", "дорога судьбы", "огонь в груди", "все преграды позади", "лети к звездам".

Структура для Suno:
[Verse 1]
[Pre-Chorus]
[Chorus]
[Verse 2]
[Chorus]
[Bridge]
[Final Chorus]
[Outro]

Оптимальный объём: 150–220 слов. Не добавляй пояснений, аккордов, служебных комментариев,
имя исполнителя и вокальные междометия, которых не требует драматургия. Ответ обязан начинаться
с тега [Verse 1] и заканчиваться последней строкой [Outro]. Не используй markdown-ограждения
и не пиши вступление, отчёт о правках, рекомендации или комментарии до либо после текста песни.
`;

const VARIANT_BLUEPRINTS = [
  "A: близкая кинематографичная история. Первый кадр - тихая узнаваемая сцена; схема рифм ABAB, припев как личное признание из 4-8 слов, финал широкий, но без пафоса.",
  "B: современный ритмичный поп. Короткие строки, больше глаголов, синкопированный куплет, hook phrase в начале и конце припева, внутренняя рифма в каждой второй строке.",
  "C: органичная живая версия. Центральный образ через предмет или воспоминание, AABB в куплетах, открытый акустический припев, бридж с новым взглядом на ту же историю.",
  "D: эмоциональный поп-гимн без открытки. Широкий припев для совместного пения, простые ударные гласные, сильная последняя строка Final Chorus, название из хука.",
];

const RAP_VARIANT_BLUEPRINTS = [
  "A: взрослый повествовательный рэп. Короткие строки, точные согласные, спокойный низкий регистр, сухая близкая подача, внутренние рифмы 2-3 раза на куплет и речевой хук без распевов.",
  "B: органичный бум-бэп с живыми деталями. Разговорный флоу, плотные созвучия внутри строки, чёткие окончания слов, небольшие паузы и запоминающийся скандируемый хук.",
  "C: тёмный современный трэп без вокальных растяжений. Плотный полутайм, рубленая артикуляция, короткие такты, повторяемый слоговой мотив и уверенный взрослый речитатив.",
];

export function getVariantHint(variantIndex: number, total: number, genre?: string | null): string {
  const blueprints = isSpeechForwardGenre(genre) ? RAP_VARIANT_BLUEPRINTS : VARIANT_BLUEPRINTS;
  if (total <= 1) return blueprints[0];
  return blueprints[Math.min(variantIndex, blueprints.length - 1)];
}

export function buildNegativeTags(input?: {
  genre?: string;
  voiceType?: string | null;
  language?: string;
}) {
  const tags = [
    "mispronounced Russian words",
    "wrong word stress",
    "slurred diction",
    "gibberish",
    "invented lyrics",
    "off-key vocals",
    "harsh sibilance",
    "muddy mix",
    "abrupt ending",
    "excessive melisma",
    "spoken intro",
    "long instrumental intro",
    "repetitive chorus",
  ];
  if (isSpeechForwardGenre(input?.genre)) {
    tags.push(
      "melodic rap verses",
      "sung rap",
      "drawn-out vowels",
      "swallowed consonants",
      "lazy diction",
      "high-pitched youthful vocal",
      "whisper rap",
      "long vocal runs"
    );
  }
  if (input?.genre?.toLowerCase().includes("акуст")) tags.push("synthetic EDM drums");
  if (input?.voiceType === "male") tags.push("female lead vocal");
  if (input?.voiceType === "female") tags.push("male lead vocal");
  return tags.join(", ");
}

export async function expandToFullSongLyrics(params: EnhanceLyricsParams): Promise<string> {
  logger.info("Text AI: expanding short brief", {
    provider: TEXT_AI_PROVIDER(),
    recipientName: params.recipientName,
  });
  const message = await createMessage({
    model: songwriterModel(),
    max_tokens: 1400,
    temperature: 0.75,
    system: `${PRODUCTION_RULES}\n${languageInstruction(params.language)}`,
    messages: [
      {
        role: "user",
        content: `${buildRussianNameRules(params.recipientName, params.recipientPronunciation)}

Создай полный песенный текст объёмом 150-220 слов.
Повод: ${params.occasion}
Жанр: ${params.genre}
Настроение: ${params.mood}

Короткий клиентский бриф:
${params.userText}

Сохрани реальные детали. Найди один эмоциональный тезис и короткий хук; недостающие факты
не выдумывай. Если фактов мало, расширяй не биографию, а универсально честные чувства:
ожидание, благодарность, неловкость признания, тепло момента, желание быть рядом, память о деталях.

Обязательная техника:
- не повторяй короткий бриф дословно чаще одного раза;
- сделай припев самостоятельным, чтобы он работал без знания брифа;
- добавь конкретный, но не выдуманный образ: голос, дорога, кухня, город, вечер, телефон, фотография - только если это не утверждает новый факт;
- рифмы должны быть разговорными и звучащими, без перевернутого порядка слов.

Верни только текст песни с секциями.`,
      },
    ],
  });
  const text = extractText(message);
  if (!text) throw new Error("Не удалось подготовить текст песни");
  return requireSafeLyrics(text, "Текстовая модель вернула служебный текст вместо песни");
}

export async function enhanceLyrics(params: EnhanceLyricsParams): Promise<string> {
  if (isShortUserText(params.userText)) return expandToFullSongLyrics(params);

  logger.info("Text AI: producing full lyrics", {
    provider: TEXT_AI_PROVIDER(),
    recipientName: params.recipientName,
  });
  const message = await createMessage({
    model: songwriterModel(),
    max_tokens: 1500,
    temperature: 0.68,
    system: `${PRODUCTION_RULES}\n${languageInstruction(params.language)}`,
    messages: [
      {
        role: "user",
        content: `${buildRussianNameRules(params.recipientName, params.recipientPronunciation)}

Преврати клиентский бриф в коммерчески сильный текст песни объёмом 150-220 слов.
Повод: ${params.occasion}
Жанр: ${params.genre}
Настроение: ${params.mood}

Клиентский бриф:
${params.userText}

Не пытайся вместить весь рассказ: выбери 3–5 деталей, которые создают узнавание и ведут к одной
главной мысли. Не копируй прозу длинными кусками.

Обязательный продюсерский результат:
- Verse 1: один конкретный кадр, без "ты такая/такой прекрасная";
- Pre-Chorus: 2-4 строки, которые поднимают ожидание;
- Chorus: короткий повторяемый хук, не больше одной мысли;
- Verse 2: другая деталь или сегодняшний смысл, не повтор Verse 1;
- Bridge: признание или поворот, которого не было раньше;
- Final Chorus: тот же хук, но с одной новой сильной строкой.

Перед ответом молча проверь каждую рифму: она должна звучать при пении, не ломать падежи и не заставлять строку говорить неестественно.
Верни только текст песни с секциями.`,
      },
    ],
  });
  const text = extractText(message);
  if (!text) throw new Error("Не удалось улучшить текст песни");
  return requireSafeLyrics(text, "Текстовая модель вернула служебный текст вместо песни");
}

export async function polishLyrics(params: {
  lyrics: string;
  recipientName: string;
  recipientPronunciation?: string | null;
  genre: string;
  mood: string;
  language: "ru" | "en" | "both";
}) {
  const message = await createMessage({
    model: songwriterModel(),
    max_tokens: 1500,
    temperature: 0.35,
    system: `${PRODUCTION_RULES}\n${languageInstruction(params.language)}`,
    messages: [
      {
        role: "user",
        content: `${buildRussianNameRules(params.recipientName, params.recipientPronunciation)}

Проведи финальную редактуру текста перед записью.
Жанр: ${params.genre}
Настроение: ${params.mood}

Молча проведи song doctor pass. Исправь только реальные проблемы:
- слабые или грамматически кривые рифмы;
- строки, которые заметно выбиваются по длине;
- повторы, штампы и неестественные формулировки;
- неверное склонение или ударение имени;
- слишком длинные фразы, которые трудно спеть.
- припев без ясной hook phrase;
- куплет, который начинается с общей фразы вместо конкретного кадра;
- бридж, который не дает нового поворота;
- финальный припев, который просто копирует обычный Chorus.

Рифмы:
- сохрани естественный порядок слов;
- усили созвучия ударных гласных и согласных;
- добавь 1-2 внутренние рифмы там, где строка звучит плоско;
- не используй банальные пары без свежего образа.

Не меняй факты и центральный смысл. Верни только готовый текст:
${params.lyrics}`,
      },
    ],
  });
  const original = sanitizeLyricsOutput(params.lyrics);
  const polished = sanitizeLyricsOutput(extractText(message));
  if (!isLyricsOutputSafe(polished)) {
    logger.warn("Lyrics polish response rejected because it contains commentary or no song structure");
    return original;
  }
  return polished;
}

export async function createVariantLyrics(params: VariantLyricsParams): Promise<string> {
  const message = await createMessage({
    model: songwriterModel(),
    max_tokens: 1500,
    temperature: 0.88,
    system: `${PRODUCTION_RULES}\n${languageInstruction(params.language)}`,
    messages: [
      {
        role: "user",
        content: `${buildRussianNameRules(params.recipientName, params.recipientPronunciation)}

Напиши самостоятельную версию песни на основе того же клиентского брифа.
Повод: ${params.occasion}
Жанр: ${params.genre}
Настроение: ${params.mood}
Продюсерская концепция: ${params.variantHint}

Клиентский бриф:
${params.userText}

Предыдущая версия дана только для контроля фактов:
${params.baseLyrics}

Требования к отличию:
- новый припев и новая ключевая фраза;
- другой первый образ и другой бридж;
- другая рифмовочная схема или другой ритм строк;
- другой способ раскрытия эмоции: сцена, предмет, признание, разговорная фраза или внутренний монолог;
- не более 25% дословно совпадающих строк;
- тот же набор подтверждённых фактов, без новых выдуманных событий.

Качество:
- не делай "вариант B" слабее ради отличия;
- хук должен быть самостоятельным и коммерчески запоминающимся;
- в каждом куплете минимум одна внутренняя рифма или сильное созвучие;
- убери любые строки, которые можно поставить в любую поздравительную песню.

Верни только новый готовый текст с секциями.`,
      },
    ],
  });
  const text = extractText(message);
  if (!text) throw new Error("Не удалось подготовить отдельную версию текста");
  return requireSafeLyrics(text, "Отдельная версия содержит служебный текст");
}

export async function generateSunoPrompt(params: SunoPromptParams): Promise<string> {
  logger.info("Text AI: generating Suno v5.5 style prompt", {
    provider: TEXT_AI_PROVIDER(),
    genre: params.genre,
    mood: params.mood,
  });

  const voice = voiceDescription(params.voiceType);
  const bpm = tempoToBpm(params.tempo);
  const fallback = [
    `${params.genre}, ${params.mood}, ${bpm}`,
    voice,
    "clear Russian diction and natural word stress",
    dictionDirection(params.genre),
    "verse with restrained instrumentation, rising pre-chorus, memorable hook-led chorus",
    "contrasting bridge, wider final chorus, concise outro",
    "radio-ready modern production, warm detailed mix, controlled low end, natural dynamics",
    params.customStyle ?? "",
    params.variantHint ?? "",
  ]
    .filter(Boolean)
    .join(", ");

  const message = await createMessage({
    model: songwriterModel(),
    max_tokens: 500,
    temperature: 0.45,
    messages: [
      {
        role: "user",
        content: `Create one production-ready Suno V5.5 style prompt in English.
Return only the prompt, 350-650 characters, comma-separated but readable.
Never mention real artists, brands, people, dates, or plot facts.

Include:
- exact genre and subgenre;
- ${bpm} and rhythmic feel;
- ${voice};
- core instruments and how the arrangement develops by section;
- vocal delivery, clear Russian diction and correct natural word stress;
- ${dictionDirection(params.genre)};
- mix/master character and a clean musical ending;
- a genuinely different production identity for this version.

Input:
Genre: ${params.genre}
Mood: ${params.mood}
Occasion: ${params.occasion}
Custom direction: ${params.customStyle ?? "none"}
Variant identity: ${params.variantHint ?? "balanced commercial version"}
Brief tone only: ${params.userText?.slice(0, 500) ?? ""}`,
      },
    ],
  });

  const generated = extractText(message).replace(/^["']|["']$/g, "").trim();
  return generated.length >= 120 ? generated.slice(0, 900) : fallback;
}

async function refineProducerDraft(
  params: ProducerDraftParams,
  draft: ProducerDraft
): Promise<ProducerDraft> {
  try {
    const message = await createMessage({
      model: songwriterModel(),
      max_tokens: 2400,
      temperature: 0.34,
      system: `${PRODUCTION_RULES}\n${languageInstruction(params.language)}`,
      messages: [
        {
          role: "user",
          content: `${buildRussianNameRules(params.recipientName, params.recipientPronunciation)}

Ты выпускающий редактор. Это последний контроль перед записью, а не просьба написать другой сюжет.

Исходный клиентский бриф:
${params.userText}

Черновик:
Название: ${draft.title}
Текст:
${draft.lyrics}

Стиль:
${draft.stylePrompt}

Молча оцени по 10-балльной шкале: точность фактов, личную узнаваемость, силу хука,
естественность русской речи, рифму, вокальную удобность, драматургический рост и отсутствие штампов.
Если сила хука, рифма, естественность речи или вокальная удобность ниже 9 - перепиши проблемные секции,
а не полируй их косметически. Не добавляй ни одного нового факта.

Финальные требования:
- 150–220 слов, 3–5 сильных деталей из брифа вместо перечня всей истории;
- хук 4–8 слов, понятный без контекста и связанный с главной эмоцией;
- разные функции у двух куплетов, смысловой поворот в бридже, усиленный Final Chorus;
- современная разговорная русская речь, естественные ударения, падежи и длина строк;
- stylePrompt на английском: точный поджанр, BPM, фирменный звук в первые 5 секунд,
  развитие аранжировки по секциям, вокальная подача, чистая русская дикция, характер микса и финала;
- название 2–5 слов из хука или уникального образа.
- каждая строка должна пройти проверку: "человек так сказал бы вслух?" и "это можно спеть без спотыкания?";
- припев должен иметь одну строку, которую клиент сможет процитировать в сообщении другу;
- в тексте не должно быть строк, которые звучат как универсальное поздравление без личной истории.

Верни только валидный JSON без markdown:
{
  "title": "финальное название",
  "lyrics": "финальный текст с тегами секций",
  "stylePrompt": "финальный Suno V5.5 prompt",
  "negativeTags": "нежелательные свойства",
  "pronunciationHints": [],
  "producerNote": "почему этот хук должен сработать, одним предложением"
}`,
        },
      ],
    });

    const parsed = parseJsonObject(extractText(message));
    const lyrics = sanitizeLyricsOutput(String(parsed.lyrics ?? ""));
    const stylePrompt = String(parsed.stylePrompt ?? "").trim();
    if (lyrics.length < 300 || stylePrompt.length < 120 || !isLyricsOutputSafe(lyrics)) {
      throw new Error("Final producer pass returned an incomplete draft");
    }
    const stress = pronunciationHint(params.recipientName, params.recipientPronunciation);
    return {
      title: String(parsed.title ?? draft.title).trim().slice(0, 80),
      lyrics,
      stylePrompt: stylePrompt.slice(0, 900),
      negativeTags: String(parsed.negativeTags ?? draft.negativeTags).slice(0, 700),
      pronunciationHints: stress ? [stress] : [],
      producerNote: String(parsed.producerNote ?? draft.producerNote).slice(0, 240),
    };
  } catch (error) {
    logger.warn("Final producer pass failed; keeping the first strong draft", {
      error: String(error),
    });
    return draft;
  }
}

export async function prepareProducerDraft(params: ProducerDraftParams): Promise<ProducerDraft> {
  const stress = pronunciationHint(params.recipientName, params.recipientPronunciation);
  const defaultNegativeTags = buildNegativeTags(params);
  const message = await createMessage({
    model: songwriterModel(),
    max_tokens: 2200,
    temperature: 0.72,
    system: `${PRODUCTION_RULES}\n${languageInstruction(params.language)}`,
    messages: [
      {
        role: "user",
        content: `${buildRussianNameRules(params.recipientName, params.recipientPronunciation)}

Подготовь продюсерский черновик песни до отправки в музыкальную модель.
Режим: ${params.mode ?? "gift"}
Повод: ${params.occasion}
Жанр: ${params.genre}
Настроение: ${params.mood}
Темп: ${params.tempo ?? "medium"} (${tempoToBpm(params.tempo ?? "medium")})
Вокал: ${voiceDescription(params.voiceType)}
Пожелание по стилю: ${params.customStyle ?? "нет"}
Название клиента: ${params.trackTitle ?? "не задано"}

Клиентский бриф:
${params.userText}

Сделай это как продюсерская работа:
- выбери один эмоциональный тезис, не пересказывай весь бриф;
- придумай 3 возможных хука молча и используй самый сильный;
- куплеты должны быть разными по функции, но вести к одному припеву;
- рифмы должны звучать на слух: используй созвучия, внутренние рифмы, точные ударения;
- не допускай банальных пар и открыток;
- текст должен ощущаться как готовая песня, а не стихотворение с тегами.

Верни только валидный JSON без markdown:
{
  "title": "логичное красивое название из 2-5 слов",
  "lyrics": "полный текст 150-220 слов с тегами секций",
  "stylePrompt": "англоязычный Suno V5.5 production prompt 450-800 символов без имён артистов",
  "negativeTags": "англоязычный список нежелательных свойств",
  "pronunciationHints": [],
  "producerNote": "одно короткое предложение о центральном хуке"
}

Для negativeTags обязательно учти: ${defaultNegativeTags}
${stress ? `Обязательная подсказка произношения: ${stress}` : ""}`,
      },
    ],
  });

  const parsed = parseJsonObject(extractText(message));
  const title = String(parsed.title ?? params.trackTitle ?? "").trim();
  const lyrics = sanitizeLyricsOutput(String(parsed.lyrics ?? ""));
  const stylePrompt = String(parsed.stylePrompt ?? "").trim();
  if (!title || lyrics.length < 300 || stylePrompt.length < 120 || !isLyricsOutputSafe(lyrics)) {
    throw new Error("Продюсерский черновик получился неполным");
  }

  const firstDraft = {
    title: title.slice(0, 80),
    lyrics,
    stylePrompt: stylePrompt.slice(0, 900),
    negativeTags: String(parsed.negativeTags ?? defaultNegativeTags).slice(0, 700),
    pronunciationHints: stress ? [stress] : [],
    producerNote: String(parsed.producerNote ?? "Текст подготовлен к генерации.").slice(0, 240),
  };
  return refineProducerDraft(params, firstDraft);
}

export async function reviseProducerLyrics(
  params: ReviseProducerLyricsParams
): Promise<ProducerDraft> {
  const message = await createMessage({
    model: songwriterModel(),
    max_tokens: 2200,
    temperature: 0.5,
    system: `${PRODUCTION_RULES}\n${languageInstruction(params.language)}`,
    messages: [
      {
        role: "user",
        content: `${buildRussianNameRules(params.recipientName, params.recipientPronunciation)}

Отредактируй продюсерский черновик строго по пожеланию клиента.
Пожелание: ${params.instruction}
Жанр: ${params.genre}
Настроение: ${params.mood}
Темп: ${params.tempo ?? "medium"}
Исходный бриф: ${params.userText}

Текущий текст:
${params.currentLyrics}

Верни только валидный JSON без markdown:
{
  "title": "обновлённое название",
  "lyrics": "полный обновлённый текст с секциями",
  "stylePrompt": "обновлённый production prompt на английском",
  "negativeTags": "список нежелательных свойств",
  "pronunciationHints": [],
  "producerNote": "что улучшено, одним предложением"
}`,
      },
    ],
  });

  const parsed = parseJsonObject(extractText(message));
  const lyrics = sanitizeLyricsOutput(String(parsed.lyrics ?? ""));
  if (lyrics.length < 300 || !isLyricsOutputSafe(lyrics)) {
    throw new Error("После правки текст получился неполным или содержит служебный комментарий");
  }
  const defaultNegativeTags = buildNegativeTags(params);
  const stress = pronunciationHint(params.recipientName, params.recipientPronunciation);

  return {
    title: String(parsed.title ?? params.trackTitle ?? "Новый трек").trim().slice(0, 80),
    lyrics,
    stylePrompt: String(parsed.stylePrompt ?? "").trim().slice(0, 900),
    negativeTags: String(parsed.negativeTags ?? defaultNegativeTags).slice(0, 700),
    pronunciationHints: stress ? [stress] : [],
    producerNote: String(parsed.producerNote ?? "Текст обновлён.").slice(0, 240),
  };
}
