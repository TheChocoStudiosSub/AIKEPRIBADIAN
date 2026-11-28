import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectSseFrame,
  observeChatStream,
  resolveChatDiagnosticIdentity,
  verifyChatIdentityCookie
} from "../netlify/functions/core/chat-diagnostics.mjs";

const SECRET = "a".repeat(64);

test("chat diagnostic identity persists visitor and conversation for follow-up messages", () => {
  const firstRequest = new Request("https://chocoai.thechocostudios.bond/api/chat", {
    headers: { "x-vercel-forwarded-for": "203.0.113.42", "user-agent": "Test Browser" }
  });
  const first = resolveChatDiagnosticIdentity(firstRequest, {
    history: [], conversationTitle: "Jelaskan Eji Design"
  }, "Jelaskan Eji Design", SECRET);
  assert.match(first.visitorId, /^[0-9a-f-]{36}$/i);
  assert.match(first.conversationId, /^[0-9a-f-]{36}$/i);
  assert.equal(first.conversationTitle, "Jelaskan Eji Design");
  assert.equal(first.ipAddress, "203.0.113.42");
  assert.ok(first.setCookie);

  const followUp = new Request("https://chocoai.thechocostudios.bond/api/chat", {
    headers: { cookie: first.setCookie.split(";")[0], "x-vercel-forwarded-for": "203.0.113.42" }
  });
  const second = resolveChatDiagnosticIdentity(
    followUp, {
      history: [{ role: "user", content: "Jelaskan Eji Design" }],
      conversationTitle: "Jelaskan Eji Design"
    },
    "Berapa harganya?", SECRET
  );
  assert.equal(second.visitorId, first.visitorId);
  assert.equal(second.conversationId, first.conversationId);
  assert.equal(second.conversationTitle, first.conversationTitle);
  assert.equal(second.setCookie, null);
});

test("a new empty-history chat keeps the visitor but rotates the conversation id", () => {
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";
  const request = new Request("https://chocoai.thechocostudios.bond/api/chat", { headers: {} });
  const first = resolveChatDiagnosticIdentity(request, {
    history: [], conversationId: firstId, conversationTitle: "Chat pertama"
  }, "Chat pertama", SECRET);
  const nextRequest = new Request("https://chocoai.thechocostudios.bond/api/chat", {
    headers: { cookie: first.setCookie.split(";")[0] }
  });
  const second = resolveChatDiagnosticIdentity(nextRequest, {
    history: [], conversationId: secondId, conversationTitle: "Chat kedua"
  }, "Chat kedua", SECRET);
  assert.equal(second.visitorId, first.visitorId);
  assert.notEqual(second.conversationId, first.conversationId);
  assert.equal(second.conversationTitle, "Chat kedua");
  assert.ok(second.setCookie);
});

test("a failed first-turn retry reuses the signed conversation identity with empty history", () => {
  const request = new Request("https://chocoai.thechocostudios.bond/api/chat");
  const first = resolveChatDiagnosticIdentity(request, {
    history: [], conversationTitle: "Percakapan uji"
  }, "Pesan yang gagal", SECRET);
  const retryRequest = new Request("https://chocoai.thechocostudios.bond/api/chat", {
    headers: { cookie: first.setCookie.split(";")[0] }
  });
  const retry = resolveChatDiagnosticIdentity(retryRequest, { history: [] }, "Pesan yang sama", SECRET);

  assert.equal(retry.visitorId, first.visitorId);
  assert.equal(retry.conversationId, first.conversationId);
  assert.equal(retry.conversationTitle, "Percakapan");
  assert.equal(retry.setCookie, null);
});

test("diagnostic titles never fall back to message text and redact common contact data", () => {
  const request = new Request("https://chocoai.thechocostudios.bond/api/chat");
  const noTitle = resolveChatDiagnosticIdentity(request, { history: [] }, "Nama rahasia 081234567890", SECRET);
  assert.equal(noTitle.conversationTitle, "Percakapan");
  assert.doesNotMatch(noTitle.conversationTitle, /Nama rahasia|081234567890/);

  const email = resolveChatDiagnosticIdentity(request, {
    conversationTitle: "Hubungi user@example.com untuk detail"
  }, "ignored", SECRET);
  assert.match(email.conversationTitle, /\[email\]/);
  assert.doesNotMatch(email.conversationTitle, /user@example\.com/i);

  const phone = resolveChatDiagnosticIdentity(request, {
    conversationTitle: "Nomor 081234567890"
  }, "ignored", SECRET);
  assert.match(phone.conversationTitle, /\[phone\]/);
  assert.doesNotMatch(phone.conversationTitle, /081234567890/);

  const url = resolveChatDiagnosticIdentity(request, {
    conversationTitle: "Dokumentasi https://example.test/private"
  }, "ignored", SECRET);
  assert.match(url.conversationTitle, /\[link\]/);
  assert.doesNotMatch(url.conversationTitle, /example\.test/i);
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
  assert.equal(textFrame.bytes, Buffer.byteLength("Halo", "utf8"));
  assert.equal(finishFrame.finishReason, "stop");
  assert.equal(doneFrame.done, true);
});

test("SSE diagnostic parser detects length truncation and provider errors", () => {
  const truncated = inspectSseFrame('data: {"choices":[{"delta":{},"finish_reason":"length"}]}');
  const error = inspectSseFrame('data: {"error":{"message":"rate limited"}}');
  assert.equal(truncated.finishReason, "length");
  assert.equal(error.error, true);
});


test("observed SSE stream completes only after finish reason and DONE", async () => {
  const encoder = new TextEncoder();
  const frames = [
    'data: {"choices":[{"delta":{"content":"Halo"}}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
    "data: [DONE]\n\n"
  ];
  const upstream = new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    }
  });
  let finalStats;
  const response = new Response(observeChatStream(upstream, async (stats) => { finalStats = stats; }));
  const text = await response.text();
  assert.match(text, /Halo/);
  assert.equal(finalStats.requestStatus, "completed");
  assert.equal(finalStats.responseCharacters, 4);
  assert.equal(finalStats.responseBytes, Buffer.byteLength("Halo", "utf8"));
  assert.equal(finalStats.streamDoneReceived, true);
  assert.equal(finalStats.finishReason, "stop");
});

test("observed SSE stream is marked truncated when DONE is absent or finish reason is length", async () => {
  const encoder = new TextEncoder();
  const upstream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Terpotong"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'));
      controller.close();
    }
  });
  let finalStats;
  await new Response(observeChatStream(upstream, async (stats) => { finalStats = stats; })).text();
  assert.equal(finalStats.requestStatus, "truncated");
  assert.equal(finalStats.responseCharacters, 9);
  assert.equal(finalStats.responseBytes, Buffer.byteLength("Terpotong", "utf8"));
  assert.equal(finalStats.streamDoneReceived, false);
  assert.equal(finalStats.finishReason, "length");
});
