import { createHash, pbkdf2Sync, timingSafeEqual, randomBytes } from "node:crypto";

const COOKIE_NAME = "tcs_owner_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function send(res, status, payload, headers = {}) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  return res.status(status).json(payload);
}

function hash(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function readCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function setSessionCookie(res, token, maxAge = SESSION_TTL_SECONDS) {
  res.setHeader("Set-Cookie", COOKIE_NAME + "=" + token +
    "; Max-Age=" + maxAge + "; Path=/; HttpOnly; Secure; SameSite=Lax");
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return String(req.headers["sec-fetch-site"] || "").toLowerCase() !== "cross-site";
}

function clientAddress(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.headers["x-real-ip"] || "unknown");
}

async function ownerRpc(action, payload = {}) {
  const base = String(process.env.TCS_KNOWLEDGE_SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = String(process.env.TCS_KNOWLEDGE_PUBLISHABLE_KEY || "");
  const serverKey = String(process.env.TCS_OWNER_AUTH_SERVER_KEY || "");
  if (!base || !publishableKey || !serverKey) return { ok: false, unavailable: true };
  try {
    const response = await fetch(base + "/rest/v1/rpc/" + action, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: "Bearer " + publishableKey,
        "Content-Type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({ ...payload, p_server_key: serverKey }),
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return { ok: false, unavailable: true };
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, unavailable: true };
  }
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
      if (raw.length > 12000) {
        resolve(null);
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

async function validateSession(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  const result = await ownerRpc("tcs_owner_validate_session", { p_token: token });
  return result.ok && result.data === true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return send(res, 400, { ok: false, error: "invalid_json" });
  }

  const action = String(body.action || "").slice(0, 16);

  if (action === "verify") {
    const authenticated = await validateSession(req);
    return send(res, 200, { ok: true, authenticated });
  }

  if (action === "logout") {
    const token = readCookie(req, COOKIE_NAME);
    if (/^[a-f0-9]{64}$/i.test(token)) {
      await ownerRpc("tcs_owner_revoke_session", { p_token: token });
    }
    setSessionCookie(res, "", 0);
    return send(res, 200, { ok: true, authenticated: false });
  }

  if (action !== "login") return send(res, 400, { ok: false, error: "unknown_action" });

  const credential = typeof body.credential === "string" ? body.credential : "";
  if (!/^[A-Za-z0-9._~-]{8,200}$/.test(credential)) {
    return send(res, 400, { ok: false, error: "invalid_credential_format" });
  }

  const verifierResult = await ownerRpc("tcs_owner_get_verifier", {
    p_client_hash: hash(clientAddress(req))
  });
  if (!verifierResult.ok) return send(res, 503, { ok: false, error: "owner_auth_unavailable" });

  const verifier = verifierResult.data;
  if (verifier?.error === "rate_limited") {
    return send(res, 429, { ok: false, error: "rate_limited" });
  }
  if (verifier?.ok !== true ||
      !/^[0-9a-f]{32,64}$/i.test(verifier.salt_hex || "") ||
      !/^[0-9a-f]{64}$/i.test(verifier.credential_hash || "")) {
    return send(res, 503, { ok: false, error: "owner_verifier_unavailable" });
  }

  const candidate = pbkdf2Sync(credential, Buffer.from(verifier.salt_hex, "hex"), 310000, 32, "sha256");
  const expected = Buffer.from(verifier.credential_hash, "hex");
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    return send(res, 401, { ok: false, error: "invalid_credentials" });
  }

  const token = randomBytes(32).toString("hex");
  const sessionResult = await ownerRpc("tcs_owner_create_session", { p_token_hash: hash(token) });
  if (!sessionResult.ok || sessionResult.data !== true) {
    return send(res, 503, { ok: false, error: "owner_session_unavailable" });
  }

  setSessionCookie(res, token);
  return send(res, 200, { ok: true, authenticated: true, expiresIn: SESSION_TTL_SECONDS });
}
