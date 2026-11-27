import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectSseFrame,
  resolveChatDiagnosticIdentity,
  verifyChatIdentityCookie
} from "../netlify/functions/core/chat-diagnostics.mjs";

const SECRET = "a".repeat(64);

test("chat diagnostic identity persists visitor and conversation for follow-up messages", () => {
  const firstRequest = new Request("https://chocoai.thechocostudios.bond/api/chat", {
    headers: { "x-vercel-forwarded-for": "203.0.113.42", "user-agent": "Test Browser" }
  });
  const first = resolveChatDiagnosticIdentity(firstRequest, { history: [] }, "Jelaskan Eji Design", SECRET);
  assert.match(first.visitorId, /^[0-9a-f-]{36}$/i);
  assert.match(first.conversationId, /^[0-9a-f-]{36}$/i);
  assert.equal(first.conversationTitle, "Jelaskan Eji Design");
  assert.equal(first.ipAddress, "203.0.113.42");
  assert.ok(first.setCookie);

  const followUp = new Request("https://chocoai.thechocostudios.bond/api/chat", {
    headers: { cookie: first.setCookie.split(";")[0], "x-vercel-forwarded-for": "203.0.113.42" }
  });
  const second = resolveChatDiagnosticIdentity(
    followUp, { history: [{ role: "user", content: "Jelaskan Eji Design" }] },
    "Berapa harganya?", SECRET
  );
  assert.equal(second.visitorId, first.visitorId);
  assert.equal(second.conversationId, first.conversationId);
  assert.equal(second.conversationTitle, first.conversationTitle);
  assert.equal(second.setCookie, null);
});

test("a new empty-history chat keeps the visitor but rotates the conversation id", () => {
  const request = new Request("https://chocoai.thechocostudios.bond/api/chat", { headers: {} });
  const first = resolveChatDiagnosticIdentity(request, { history: [] }, "Chat pertama", SECRET);
  const nextRequest = new Request("https://chocoai.thechocostudios.bond/api/chat", {
    headers: { cookie: first.setCookie.split(";")[0] }
  });
  const second = resolveChatDiagnosticIdentity(nextRequest, { history: [] }, "Chat kedua", SECRET);
  assert.equal(second.visitorId, first.visitorId);
  assert.notEqual(second.conversationId, first.conversationId);
  assert.equal(second.conversationTitle, "Chat kedua");
  assert.ok(second.setCookie);
});

test("tampered identity cookies are rejected", () => {
  const request = new Request("https://example.test", {
    headers: { cookie: "choco_chat_identity=v1.11111111-1111-4111-8111-111111111111.22222222-2222-4222-8222-222222222222.invalid" }
  });
  assert.equal(verifyChatIdentityCookie(request, SECRET), null);
});

test("SSE diagnostic parser captures streamed text, finish reason, and DONE", () => {
  const textFrame = inspectSseFrame('data: {"choices":[{"delta":{"content":"Halo"}}]}');
  const finishFrame = inspectSseFrame('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}');
  const doneFrame = inspectSseFrame("data: [DONE]");
  assert.equal(textFrame.characters, 4);
  assert.equal(finishFrame.finishReason, "stop");
  assert.equal(doneFrame.done, true);
});

test("SSE diagnostic parser detects length truncation and provider errors", () => {
  const truncated = inspectSseFrame('data: {"choices":[{"delta":{},"finish_reason":"length"}]}');
  const error = inspectSseFrame('data: {"error":{"message":"rate limited"}}');
  assert.equal(truncated.finishReason, "length");
  assert.equal(error.error, true);
});
