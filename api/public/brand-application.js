import { createHmac, randomUUID } from "node:crypto";

const ALLOWED_ORIGINS = new Set([
  "https://tcs-admin-panel.vercel.app",
  "https://the-choco-studios-official.vercel.app"
]);
function send(res, status, data, origin) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Vary", "Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (status === 204) return res.status(204).end();
  return res.status(status).json(data);
}
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  return await new Promise(resolve => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > 1800000) { resolve(null); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}
const clean = (v, max) => typeof v === "string" ? v.trim().slice(0,max) : "";
function hash(v, key) { return createHmac("sha256", key).update(String(v)).digest("hex"); }
async function rateLimit(base, key, rateKey) {
  const r = await fetch(base + "/rest/v1/rpc/tcs_consume_analytics_rate_limit", {
    method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ p_key: rateKey, p_limit: 3, p_window_seconds: 86400 }), cache: "no-store", signal: AbortSignal.timeout(5000)
  });
  return r.ok && await r.json() === true;
}
async function uploadLogo(base, key, dataUrl) {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error("invalid_logo");
  const bytes = Buffer.from(m[2], "base64");
  if (!bytes.length || bytes.length > 1024 * 1024) throw new Error("logo_too_large");
  const mime = m[1];
  const extension = mime === "image/jpeg" ? "jpg" : mime.slice(6);
  const path = randomUUID() + "." + extension;
  const bucket = "tcs-brand-logos";
  const check = await fetch(base + "/storage/v1/bucket/" + bucket, { headers: { apikey: key, Authorization: "Bearer " + key }, cache: "no-store" });
  if (check.status === 404) {
    const create = await fetch(base + "/storage/v1/bucket", {
      method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 1048576, allowed_mime_types: ["image/png","image/jpeg","image/webp"] }),
      cache: "no-store"
    });
    if (!create.ok && create.status !== 409) throw new Error("logo_storage_unavailable");
  } else if (!check.ok) throw new Error("logo_storage_unavailable");
  const upload = await fetch(base + "/storage/v1/object/" + bucket + "/" + path, {
    method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": mime, "x-upsert": "false" },
    body: bytes, cache: "no-store", signal: AbortSignal.timeout(12000)
  });
  if (!upload.ok) throw new Error("logo_upload_failed");
  return base + "/storage/v1/object/public/" + bucket + "/" + path;
}
export default async function handler(req, res) {
  const origin = String(req.headers.origin || "");
  if (req.method === "OPTIONS") return send(res, 204, {}, origin);
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" }, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { ok: false, error: "origin_not_allowed" }, origin);
  try {
    const input = await body(req);
    if (!input || typeof input !== "object" || Array.isArray(input)) return send(res, 400, { ok: false, error: "invalid_input" }, origin);
    const brand_name = clean(input.brandName,120);
    const slogan = clean(input.slogan,240);
    const about = clean(input.about,5000);
    const direction = clean(input.direction,3000);
    const owner_name = clean(input.ownerName,120);
    const contact_email = clean(input.email,254).toLowerCase();
    const website_url = clean(input.websiteUrl,500);
    const repository_url = clean(input.repositoryUrl,500);
    const known_domains = Array.isArray(input.domains) ? input.domains.slice(0,20).map(x=>clean(x,253).toLowerCase()).filter(Boolean) : [];
    const safeHttps = value => { if (!value) return null; try { const u = new URL(value); if (u.protocol !== "https:" || u.username || u.password) throw new Error(); return u.toString().slice(0,500); } catch { throw new Error("invalid_input"); } };
    const safeDomains = known_domains.map(domain => { if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$/.test(domain)) throw new Error("invalid_input"); return domain; });
    if (brand_name.length < 2 || slogan.length < 3 || about.length < 20 || direction.length < 10 || owner_name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) return send(res, 400, { ok: false, error: "invalid_input" }, origin);
    const key = process.env.SUPABASE_SECRET_KEY || "";
    const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
    if (!key || !base) return send(res, 503, { ok: false, error: "service_unavailable" }, origin);
    const ip = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || "").split(",").pop().trim();
    const rateKey = hash("brand-application:" + contact_email + ":" + (ip || "unknown"), key);
    if (!await rateLimit(base,key,rateKey)) return send(res,429,{ok:false,error:"rate_limited"},origin);
    const validatedWebsite = safeHttps(website_url);
    const validatedRepository = safeHttps(repository_url);
    const logo_url = await uploadLogo(base,key,clean(input.logoDataUrl,1500000));
    const r = await fetch(base + "/rest/v1/tcs_brand_applications", {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify([{ brand_name, logo_url, slogan, about, direction, owner_name, contact_email, website_url: validatedWebsite, repository_url: validatedRepository, known_domains: safeDomains }]),
      cache: "no-store", signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) throw new Error("submission_failed");
    const rows = await r.json();
    return send(res, 201, { ok: true, applicationId: rows?.[0]?.id || null }, origin);
  } catch (error) {
    const code = String(error?.message || "");
    const status = code === "invalid_logo" || code === "logo_too_large" ? 400 : code === "rate_limited" ? 429 : 500;
    return send(res,status,{ok:false,error:status===400?code:status===429?"rate_limited":"submission_failed"},origin);
  }
}
