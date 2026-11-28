import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { getClientAddress } from "./rate-limit.mjs";

const COOKIE_NAME = "choco_chat_identity";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secretBytes(secret) {
  return typeof secret === "string" && /^[0-9a-f]{64}$/i.test(secret)
    ? Buffer.from(secret, "hex")
    : null;
}

function signature(payload, secret) {
  const key = secretBytes(secret);
  if (!key) return "";
  return createHmac("sha256", key).update("choco-chat-identity:v1:" + payload, "utf8").digest("base64url");
}

function readCookieValue(request, name) {
  const raw = request?.headers?.get?.("cookie") || "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function signIdentity(visitorId, conversationId, secret) {
  const payload = "v1." + visitorId + "." + conversationId;
  const signed = signature(payload, secret);
  return signed ? payload + "." + signed : "";
}

export function verifyChatIdentityCookie(request, secret) {
  const parts = readCookieValue(request, COOKIE_NAME).split(".");
  if (parts.length !== 4 || parts[0] !== "v1" ||
      !UUID_RE.test(parts[1]) || !UUID_RE.test(parts[2]) ||
      !/^[A-Za-z0-9_-]{40,60}$/.test(parts[3])) return null;
  const payload = parts.slice(0, 3).join(".");
  const expected = Buffer.from(signature(payload, secret));
  const received = Buffer.from(parts[3]);
  if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return { visitorId: parts[1].toLowerCase(), conversationId: parts[2].toLowerCase() };
}

function normalizeTitle(value) {
  let title = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  title = title
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/\s+/g, " ")
    .trim();
  return (title || "Percakapan").slice(0, 36);
}

export function resolveChatDiagnosticIdentity(request, body, message, secret) {
  const title = normalizeTitle(body?.conversationTitle);
  const existing = verifyChatIdentityCookie(request, secret);
  const visitorId = existing?.visitorId || randomUUID();
  const providedConversationId = typeof body?.conversationId === "string" && UUID_RE.test(body.conversationId)
    ? body.conversationId.toLowerCase() : null;
  const conversationId = providedConversationId || existing?.conversationId || randomUUID();

  const address = getClientAddress(request?.headers);
  const ipAddress = isIP(address) ? address : null;
  const userAgent = String(request?.headers?.get?.("user-agent") || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300) || null;
  const token = signIdentity(visitorId, conversationId, secret);
  const cookie = token
    ? COOKIE_NAME + "=" + token + "; Max-Age=" + COOKIE_MAX_AGE + "; Path=/; HttpOnly; Secure; SameSite=Lax; Priority=Medium"
    : null;
  const shouldSetCookie = Boolean(cookie) &&
    (!existing || existing.conversationId !== conversationId || !verifyChatIdentityCookie(request, secret));

  return {
    visitorId, conversationId, conversationTitle: title, ipAddress, userAgent,
    setCookie: shouldSetCookie ? cookie : null
  };
}

export function inspectSseFrame(frame) {
  const payload = String(frame || "").split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim()).join("\n");
  if (!payload) return { characters: 0, bytes: 0, finishReason: null, done: false, error: false };
  if (payload === "[DONE]") return { characters: 0, bytes: 0, finishReason: null, done: true, error: false };
  try {
    const data = JSON.parse(payload);
    const choice = data?.choices?.[0];
    const delta = choice?.delta?.content;
    return {
      characters: typeof delta === "string" ? delta.length : 0,
      bytes: typeof delta === "string" ? Buffer.byteLength(delta, "utf8") : 0,
      finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
      done: false,
      error: Boolean(data?.error)
    };
  } catch {
    return { characters: 0, bytes: 0, finishReason: null, done: false, error: false };
  }
}

export function observeChatStream(stream, onFinish) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const state = {
    responseCharacters: 0, responseBytes: 0, finishReason: null,
    streamDoneReceived: false, requestStatus: "processing", errorCode: null
  };
  let buffer = "";
  let finalized = false;
  const inspect = (frame) => {
    const result = inspectSseFrame(frame);
    state.responseCharacters += result.characters;
    state.responseBytes += result.bytes;
    if (result.finishReason) state.finishReason = result.finishReason;
    if (result.done) state.streamDoneReceived = true;
    if (result.error) state.errorCode = "upstream_stream_error";
  };
  const finish = async (status, errorCode) => {
    if (finalized) return;
    finalized = true;
    state.requestStatus = status || (
      state.errorCode ? "failed" :
      state.finishReason === "length" || !state.streamDoneReceived ? "truncated" : "completed"
    );
    state.errorCode = errorCode || state.errorCode;
    try { await onFinish({ ...state }); } catch { /* Diagnostics must never interrupt chat delivery. */ }
  };
  return new ReadableStream({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          buffer += decoder.decode();
          if (buffer.trim()) inspect(buffer);
          await finish();
          controller.close();
          return;
        }
        buffer += decoder.decode(result.value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || "";
        for (const frame of frames) inspect(frame);
        controller.enqueue(result.value);
      } catch (error) {
        await finish("failed", error?.name === "AbortError" ? "upstream_aborted" : "stream_read_error");
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
      await finish("cancelled", "client_cancelled");
    }
  });
}
