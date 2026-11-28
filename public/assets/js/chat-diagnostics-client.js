(function registerChocoChatDiagnostics(root) {
  "use strict";

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function createConversationId() {
    const cryptoApi = root.crypto;
    if (!cryptoApi) throw new Error("Secure UUID generation is unavailable.");

    if (typeof cryptoApi.randomUUID === "function") {
      return cryptoApi.randomUUID();
    }

    if (typeof cryptoApi.getRandomValues !== "function") {
      throw new Error("Secure random generation is unavailable.");
    }

    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20)
    ].join("-");
  }

  function readResponseHeaders(headers) {
    const read = name => {
      try { return String(headers && headers.get ? headers.get(name) || "" : "").trim(); }
      catch { return ""; }
    };
    const diagnosticId = read("X-Choco-Diagnostic-ID");
    const conversationId = read("X-Choco-Conversation-ID");

    return {
      diagnosticId: UUID_PATTERN.test(diagnosticId) ? diagnosticId.toLowerCase() : "",
      conversationId: UUID_PATTERN.test(conversationId) ? conversationId.toLowerCase() : ""
    };
  }

  function parseSseFrame(frame) {
    const payload = String(frame || "")
      .split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trim())
      .join("\n");

    if (!payload) return { done: false, content: "", error: null };
    if (payload === "[DONE]") return { done: true, content: "", error: null };

    try {
      const eventData = JSON.parse(payload);
      if (eventData && eventData.error) {
        const message = typeof eventData.error === "string"
          ? eventData.error
          : eventData.error.message || "Upstream stream error";
        return { done: false, content: "", error: String(message) };
      }

      const delta = eventData && eventData.choices && eventData.choices[0] &&
        eventData.choices[0].delta && eventData.choices[0].delta.content;
      return {
        done: false,
        content: typeof delta === "string" ? delta : "",
        error: null
      };
    } catch {
      return { done: false, content: "", error: null };
    }
  }

  async function sendClientReceipt(diagnosticId, receivedCharacters, receivedDone, fetchImpl) {
    if (!UUID_PATTERN.test(String(diagnosticId || "")) ||
        !Number.isSafeInteger(receivedCharacters) ||
        receivedCharacters < 0 || receivedCharacters > 10000000 ||
        typeof receivedDone !== "boolean") {
      return false;
    }

    const requestFetch = typeof fetchImpl === "function"
      ? fetchImpl
      : (typeof root.fetch === "function" ? root.fetch.bind(root) : null);
    if (!requestFetch) return false;

    try {
      const response = await requestFetch("/api/chat-diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
        body: JSON.stringify({
          action: "client_report",
          diagnosticId: String(diagnosticId).toLowerCase(),
          receivedCharacters,
          receivedDone
        })
      });
      return Boolean(response && response.ok);
    } catch {
      return false;
    }
  }

  root.ChocoChatDiagnostics = Object.freeze({
    createConversationId,
    readResponseHeaders,
    parseSseFrame,
    sendClientReceipt
  });
})(globalThis);
