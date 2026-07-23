import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPronunciationOverrides,
  fromSileroStress,
  toSileroStress,
} from "./pronunciation.service";

test("converts combining acute marks to Silero markers and back", () => {
  assert.equal(toSileroStress("Татья\u0301на"), "Тать+яна");
  assert.equal(fromSileroStress("Тать+яна"), "Татья\u0301на".normalize("NFC"));
});

test("understands an uppercase vowel as a client stress hint", () => {
  assert.deepEqual(
    buildPronunciationOverrides({
      lyrics: "Для Татьяны",
      recipientPronunciation: "ТатьЯна",
    }),
    ["Тать+яна"]
  );
});

test("keeps explicit producer hints and removes duplicates", () => {
  assert.deepEqual(
    buildPronunciationOverrides({
      lyrics: "Новый трек",
      pronunciationHints: ["тр+ек", "тр+ек", "вайб"],
    }),
    ["тр+ек"]
  );
});
