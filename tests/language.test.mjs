import test from "node:test";
import assert from "node:assert/strict";
import {
  detectResponseLanguage,
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

test("localizes rate-limit and provider errors", () => {
  assert.match(formatChatMessage("groqRateLimitWait", "en", { seconds: 2 }), /wait about 2 seconds/i);
  assert.match(formatChatMessage("rateLimit", "zh", { seconds: 90 }), /90 秒/);
  assert.match(formatChatMessage("groqUnavailable", "id"), /Groq/);
});

test("language instruction explicitly keeps model replies in the user's language", () => {
  assert.match(getLanguageInstruction("en"), /entirely in English/);
  assert.match(getLanguageInstruction("zh"), /简体中文/);
});
