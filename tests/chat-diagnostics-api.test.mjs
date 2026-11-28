import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/chat-diagnostics.js";
import { resolveChatDiagnosticIdentity } from "../netlify/functions/core/chat-diagnostics.mjs";

const SECRET = "a".repeat(64);
const trackedEnv = [
  "TCS_KNOWLEDGE_SUPABASE_URL",
  "TCS_KNOWLEDGE_PUBLISHABLE_KEY",
  "TCS_OWNER_AUTH_SERVER_KEY"
];
const originalEnv = Object.fromEntries(trackedEnv.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function setupEnvironment() {
  process.env.TCS_KNOWLEDGE_SUPABASE_URL = "https://knowledge.example.test";
  process.env.TCS_KNOWLEDGE_PUBLISHABLE_KEY = "publishable-test-key";
  process.env.TCS_OWNER_AUTH_SERVER_KEY = SECRET;
}

function makeRequest() {
  const identity = resolveChatDiagnosticIdentity(
    new Request("https://chocoai.test/api/chat"),
    { conversationId: "11111111-1111-4111-8111-111111111111", conversationTitle: "Percakapan uji" },
    "Pesan uji",
    SECRET
  );
  return {
    method: "POST",
    headers: {
      origin: "https://chocoai.test",
      host: "chocoai.test",
      "sec-fetch-site": "same-origin",
      cookie: identity.setCookie.split(";")[0]
    },
    body: {
      action: "client_report",
      diagnosticId: "22222222-2222-4222-8222-222222222222",
      receivedCharacters: 17,
      receivedDone: true
    }
  };
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test("client diagnostic receipts are rate limited before the write RPC", async () => {
  setupEnvironment();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      ok: true, allowed: false, remaining: 0, retry_after_seconds: 90
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const response = makeResponse();
  await handler(makeRequest(), response);

  assert.equal(response.statusCode, 429);
  assert.equal(response.payload.error, "diagnostic_report_rate_limited");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /tcs_chat_consume_rate_limit$/);
  assert.equal(calls[0].body.p_scope, "chat_diag_receipt");
  assert.match(calls[0].body.p_subject_hash, /^[0-9a-f]{64}$/);
  assert.equal(calls[0].body.p_window_seconds, 600);
  assert.equal(calls[0].body.p_max_requests, 40);
  assert.equal(calls[0].body.p_server_key, SECRET);
});

test("allowed client receipt is written once through the server-key-gated RPC", async () => {
  setupEnvironment();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, allowed: true }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };

  const response = makeResponse();
  await handler(makeRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { ok: true });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /tcs_chat_consume_rate_limit$/);
  assert.match(calls[1].url, /tcs_chat_write_diagnostic$/);
  assert.equal(calls[1].body.p_stage, "client_report");
  assert.equal(calls[1].body.p_client_received_characters, 17);
  assert.equal(calls[1].body.p_client_received_done, true);
  assert.equal(calls[1].body.p_ip_address, null);
  assert.equal(calls[1].body.p_user_agent, null);
});

test("diagnostic receipt requires a valid signed visitor cookie", async () => {
  setupEnvironment();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("No RPC should be made without a valid identity cookie");
  };
  const request = makeRequest();
  request.headers.cookie = "choco_chat_identity=invalid";
  const response = makeResponse();

  await handler(request, response);

  assert.equal(response.statusCode, 401);
  assert.equal(fetchCalls, 0);
});

test.after(() => {
  for (const key of trackedEnv) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  globalThis.fetch = originalFetch;
});
