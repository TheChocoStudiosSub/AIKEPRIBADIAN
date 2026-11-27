import test from "node:test";
import assert from "node:assert/strict";
import {
  detectResponseLanguage,
  resolveResponseLanguage,
  normalizeResponseLanguage,
  formatChatMessage,
  getLanguageInstruction
} from "../netlify/functions/core/language.mjs";

test("detects English follow-up questions instead of falling back to Indonesian", () => {
  assert.equal(detectResponseLanguage("who created you choco? tell me"), "en");
  assert.equal(detectResponseLanguage("who this guy?"), "en");
  assert.equal(detectResponseLanguage("what are the other websites from TCS?"), "en");
});

test("detects Indonesian messages", () => {
  assert.equal(detectResponseLanguage("halo choco"), "id");
  assert.equal(detectResponseLanguage("bisa berbicara bahasa inggris?"), "id");
});

test("uses recent user language for short ambiguous follow-ups", () => {
  assert.equal(detectResponseLanguage("yes", [
    { role: "user", content: "Who created you?" }
  ]), "en");
  assert.equal(detectResponseLanguage("iya", [
    { role: "user", content: "Who created you?" },
    { role: "user", content: "iya" }
  ]), "en");
});

test("detects Simplified Chinese", () => {
  assert.equal(detectResponseLanguage("你是谁？"), "zh");
});

test("selected UI language overrides the language of the message and conversation history", () => {
  const history = [{ role: "user", content: "Apa fungsi TCS LinkGuard?" }];
  assert.equal(resolveResponseLanguage("en", "Apa fungsi TCS LinkGuard?", history), "en");
  assert.equal(resolveResponseLanguage("zh-CN", "What does TCS LinkGuard do?", history), "zh");
  assert.equal(resolveResponseLanguage("id", "Who created Choco AI?", []), "id");
});

test("validates language selector values and falls back safely for unsupported values", () => {
  assert.equal(normalizeResponseLanguage("EN-us"), "en");
  assert.equal(normalizeResponseLanguage("zh-Hans"), "zh");
  assert.equal(normalizeResponseLanguage("fr"), null);
  assert.equal(resolveResponseLanguage("fr", "Who created Choco AI?"), "en");
  assert.equal(resolveResponseLanguage(null, "apa fungsi LinkGuard?"), "id");
});

test("localizes rate-limit and provider errors", () => {
  assert.match(formatChatMessage("groqRateLimitWait", "en", { seconds: 2 }), /wait about 2 seconds/i);
  assert.match(formatChatMessage("rateLimit", "zh", { seconds: 90 }), /90 秒/);
  assert.match(formatChatMessage("groqUnavailable", "id"), /Groq/);
});

test("language instruction explicitly keeps model replies in the user's language", () => {
  assert.match(getLanguageInstruction("en"), /selected English.*entirely in English/i);
  assert.match(getLanguageInstruction("zh"), /选择了简体中文/);
});
