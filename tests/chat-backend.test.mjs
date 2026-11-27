import test from "node:test";
import assert from "node:assert/strict";
import chatHandler from "../netlify/functions/chat.js";

const trackedEnv = [
  "GROQ_API_KEY",
  "TCS_KNOWLEDGE_SUPABASE_URL",
  "TCS_KNOWLEDGE_PUBLISHABLE_KEY",
  "TCS_OWNER_AUTH_SERVER_KEY"
];
const originalEnv = Object.fromEntries(trackedEnv.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

test("chat endpoint rejects non-POST methods", async () => {
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "GET"
  }));
  assert.equal(response.status, 405);
  assert.match((await response.json()).error, /POST/);
});

test("chat endpoint rejects malformed JSON without calling Groq", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  }));
  assert.equal(response.status, 400);
});

test("chat endpoint rejects an empty message", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "   " })
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /kosong/i);
});

test("chat endpoint rejects messages over the published character limit", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "x".repeat(4001) })
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /4000/);
});

test("chat endpoint rejects JSON arrays and null bodies", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  for (const body of ["[]", "null"]) {
    const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    }));
    assert.equal(response.status, 400);
  }
});

test("chat endpoint enforces the distributed rate-limit response contract", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  process.env.TCS_KNOWLEDGE_SUPABASE_URL = "https://knowledge.example.test";
  process.env.TCS_KNOWLEDGE_PUBLISHABLE_KEY = "publishable-test-key";
  process.env.TCS_OWNER_AUTH_SERVER_KEY = "test-server-key-only";

  let forwardedPayload;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://knowledge.example.test/rest/v1/rpc/tcs_chat_consume_rate_limit");
    forwardedPayload = JSON.parse(init.body);
    return new Response(JSON.stringify({
      ok: true,
      allowed: false,
      remaining: 0,
      retry_after_seconds: 90
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-vercel-forwarded-for": "203.0.113.7" },
    body: JSON.stringify({ message: "pertanyaan tentang TCS", stream: true })
  }));

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "90");
  assert.match((await response.json()).error, /Batas sementara/);
  assert.equal(forwardedPayload.p_scope, "chat");
  assert.match(forwardedPayload.p_subject_hash, /^[0-9a-f]{64}$/);
  assert.equal(forwardedPayload.p_window_seconds, 600);
  assert.equal(forwardedPayload.p_max_requests, 20);
  assert.equal(forwardedPayload.p_server_key, "test-server-key-only");
});

test("chat endpoint rejects bodies larger than 64 KB", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hello", extra: "x".repeat(70 * 1024) })
  }));
  assert.equal(response.status, 413);
});

test.after(() => {
  for (const key of trackedEnv) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  globalThis.fetch = originalFetch;
});
