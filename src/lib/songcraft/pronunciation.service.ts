import { STRESS_SERVICE_URL } from "./config";
import { logger } from "./logger";

const ACUTE = "\u0301";
const CYRILLIC_VOWEL = /[аеёиоуыэюя]/i;
const UPPERCASE_STRESS_VOWEL = /[АЕЁИОУЫЭЮЯ]/;

export interface AccentLyricsInput {
  lyrics: string;
  recipientName?: string | null;
  recipientPronunciation?: string | null;
  pronunciationHints?: string[];
}

interface StressServiceResponse {
  text?: string;
  engine?: string;
  overridesApplied?: number;
}

export function toSileroStress(value: string): string {
  return value
    .normalize("NFC")
    .replace(new RegExp(`([А-Яа-яЁё])${ACUTE}`, "g"), "+$1");
}

export function fromSileroStress(value: string): string {
  return value.replace(/\+([АЕЁИОУЫЭЮЯаеёиоуыэюя])/g, `$1${ACUTE}`).normalize("NFC");
}

// Suno распознаёт ударение как ЗАГЛАВНУЮ ударную гласную (зАмок vs замОк) — это
// документированный и рабочий способ управления ударением для русского, в т.ч. в
// середине строки. Комбинирующий акут U+0301 Suno игнорирует, поэтому в лирику для
// Suno стресс-маркеры Silero (+гласная) кладём именно как заглавную гласную.
export function sunoStressFromSilero(value: string): string {
  return value
    .replace(/\+([аеёиоуыэюяАЕЁИОУЫЭЮЯ])/g, (_match, vowel: string) => vowel.toUpperCase())
    .normalize("NFC");
}

function uppercaseHintToSilero(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("+") || trimmed.includes(ACUTE)) return toSileroStress(trimmed);

  const letters = Array.from(trimmed);
  const stressIndex = letters.findIndex(
    (letter, index) => index > 0 && UPPERCASE_STRESS_VOWEL.test(letter)
  );
  if (stressIndex === -1) return null;
  letters[stressIndex] = `+${letters[stressIndex].toLowerCase()}`;
  return letters.join("");
}

function hasStress(value: string) {
  return value.includes("+") || value.includes(ACUTE) || uppercaseHintToSilero(value) !== null;
}

export function buildPronunciationOverrides(input: AccentLyricsInput): string[] {
  const hints = [...(input.pronunciationHints ?? [])];
  if (input.recipientPronunciation?.trim()) hints.unshift(input.recipientPronunciation.trim());

  const normalized = hints
    .map((hint) => uppercaseHintToSilero(hint) ?? toSileroStress(hint))
    .filter((hint) => hasStress(hint) && CYRILLIC_VOWEL.test(hint));

  return Array.from(new Set(normalized)).slice(0, 24);
}

function sectionTags(value: string) {
  return value.match(/^\s*\[[^\]\n]+\]\s*$/gm)?.map((tag) => tag.trim()) ?? [];
}

function responseLooksSafe(source: string, accented: string) {
  if (!accented.trim()) return false;
  if (accented.length < source.length * 0.8 || accented.length > source.length * 1.45) return false;
  return JSON.stringify(sectionTags(source)) === JSON.stringify(sectionTags(accented));
}

export async function accentRussianLyrics(input: AccentLyricsInput): Promise<string> {
  const serviceUrl = STRESS_SERVICE_URL();
  if (!serviceUrl || !/[А-Яа-яЁё]/.test(input.lyrics)) return input.lyrics;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${serviceUrl}/accent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: toSileroStress(input.lyrics),
        overrides: buildPronunciationOverrides(input),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`stress service returned ${response.status}`);

    const payload = (await response.json()) as StressServiceResponse;
    const accented = sunoStressFromSilero(payload.text ?? "");
    if (!responseLooksSafe(input.lyrics, accented)) {
      throw new Error("stress service changed lyrics structure");
    }

    logger.info("Russian lyrics accentuated", {
      engine: payload.engine ?? "unknown",
      overridesApplied: payload.overridesApplied ?? 0,
    });
    return accented;
  } catch (error) {
    logger.warn("Russian accentuation unavailable; using original lyrics", {
      error: String(error),
    });
    return input.lyrics;
  } finally {
    clearTimeout(timeout);
  }
}
