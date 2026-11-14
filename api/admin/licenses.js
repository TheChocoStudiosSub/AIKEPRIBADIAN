import { validateAdminSession } from "../_lib/admin-auth.js";
import { callAdminBridge } from "../_lib/tcs-management.js";

const ALLOWED_ACTIONS = new Set([
  "dashboard", "list_pending", "list_requests", "list_products", "list_inventory",
  "list_licenses", "list_events", "verify_purchase", "hold", "approve", "reject",
  "import_preissued", "set_product_price", "set_license_status"
]);

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}
function sameOrigin(req) {
  const origin = String(req.headers.origin || "");
  const host = String(req.headers.host || "");
  const allowed = String(process.env.TCS_ADMIN_ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) return true;
  if (origin && host) {
    try { if (new URL(origin).host !== host) return false; } catch { return false; }
  }
  return String(req.headers["sec-fetch-site"] || "").toLowerCase() !== "cross-site";
}
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  return await new Promise(resolve => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > 16000) { resolve(null); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
  if (!validateAdminSession(req)) return send(res, 401, { ok: false, error: "owner_session_required" });
  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) return send(res, 400, { ok: false, error: "invalid_json" });
  const action = String(body.action || "").slice(0, 32);
  if (!ALLOWED_ACTIONS.has(action)) return send(res, 400, { ok: false, error: "unknown_action" });
  try {
    const result = await callAdminBridge(req, "license_admin", body);
    return send(res, result.status, result.data);
  } catch (error) {
    console.error("TCS license admin bridge failed", String(error?.message || error));
    return send(res, 503, { ok: false, error: "admin_backend_unavailable" });
  }
}
