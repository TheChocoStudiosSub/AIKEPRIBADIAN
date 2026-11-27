import { isIP } from "node:net";
import { verifyChatIdentityCookie } from "../netlify/functions/core/chat-diagnostics.mjs";

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function sameOrigin(req) {
  const origin = String(req.headers.origin || "");
  const host = String(req.headers.host || "");
  const allowed = String(process.env.CHAT_DIAGNOSTICS_ALLOWED_ORIGINS || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (!origin) return String(req.headers["sec-fetch-site"] || "").toLowerCase() !== "cross-site";
  if (allowed.includes(origin)) return true;
  try { return Boolean(host) && new URL(origin).host === host; } catch { return false; }
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 8000) { resolve(null); req.destroy(); }
    });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

async function writeClientReport(payload) {
  const base = String(process.env.TCS_KNOWLEDGE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.TCS_KNOWLEDGE_PUBLISHABLE_KEY || "");
  const serverKey = String(process.env.TCS_OWNER_AUTH_SERVER_KEY || "");
  if (!base || !key || !/^[0-9a-f]{64}$/i.test(serverKey)) return { ok: false, status: 503 };
  try {
    const response = await fetch(base + "/rest/v1/rpc/tcs_chat_write_diagnostic", {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        p_stage: "client_report",
        p_diagnostic_id: payload.diagnosticId,
        p_visitor_id: payload.visitorId,
        p_conversation_id: payload.conversationId,
        p_conversation_title: null,
        p_ip_address: null,
        p_user_agent: null,
        p_request_mode: null,
        p_model_name: null,
        p_request_status: null,
        p_http_status: null,
        p_upstream_status: null,
        p_finish_reason: null,
        p_stream_done_received: null,
        p_response_characters: null,
        p_response_bytes: null,
        p_error_code: null,
        p_client_received_characters: payload.receivedCharacters,
        p_client_received_done: payload.receivedDone,
        p_server_key: serverKey
      }),
      signal: AbortSignal.timeout(2500)
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok && data?.ok === true, status: response.status };
  } catch {
    return { ok: false, status: 503 };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });

  const body = await readBody(req);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!body || body.action !== "client_report" || !uuid.test(String(body.diagnosticId || "")) ||
      !Number.isSafeInteger(body.receivedCharacters) || body.receivedCharacters < 0 ||
      body.receivedCharacters > 10000000 || typeof body.receivedDone !== "boolean") {
    return send(res, 400, { ok: false, error: "invalid_client_report" });
  }

  const cookieHeader = Array.isArray(req.headers.cookie) ? req.headers.cookie.join("; ") : String(req.headers.cookie || "");
  const identityRequest = new Request("https://chocoai.thechocostudios.bond/api/chat-diagnostics", {
    headers: { cookie: cookieHeader }
  });
  const identity = verifyChatIdentityCookie(identityRequest, process.env.TCS_OWNER_AUTH_SERVER_KEY || "");
  if (!identity) return send(res, 401, { ok: false, error: "visitor_identity_required" });

  const result = await writeClientReport({
    diagnosticId: body.diagnosticId,
    visitorId: identity.visitorId,
    conversationId: identity.conversationId,
    receivedCharacters: body.receivedCharacters,
    receivedDone: body.receivedDone
  });
  if (!result.ok) return send(res, result.status >= 400 && result.status < 500 ? result.status : 503, {
    ok: false, error: "diagnostic_report_unavailable"
  });
  return send(res, 200, { ok: true });
}
