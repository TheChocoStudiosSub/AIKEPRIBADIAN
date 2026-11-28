import { isIP } from "node:net";

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

function cookieValue(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

async function ownerRpc(action, payload, timeoutMs = 2500) {
  const base = String(process.env.TCS_KNOWLEDGE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.TCS_KNOWLEDGE_PUBLISHABLE_KEY || "");
  const serverKey = String(process.env.TCS_OWNER_AUTH_SERVER_KEY || "");
  if (!base || !key || !/^[0-9a-f]{64}$/i.test(serverKey)) return { ok: false, status: 503 };
  try {
    const response = await fetch(base + "/rest/v1/rpc/" + action, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ ...payload, p_server_key: serverKey }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
      await response.text().catch(() => "");
      return { ok: false, status: response.status };
    }
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, status: 503 };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });

  const body = await readBody(req);
  if (!body || body.action !== "lookup") return send(res, 400, { ok: false, error: "invalid_lookup_request" });

  const token = cookieValue(req, "tcs_owner_session");
  if (!token || token.length > 256) return send(res, 401, { ok: false, error: "owner_session_required" });
  const session = await ownerRpc("tcs_owner_validate_session", { p_token: token });
  if (!session.ok || session.data !== true) return send(res, 401, { ok: false, error: "owner_session_required" });

  const diagnosticId = body.diagnosticId ? String(body.diagnosticId) : null;
  const conversationId = body.conversationId ? String(body.conversationId) : null;
  const visitorId = body.visitorId ? String(body.visitorId) : null;
  const ipAddress = body.ipAddress ? String(body.ipAddress).trim() : null;
  const limit = body.limit === undefined ? 20 : Number(body.limit);

  if ((diagnosticId && !UUID_RE.test(diagnosticId)) ||
      (conversationId && !UUID_RE.test(conversationId)) ||
      (visitorId && !UUID_RE.test(visitorId)) ||
      (ipAddress && (!isIP(ipAddress) || ipAddress.length > 128)) ||
      !Number.isInteger(limit) || limit < 1 || limit > 50) {
    return send(res, 400, { ok: false, error: "invalid_lookup_filters" });
  }

  const result = await ownerRpc("tcs_chat_get_diagnostics", {
    p_diagnostic_id: diagnosticId,
    p_conversation_id: conversationId,
    p_visitor_id: visitorId,
    p_ip_address: ipAddress,
    p_limit: limit
  });
  if (!result.ok || result.data?.ok !== true || !Array.isArray(result.data?.records)) {
    return send(res, 503, { ok: false, error: "diagnostics_unavailable" });
  }
  return send(res, 200, { ok: true, records: result.data.records });
}
