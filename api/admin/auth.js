import { createHash, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { clearAdminSessionCookie, createAdminSessionCookie, validateAdminSession } from "../_lib/admin-auth.js";

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function hash(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
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

async function checkLoginRateLimit(req) {
  const base = String(process.env.TCS_BACKEND_SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = String(process.env.TCS_BACKEND_PUBLISHABLE_KEY || "");
  const serverKey = String(process.env.TCS_OWNER_AUTH_SERVER_KEY || "");
  if (!base || !publishableKey || !/^[0-9a-f]{64}$/i.test(serverKey)) return { ok: false };
  const address = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown")
    .split(",")[0].trim().slice(0, 160);
  const origin = String(req.headers.origin || "https://tcs-admin-panel.vercel.app");
  try {
    const response = await fetch(base + "/functions/v1/tcs-telemetry", {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: "Bearer " + publishableKey,
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

  const credential = typeof body.credential === "string" ? body.credential : "";
  if (credential.length < 8 || credential.length > 200 || /[\u0000-\u001F\u007F]/.test(credential)) {
    return send(res, 400, { ok: false, error: "invalid_credential_format" });
  }

  const salt = String(process.env.TCS_OWNER_PANEL_CREDENTIAL_SALT || "");
  const verifier = String(process.env.TCS_OWNER_PANEL_CREDENTIAL_HASH || "");
  const sessionSecret = String(process.env.TCS_ADMIN_PANEL_SESSION_SECRET || "");
  if (!/^[0-9a-f]{32}$/i.test(salt) || !/^[0-9a-f]{64}$/i.test(verifier) || !/^[0-9a-f]{64}$/i.test(sessionSecret)) {
    return send(res, 503, { ok: false, error: "owner_panel_auth_not_configured" });
  }

  const rateLimit = await checkLoginRateLimit(req);
  if (!rateLimit.ok) return send(res, 503, { ok: false, error: "owner_auth_unavailable" });
  if (rateLimit.limited) return send(res, 429, { ok: false, error: "rate_limited" });

  const candidate = pbkdf2Sync(credential, Buffer.from(salt, "hex"), 310000, 32, "sha256");
  const expected = Buffer.from(verifier, "hex");
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    return send(res, 401, { ok: false, error: "invalid_credentials" });
  }
  try { createAdminSessionCookie(res); } catch { return send(res, 503, { ok: false, error: "owner_panel_auth_not_configured" }); }
  return send(res, 200, { ok: true, authenticated: true, expiresIn: 8 * 60 * 60 });
}
