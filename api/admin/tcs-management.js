import { createHmac } from "node:crypto";

const COOKIE = "tcs_owner_session";
const send = (res, status, data) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(data);
};
function cookie(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i >= 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return "";
}
function sameOrigin(req) {
  const origin = req.headers.origin, host = req.headers.host;
  if (origin && host) { try { if (new URL(origin).host !== host) return false; } catch { return false; } }
  return String(req.headers["sec-fetch-site"] || "").toLowerCase() !== "cross-site";
}
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  return await new Promise(resolve => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > 16000) { resolve(null); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}
async function ownerValid(req) {
  const token = cookie(req);
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  const base = String(process.env.TCS_KNOWLEDGE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.TCS_KNOWLEDGE_PUBLISHABLE_KEY || "";
  const secret = process.env.TCS_OWNER_AUTH_SERVER_KEY || "";
  if (!base || !key || !secret) return false;
  try {
    const r = await fetch(base + "/rest/v1/rpc/tcs_owner_validate_session", {
      method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token, p_server_key: secret }), cache: "no-store", signal: AbortSignal.timeout(6000)
    });
    return r.ok && await r.json() === true;
  } catch { return false; }
}
function config() {
  const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!base || !key) throw new Error("backend_unavailable");
  return { base, key };
}
async function db(path, method = "GET", payload, prefer) {
  const { base, key } = config();
  const headers = { apikey: key, Authorization: "Bearer " + key, Accept: "application/json", "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(base + "/rest/v1/" + path, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(12000) });
  const data = await r.json().catch(() => null);
  if (!r.ok) { console.error("TCS management DB error", { status: r.status, path: path.split("?")[0] }); throw new Error("database_error"); }
  return data;
}
async function count(path) {
  const { base, key } = config();
  const r = await fetch(base + "/rest/v1/" + path, { method: "GET", headers: { apikey: key, Authorization: "Bearer " + key, Prefer: "count=exact", Range: "0-0" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("database_error");
  const range = r.headers.get("content-range") || "";
  const total = Number(range.split("/").pop());
  return Number.isFinite(total) ? total : 0;
}
function validId(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || "")); }

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
  if (!await ownerValid(req)) return send(res, 401, { ok: false, error: "owner_session_required" });
  const input = await body(req);
  if (!input || typeof input !== "object" || Array.isArray(input)) return send(res, 400, { ok: false, error: "invalid_json" });

  try {
    const action = String(input.action || "");
    if (action === "bootstrap") {
      const [visits, downloads, brands, applications, crawlerJobs, totalVisits, botVisits, humanVisits, totalDownloads] = await Promise.all([
        db("tcs_site_visits?select=id,site_key,page_path,referrer_host,user_agent,is_bot,bot_name,country_code,region_code,created_at&order=created_at.desc&limit=250"),
        db("tcs_product_downloads?select=id,site_key,product_code,product_name,product_version,download_url,downloader_name,downloader_email,is_bot,created_at&order=created_at.desc&limit=250"),
        db("tcs_brands?select=*&order=created_at.desc&limit=250"),
        db("tcs_brand_applications?select=*&order=created_at.desc&limit=250"),
        db("tcs_crawler_jobs?select=id,seed_url,status,max_pages,pages_crawled,pages_failed,created_at,last_activity_at&order=created_at.desc&limit=50"),
        count("tcs_site_visits?select=id"),
        count("tcs_site_visits?select=id&is_bot=eq.true"),
        count("tcs_site_visits?select=id&is_bot=eq.false"),
        count("tcs_product_downloads?select=id")
      ]);
      return send(res, 200, { ok: true, visits, downloads, brands, applications, crawlerJobs, stats: { totalVisits, botVisits, humanVisits, totalDownloads } });
    }
    if (action === "review_application") {
      if (!validId(input.id) || !["reviewing","approved","rejected"].includes(input.status)) throw new Error("invalid_input");
      const result = await db("rpc/tcs_review_brand_application", "POST", {
        p_application_id: input.id, p_status: input.status,
        p_reviewer_note: typeof input.note === "string" ? input.note.trim().slice(0, 2000) : null
      });
      return send(res, 200, { ok: true, result });
    }
    if (action === "set_brand_status") {
      if (!validId(input.id) || !["active","paused","archived"].includes(input.status)) throw new Error("invalid_input");
      const result = await db("tcs_brands?id=eq." + encodeURIComponent(input.id), "PATCH", { status: input.status, updated_at: new Date().toISOString() }, "return=representation");
      if (!result?.length) throw new Error("brand_not_found");
      return send(res, 200, { ok: true, brand: result[0] });
    }
    if (action === "update_brand_security") {
      if (!validId(input.id) || !["not_assessed","reviewing","secured","attention_required"].includes(input.security_status)) throw new Error("invalid_input");
      const result = await db("tcs_brands?id=eq." + encodeURIComponent(input.id), "PATCH", {
        security_status: input.security_status,
        security_notes: typeof input.security_notes === "string" ? input.security_notes.trim().slice(0, 5000) || null : null,
        updated_at: new Date().toISOString()
      }, "return=representation");
      if (!result?.length) throw new Error("brand_not_found");
      return send(res, 200, { ok: true, brand: result[0] });
    }
    if (action === "crawler_control") {
      if (!validId(input.id) || !["pause","resume"].includes(input.command)) throw new Error("invalid_input");
      const status = input.command === "pause" ? "paused" : "running";
      const result = await db("tcs_crawler_jobs?id=eq." + encodeURIComponent(input.id), "PATCH", { status, updated_at: new Date().toISOString() }, "return=representation");
      if (!result?.length) throw new Error("job_not_found");
      await db("tcs_crawler_events", "POST", [{ job_id: input.id, event_type: input.command, message: input.command === "pause" ? "Crawling dijeda oleh Owner" : "Crawling dilanjutkan oleh Owner", details: { actor: "owner_admin_panel" } }], "return=minimal");
      return send(res, 200, { ok: true, job: result[0] });
    }
    return send(res, 400, { ok: false, error: "unknown_action" });
  } catch (error) {
    const code = String(error?.message || "request_failed");
    const status = code === "invalid_input" ? 400 : code === "brand_not_found" || code === "job_not_found" ? 404 : 500;
    return send(res, status, { ok: false, error: status === 500 ? "management_request_failed" : code });
  }
}
