import { handleTcsManagement } from "../_lib/tcs-management.js";
import { validateAdminSession } from "../_lib/admin-auth.js";

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
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 16000) { resolve(null); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

async function db(path, method = "GET", payload, prefer) {
  const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!base || !key) throw new Error("ecosystem_backend_not_configured");
  const headers = { apikey: key, Authorization: "Bearer " + key, Accept: "application/json", "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(base + "/rest/v1/" + path, {
    method, headers, cache: "no-store",
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("TCS ecosystem database error", { status: response.status, path: path.split("?")[0] });
    throw new Error("ecosystem_database_error");
  }
  return data;
}

function text(value, max, pattern) {
  const result = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (pattern && result && !pattern.test(result)) throw new Error("invalid_input");
  return result;
}

function int(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error("invalid_input");
  return number;
}

const SELECT = {
  plans: "tcs_ecosystem_plans?select=*&order=plan_code.asc",
  apps: "tcs_ecosystem_apps?select=*&order=app_name.asc",
  entitlements: "tcs_plan_app_entitlements?select=*&order=plan_code.asc,app_code.asc",
  fees: "tcs_transaction_fee_rules?select=*&order=plan_code.asc,version.desc",
  promos: "tcs_promotions?select=*&order=created_at.desc",
  customers: "tcs_customer_accounts?select=customer_id,display_name,business_name,account_status,created_at&order=created_at.desc&limit=250",
  subscriptions: "tcs_customer_subscriptions?select=id,customer_id,plan_code,status,starts_at,ends_at,created_at&order=created_at.desc&limit=250",
  reports: "tcs_daily_report_runs?select=id,customer_id,report_date,report_period,plan_code,scheduled_for,status,missing_app_codes,generated_at&order=report_date.desc&limit=250"
};

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
  if (!validateAdminSession(req)) return send(res, 401, { ok: false, error: "owner_session_required" });
  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) return send(res, 400, { ok: false, error: "invalid_json" });
  const feature = new URL(req.url || "/", "https://local.invalid").searchParams.get("feature");
  if (feature === "tcs-management") return handleTcsManagement(req, res, body);

  try {
    const action = text(body.action, 40, /^[a-z_]+$/);
    if (action === "bootstrap") {
      const [plans, apps, entitlements, fees, promos, customers, subscriptions, reports] = await Promise.all([
        db(SELECT.plans), db(SELECT.apps), db(SELECT.entitlements), db(SELECT.fees),
        db(SELECT.promos), db(SELECT.customers), db(SELECT.subscriptions), db(SELECT.reports)
      ]);
      return send(res, 200, { ok: true, plans, apps, entitlements, fees, promos, customers, subscriptions, reports });
    }
    if (action === "save_app") {
      const appCode = text(body.app_code, 100, /^[a-z0-9][a-z0-9_-]{2,99}$/);
      const appName = text(body.app_name, 160);
      const lifecycle = text(body.lifecycle, 20);
      const appKind = text(body.app_kind, 20);
      if (appName.length < 3 || !["active","planned","retired"].includes(lifecycle) || !["desktop","web","service"].includes(appKind)) throw new Error("invalid_input");
      const repository = text(body.repository_full_name, 160, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
      const appUrl = text(body.app_url, 500);
      if (appUrl && !/^https:\/\//i.test(appUrl)) throw new Error("invalid_input");
      const payload = {
        app_code: appCode, app_name: appName, app_kind: appKind, lifecycle,
        repository_full_name: repository || null, app_url: appUrl || null,
        supports_business_data: body.supports_business_data === true,
        supports_daily_report: body.supports_daily_report === true,
        metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {}
      };
      const saved = await db("tcs_ecosystem_apps?on_conflict=app_code", "POST", [payload], "resolution=merge-duplicates,return=representation");
      return send(res, 200, { ok: true, app: saved?.[0] || null });
    }
    if (action === "save_plan") {
      const planCode = text(body.plan_code, 20);
      if (!["basic","pro","business"].includes(planCode)) throw new Error("invalid_input");
      const maxApps = planCode === "business" ? null : (planCode === "basic" ? 1 : 3);
      const feeBps = int(body.transaction_fee_basis_points, 0, 10000);
      const saved = await db("tcs_ecosystem_plans?plan_code=eq." + planCode, "PATCH", {
        max_connected_apps: maxApps,
        includes_all_apps: planCode === "business",
        transaction_fee_basis_points: feeBps,
        transaction_fee_enabled: false,
        daily_report_enabled: body.daily_report_enabled === true,
        daily_report_time: text(body.daily_report_time || "21:00", 5, /^(?:[01]\d|2[0-3]):[0-5]\d$/),
        timezone: text(body.timezone || "Asia/Jakarta", 64),
        feature_entitlements: body.feature_entitlements && typeof body.feature_entitlements === "object" && !Array.isArray(body.feature_entitlements) ? body.feature_entitlements : {}
      }, "return=representation");
      if (!saved?.length) throw new Error("plan_not_found");
      return send(res, 200, { ok: true, plan: saved[0], fee_collection_enabled: false });
    }
    if (action === "save_entitlements") {
      const planCode = text(body.plan_code, 20);
      if (!["basic","pro","business"].includes(planCode) || !Array.isArray(body.entitlements) || body.entitlements.length > 100) throw new Error("invalid_input");
      const rows = body.entitlements.map(item => ({
        plan_code: planCode,
        app_code: text(item.app_code, 100, /^[a-z0-9][a-z0-9_-]{2,99}$/),
        can_access: item.can_access === true,
        can_sync: item.can_sync === true && planCode !== "basic",
        report_enabled: item.report_enabled === true
      }));
      const registered = await db("tcs_ecosystem_apps?select=app_code&lifecycle=neq.retired");
      const registeredCodes = new Set((registered || []).map(item => item.app_code));
      if (rows.some(item => !registeredCodes.has(item.app_code))) throw new Error("unknown_app");
      const allowed = rows.filter(item => item.can_access).map(item => item.app_code);
      if (planCode === "basic" && (allowed.length !== 1 || allowed[0] !== "kasirkita" || rows.some(item => item.can_sync))) {
        throw new Error("basic_must_only_include_kasirkita");
      }
      if (planCode === "pro" && !allowed.includes("kasirkita")) {
        throw new Error("pro_must_include_kasirkita");
      }
      if (planCode === "business" && (allowed.length !== registeredCodes.size || [...registeredCodes].some(code => !allowed.includes(code)))) {
        throw new Error("business_must_include_all_apps");
      }
      const saved = await db("tcs_plan_app_entitlements?on_conflict=plan_code,app_code", "POST", rows, "resolution=merge-duplicates,return=representation");
      return send(res, 200, { ok: true, entitlements: saved || [] });
    }
    if (action === "save_fee_rule") {
      const planCode = text(body.plan_code, 20);
      if (!["basic","pro","business"].includes(planCode)) throw new Error("invalid_input");
      const feeBps = int(body.fee_basis_points, 0, 10000);
      const rows = await db("tcs_transaction_fee_rules?select=version&plan_code=eq." + planCode + "&order=version.desc&limit=1");
      const version = Number(rows?.[0]?.version || 0) + 1;
      const saved = await db("tcs_transaction_fee_rules", "POST", [{
        plan_code: planCode, fee_basis_points: feeBps,
        calculation_base: "successful_transaction_amount", status: "draft", version
      }], "return=representation");
      await db("tcs_ecosystem_plans?plan_code=eq." + planCode, "PATCH", {
        transaction_fee_basis_points: feeBps, transaction_fee_enabled: false
      }, "return=minimal");
      return send(res, 200, { ok: true, fee_rule: saved?.[0] || null, collection_enabled: false });
    }
    if (action === "create_promo") {
      const promoCode = text(body.promo_code, 40, /^[A-Za-z0-9_-]{3,40}$/).toUpperCase();
      const discount = Number(body.discount_percent);
      if (!promoCode || !Number.isFinite(discount) || discount <= 0 || discount > 100) throw new Error("invalid_input");
      const startsAt = new Date(body.starts_at);
      const endsAt = new Date(body.ends_at);
      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) throw new Error("invalid_input");
      const appCodes = Array.isArray(body.app_codes) ? body.app_codes.slice(0, 100).map(x => text(x, 100, /^[a-z0-9][a-z0-9_-]{2,99}$/)) : [];
      const planCodes = Array.isArray(body.plan_codes) ? body.plan_codes.slice(0, 3).map(x => text(x, 20)) : [];
      if (planCodes.some(x => !["basic","pro","business"].includes(x))) throw new Error("invalid_input");
      const limit = body.usage_limit === "" || body.usage_limit === null || body.usage_limit === undefined ? null : int(body.usage_limit, 1, 10000000);
      const saved = await db("tcs_promotions", "POST", [{
        promo_code: promoCode, discount_percent: discount, applicable_app_codes: appCodes,
        applicable_plan_codes: planCodes, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
        usage_limit: limit, active: body.active === true
      }], "return=representation");
      return send(res, 200, { ok: true, promo: saved?.[0] || null });
    }
    if (action === "set_promo_status") {
      const id = text(body.id, 36, /^[0-9a-f-]{36}$/i);
      const rows = await db("tcs_promotions?id=eq." + id, "PATCH", { active: body.active === true }, "return=representation");
      if (!rows?.length) throw new Error("promo_not_found");
      return send(res, 200, { ok: true, promo: rows[0] });
    }
    return send(res, 400, { ok: false, error: "unknown_action" });
  } catch (error) {
    const code = error?.message || "ecosystem_request_failed";
    const status = code === "invalid_input" ? 400 : code.endsWith("_not_found") ? 404 : 503;
    return send(res, status, { ok: false, error: code });
  }
}
