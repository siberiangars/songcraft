import assert from "node:assert/strict";
import {
  isLyricsOutputSafe,
  sanitizeLyricsOutput,
} from "../src/lib/songcraft/claude.service";

const leaked = `Вот финальная редактура. Я проверил текст на естественность произношения,
убрал потенциально спорные моменты и сохранил теплоту истории.

\`\`\`text
[Verse 1]
Тот школьный двор хранит наш первый след,
И ты встречал мой автобус на рассвете.

[Chorus]
Нам по-прежнему двадцать пять,
Нам ещё эту песню писать.

[Outro]
Нам по-прежнему двадцать пять.
\`\`\`

**Что было исправлено:** ритм и вокализация.`;

const cleaned = sanitizeLyricsOutput(leaked);
assert.ok(cleaned.startsWith("[Verse 1]"));
assert.ok(cleaned.endsWith("Нам по-прежнему двадцать пять."));
assert.equal(cleaned.includes("Вот финальная редактура"), false);
assert.equal(cleaned.includes("Что было исправлено"), false);
assert.equal(cleaned.includes("```"), false);
assert.equal(isLyricsOutputSafe(cleaned), true);

assert.equal(
  isLyricsOutputSafe("Вот финальная редактура. Я проверил текст и рекомендую поп-балладу."),
  false
);

console.log("Lyrics sanitizer verification passed");
