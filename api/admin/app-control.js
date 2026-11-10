import { validateAdminSession } from "../_lib/admin-auth.js";
const ALLOWED_ACTIONS = new Set(["get", "update"]);

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function sameOrigin(req) {
  const origin = String(req.headers.origin || "");
  const host = String(req.headers.host || "");
  const allowedOrigins = String(process.env.TCS_ADMIN_ALLOWED_ORIGINS || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (origin && allowedOrigins.includes(origin)) return true;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return String(req.headers["sec-fetch-site"] || "").toLowerCase() !== "cross-site";
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 12000) { resolve(null); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
  if (!validateAdminSession(req)) return send(res, 401, { ok: false, error: "owner_session_required" });

  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) return send(res, 400, { ok: false, error: "invalid_json" });
  const action = String(body.action || "").slice(0, 16);
  if (!ALLOWED_ACTIONS.has(action)) return send(res, 400, { ok: false, error: "unknown_action" });

  const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || "");
  if (!base || !secretKey) return send(res, 503, { ok: false, error: "app_control_backend_not_configured" });

  try {
    const response = await fetch(base + "/functions/v1/tcs-app-control", {
      method: "POST",
      headers: { apikey: secretKey, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("TCS app control backend request failed", { action, status: response.status });
      return send(res, response.status, data && typeof data === "object" ? data : { ok: false, error: "app_control_backend_error" });
    }
    return send(res, 200, data && typeof data === "object" ? data : { ok: false, error: "invalid_app_control_response" });
  } catch {
    return send(res, 503, { ok: false, error: "app_control_backend_unavailable" });
  }
}
