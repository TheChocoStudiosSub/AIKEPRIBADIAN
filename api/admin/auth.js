import { clearAdminSessionCookie, createAdminSessionCookie, validateAdminSession } from "../_lib/admin-auth.js";

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function sameOrigin(req) {
  const origin = String(req.headers.origin || "");
  const host = String(req.headers.host || "");
  const allowedOrigins = String(process.env.TCS_ADMIN_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (origin && allowedOrigins.includes(origin)) return true;
  if (origin && host) {
    try { if (new URL(origin).host !== host) return false; } catch { return false; }
  }
  return String(req.headers["sec-fetch-site"] || "").toLowerCase() !== "cross-site";
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 12000) { resolve(null); req.destroy(); }
    });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

function backendConfig() {
  const base = String(process.env.TCS_BACKEND_SUPABASE_URL || "").replace(/\\/+$/, "");
  const publishableKey = String(process.env.TCS_BACKEND_PUBLISHABLE_KEY || "");
  return base && publishableKey ? { base, publishableKey } : null;
}

async function checkLoginRateLimit(req) {
  const config = backendConfig();
  const serverKey = String(process.env.TCS_OWNER_AUTH_SERVER_KEY || "");
  if (!config || !/^[0-9a-f]{64}$/i.test(serverKey)) return { ok: false };
  const address = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown")
    .split(",")[0].trim().slice(0, 160);
  const origin = String(req.headers.origin || "https://tcs-admin-panel.vercel.app");
  try {
    const response = await fetch(config.base + "/functions/v1/tcs-telemetry", {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: "Bearer " + config.publishableKey,
        "Content-Type": "application/json",
        Origin: origin
      },
      cache: "no-store",
      body: JSON.stringify({ action: "login_rate_limit", clientIp: address, serverKey }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { ok: false };
    const data = await response.json();
    return { ok: true, limited: data?.limited === true };
  } catch {
    return { ok: false };
  }
}

async function verifyOwnerWithTcsAccount(username, password) {
  const config = backendConfig();
  if (!config) return { ok: false, unavailable: true };

  try {
    const response = await fetch(config.base + "/functions/v1/tcs-account", {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: "Bearer " + config.publishableKey,
        "Content-Type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({ action: "owner-login", username, password }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json().catch(() => null);
    if (response.status === 429) return { ok: false, rateLimited: true };
    if (response.status === 401) return { ok: false, invalid: true };
    if (!response.ok || data?.ok !== true || !data?.account?.id || !data?.session?.access_token) {
      return { ok: false, unavailable: true };
    }
    // Keep the Supabase session server-side. Only the separate HttpOnly admin
    // session is issued to the browser; access and refresh tokens are discarded.
    return { ok: true };
  } catch {
    return { ok: false, unavailable: true };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) return send(res, 400, { ok: false, error: "invalid_json" });

  const action = String(body.action || "").slice(0, 16);
  if (action === "verify") return send(res, 200, { ok: true, authenticated: validateAdminSession(req) });
  if (action === "logout") {
    clearAdminSessionCookie(res);
    return send(res, 200, { ok: true, authenticated: false });
  }
  if (action !== "login") return send(res, 400, { ok: false, error: "unknown_action" });

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(username) || password.length < 1 || password.length > 128 ||
      /[\\u0000-\\u001F\\u007F]/.test(password)) {
    return send(res, 401, { ok: false, error: "invalid_credentials" });
  }

  const sessionSecret = String(process.env.TCS_ADMIN_PANEL_SESSION_SECRET || "");
  if (!/^[0-9a-f]{64}$/i.test(sessionSecret)) {
    return send(res, 503, { ok: false, error: "owner_panel_auth_not_configured" });
  }

  const rateLimit = await checkLoginRateLimit(req);
  if (!rateLimit.ok) return send(res, 503, { ok: false, error: "owner_auth_unavailable" });
  if (rateLimit.limited) return send(res, 429, { ok: false, error: "rate_limited" });

  const verification = await verifyOwnerWithTcsAccount(username, password);
  if (verification.rateLimited) return send(res, 429, { ok: false, error: "rate_limited" });
  if (verification.invalid) return send(res, 401, { ok: false, error: "invalid_credentials" });
  if (!verification.ok) return send(res, 503, { ok: false, error: "owner_auth_unavailable" });

  try { createAdminSessionCookie(res); } catch {
    return send(res, 503, { ok: false, error: "owner_panel_auth_not_configured" });
  }
  return send(res, 200, { ok: true, authenticated: true, expiresIn: 8 * 60 * 60 });
}
