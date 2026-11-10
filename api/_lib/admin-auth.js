import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "tcs_admin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function secret() {
  const value = String(process.env.TCS_ADMIN_PANEL_SESSION_SECRET || "");
  return /^[a-f0-9]{64}$/i.test(value) ? value : "";
}

function signature(payload, key) {
  return createHmac("sha256", Buffer.from(key, "hex")).update("tcs-admin-session:v1:" + payload, "utf8").digest("base64url");
}

function readCookie(req) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === COOKIE_NAME) return part.slice(index + 1).trim();
  }
  return "";
}

export function validateAdminSession(req) {
  const key = secret();
  if (!key) return false;
  const parts = readCookie(req).split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]{20,2048}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{40,100}$/.test(parts[1])) return false;
  const expected = Buffer.from(signature(parts[0], key));
  const received = Buffer.from(parts[1]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return payload?.iss === "tcs-admin" &&
      Number.isInteger(payload.iat) &&
      Number.isInteger(payload.exp) &&
      payload.iat <= now + 60 &&
      payload.exp > now &&
      payload.exp - payload.iat === SESSION_TTL_SECONDS &&
      typeof payload.nonce === "string" &&
      /^[a-f0-9]{32}$/.test(payload.nonce);
  } catch {
    return false;
  }
}

export function createAdminSessionCookie(res) {
  const key = secret();
  if (!key) throw new Error("admin_session_secret_not_configured");
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const payload = Buffer.from(JSON.stringify({ iss: "tcs-admin", iat: now, exp: now + SESSION_TTL_SECONDS, nonce })).toString("base64url");
  const token = payload + "." + signature(payload, key);
  res.setHeader("Set-Cookie", COOKIE_NAME + "=" + token + "; Max-Age=" + SESSION_TTL_SECONDS + "; Path=/; HttpOnly; Secure; SameSite=Strict; Priority=High");
}

export function clearAdminSessionCookie(res) {
  res.setHeader("Set-Cookie", COOKIE_NAME + "=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict; Priority=High");
}
