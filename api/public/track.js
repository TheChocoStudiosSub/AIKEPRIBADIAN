import { createHmac } from "node:crypto";

const ALLOWED_ORIGINS = new Set([
  "https://the-choco-studios-official.vercel.app",
  "https://the-choco-studio-information.netlify.app",
  "https://tcs-information-hub.vercel.app",
  "https://choco-ai-help-center.netlify.app",
  "https://choco-ai-independent-seven.vercel.app",
  "https://tcs-admin-panel.vercel.app"
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
    req.on("data", chunk => { raw += chunk; if (raw.length > 12000) { resolve(null); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}
function hash(value, secret) { return createHmac("sha256", secret).update(String(value)).digest("hex"); }
function classify(ua) {
  const rules = [
    ["Googlebot", /googlebot|google-inspectiontool/i], ["Bingbot", /bingbot/i],
    ["Applebot", /applebot/i], ["GPTBot", /gptbot|chatgpt-user/i], ["ClaudeBot", /claudebot|claude-web/i],
    ["PerplexityBot", /perplexitybot/i], ["Facebook crawler", /facebookexternalhit|meta-externalagent/i],
    ["Twitterbot", /twitterbot/i], ["LinkedInBot", /linkedinbot/i], ["Discordbot", /discordbot/i],
    ["AhrefsBot", /ahrefsbot/i], ["SemrushBot", /semrushbot/i], ["DuckDuckBot", /duckduckbot/i],
    ["YandexBot", /yandexbot/i], ["Baiduspider", /baiduspider/i], ["Automated client", /curl\/|wget\/|python-requests|node-fetch|headlesschrome|puppeteer|playwright/i],
    ["Unidentified bot", /\b(bot|crawler|spider|scraper|preview)\b/i]
  ];
  for (const [name, pattern] of rules) if (pattern.test(ua)) return { bot: true, name };
  return { bot: false, name: null };
}
function safePath(value) {
  try { const u = new URL(String(value || "/"), "https://local.invalid"); return (u.pathname || "/").slice(0, 1000); }
  catch { return "/"; }
}
async function db(path, method, payload, key, base) {
  const r = await fetch(base + "/rest/v1/" + path, {
    method, headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: payload === undefined ? undefined : JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(7000)
  });
  if (!r.ok) throw new Error("database_error");
}
export default async function handler(req, res) {
  const origin = String(req.headers.origin || "");
  if (req.method === "OPTIONS") return send(res, 204, {}, origin);
  if (req.method !== "POST") return send(res, 405, { ok: false }, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { ok: false }, origin);
  try {
    const input = await body(req);
    if (!input || typeof input !== "object" || Array.isArray(input)) return send(res, 400, { ok: false }, origin);
    const secret = process.env.SUPABASE_SECRET_KEY || "";
    const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
    if (!secret || !base) return send(res, 503, { ok: false }, origin);
    const visitorId = String(input.visitorId || "");
    const sessionId = String(input.sessionId || "");
    if (!/^[a-f0-9-]{32,36}$/i.test(visitorId) || !/^[a-f0-9-]{32,36}$/i.test(sessionId)) return send(res, 400, { ok: false }, origin);
    const visitorHash = hash(visitorId, secret);
    const sessionHash = hash(sessionId, secret);
    const ip = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || "").split(",").pop().trim();
    const ipHash = ip ? hash(ip, secret) : visitorHash;
    const limits = [
      { key: hash("analytics-ip:" + ipHash, secret), max: 600 },
      { key: hash("analytics-visitor:" + visitorHash, secret), max: 180 }
    ];
    for (const item of limits) {
      const limitResponse = await fetch(base + "/rest/v1/rpc/tcs_consume_analytics_rate_limit", {
        method: "POST", headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ p_key: item.key, p_limit: item.max, p_window_seconds: 3600 }), cache: "no-store", signal: AbortSignal.timeout(5000)
      });
      if (!limitResponse.ok || await limitResponse.json() !== true) return send(res, 429, { ok: false, error: "rate_limited" }, origin);
    }
    const ua = String(req.headers["user-agent"] || "").slice(0, 600);
    const classification = classify(ua);
    const siteKey = String(input.siteKey || "").toLowerCase();
    if (!/^[a-z0-9-]{2,80}$/.test(siteKey)) return send(res, 400, { ok: false }, origin);
    const common = {
      site_key: siteKey, visitor_hash: visitorHash, session_hash: sessionHash,
      user_agent: ua || null, is_bot: classification.bot, bot_name: classification.name,
      country_code: String(req.headers["x-vercel-ip-country"] || "").slice(0, 8) || null,
      region_code: String(req.headers["x-vercel-ip-country-region"] || "").slice(0, 80) || null
    };
    if (input.event === "visit") {
      let referrerHost = null;
      try { referrerHost = input.referrer ? new URL(String(input.referrer)).hostname.slice(0,255) : null; } catch {}
      await db("tcs_site_visits", "POST", [{ ...common, page_path: safePath(input.path), referrer_host: referrerHost }], secret, base);
      return send(res, 200, { ok: true }, origin);
    }
    if (input.event === "download") {
      const productCode = String(input.productCode || "").trim().slice(0,100);
      const productName = String(input.productName || "").trim().slice(0,180);
      const url = String(input.url || "").trim();
      if (!/^[a-z0-9][a-z0-9_-]{1,99}$/i.test(productCode) || productName.length < 2 || !/^https:\/\//i.test(url) || url.length > 2000) return send(res, 400, { ok: false }, origin);
      const name = String(input.name || "").trim().slice(0,120) || null;
      const email = String(input.email || "").trim().toLowerCase().slice(0,254) || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { ok: false }, origin);
      const parsedUrl = new URL(url);
      const safeDownloadUrl = parsedUrl.origin + parsedUrl.pathname;
      await db("tcs_product_downloads", "POST", [{
        ...common, product_code: productCode, product_name: productName,
        product_version: String(input.version || "").trim().slice(0,60) || null,
        download_url: safeDownloadUrl, downloader_name: name, downloader_email: email
      }], secret, base);
      return send(res, 200, { ok: true }, origin);
    }
    return send(res, 400, { ok: false }, origin);
  } catch {
    return send(res, 500, { ok: false, error: "tracking_unavailable" }, origin);
  }
}
