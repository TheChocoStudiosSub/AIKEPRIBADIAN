import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../public/assets/js/chat-diagnostics-client.js");
const diagnostics = globalThis.ChocoChatDiagnostics;

test("conversation IDs are secure UUIDs and unique per conversation", () => {
  const first = diagnostics.createConversationId();
  const second = diagnostics.createConversationId();

  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(second, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(first, second);
});

test("diagnostic response headers are read and UUID-validated", () => {
  const diagnosticId = "8a7e50d4-22f1-4f8d-83a0-c314d329de11";
  const conversationId = "b5f3e7a9-2c6d-47a1-82e0-19f1b0b96b70";
  const headers = new Headers({
    "X-Choco-Diagnostic-ID": diagnosticId,
    "X-Choco-Conversation-ID": conversationId
  });

  assert.deepEqual(diagnostics.readResponseHeaders(headers), {
    diagnosticId,
    conversationId
  });

  const invalidHeaders = new Headers({
    "X-Choco-Diagnostic-ID": "not-a-uuid",
    "X-Choco-Conversation-ID": "also-invalid"
  });
  assert.deepEqual(diagnostics.readResponseHeaders(invalidHeaders), {
    diagnosticId: "",
    conversationId: ""
  });
});

test("SSE parser counts only assistant content and recognizes [DONE]", () => {
  assert.deepEqual(
    diagnostics.parseSseFrame('event: message\ndata: {"choices":[{"delta":{"role":"assistant","content":"Halo"}}]}\n\n'),
    { done: false, content: "Halo", error: null }
  );
  assert.deepEqual(
    diagnostics.parseSseFrame('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'),
    { done: false, content: "", error: null }
  );
  assert.deepEqual(
    diagnostics.parseSseFrame("data: [DONE]\n\n"),
    { done: true, content: "", error: null }
  );
  assert.equal(
    diagnostics.parseSseFrame('data: {"error":{"message":"upstream failed"}}\n\n').error,
    "upstream failed"
  );
});

test("client receipt contains only the documented delivery fields", async () => {
  const diagnosticId = "8a7e50d4-22f1-4f8d-83a0-c314d329de11";
  let requestUrl = "";
  let requestOptions;
  const result = await diagnostics.sendClientReceipt(
    diagnosticId,
    321,
    true,
    async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return { ok: true };
    }
  );

  assert.equal(result, true);
  assert.equal(requestUrl, "/api/chat-diagnostics");
  assert.equal(requestOptions.method, "POST");
  assert.equal(requestOptions.credentials, "same-origin");
  assert.equal(requestOptions.cache, "no-store");
  assert.equal(requestOptions.keepalive, true);
  assert.deepEqual(JSON.parse(requestOptions.body), {
    action: "client_report",
    diagnosticId,
    receivedCharacters: 321,
    receivedDone: true
  });
});

test("receipt failures are swallowed and malformed identifiers are ignored", async () => {
  let calls = 0;
  const fetchStub = async () => {
    calls += 1;
    throw new Error("offline");
  };

  assert.equal(await diagnostics.sendClientReceipt("invalid", 0, false, fetchStub), false);
  assert.equal(await diagnostics.sendClientReceipt(
    "8a7e50d4-22f1-4f8d-83a0-c314d329de11", 0, false, fetchStub
  ), false);
  assert.equal(calls, 1);
});

test("the browser loads diagnostics helpers before the chat controller and wires the contract", async () => {
  const [html, controller] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/assets/js/chat-controller.js", "utf8")
  ]);

  assert.ok(
    html.indexOf("/assets/js/chat-diagnostics-client.js") < html.indexOf("/assets/js/chat-controller.js"),
    "diagnostics helper must load before the chat controller"
  );
  assert.match(controller, /conversationId,\s*conversationTitle:/);
  assert.match(controller, /X-Choco-Diagnostic-ID|readResponseHeaders/);
  assert.match(controller, /reportReceipt\(\)/);
  assert.match(controller, /conversationId = createConversationId\(\)/);
});
