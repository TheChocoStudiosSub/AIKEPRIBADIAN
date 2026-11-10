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

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
  if (!validateAdminSession(req)) return send(res, 401, { ok: false, error: "owner_session_required" });

  const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || "");
  if (!base || !key) return send(res, 503, { ok: false, error: "payment_backend_not_configured" });
  try {
    const response = await fetch(base + "/rest/v1/tcs_payment_transactions?select=id,order_id,product_name,product_sku,amount_idr,currency,customer_name,customer_email,customer_phone,transaction_status,payment_type,midtrans_transaction_id,status_message,fraud_status,paid_at,expires_at,license_status,license_id,created_at,updated_at&order=created_at.desc&limit=200", {
      headers: {
        apikey: key,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    const rows = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(rows)) return send(res, 502, { ok: false, error: "payment_records_unavailable" });
    return send(res, 200, {
      ok: true,
      transactions: rows,
      totals: {
        count: rows.length,
        paid: rows.filter((x) => ["capture", "settlement"].includes(x.transaction_status) &&
          (x.transaction_status !== "capture" || String(x.fraud_status || "").toLowerCase() === "accept"))
          .reduce((sum, x) => sum + Number(x.amount_idr || 0), 0),
        pending: rows.filter((x) => x.transaction_status === "pending").length,
        settled: rows.filter((x) => x.transaction_status === "settlement").length
      }
    });
  } catch {
    return send(res, 503, { ok: false, error: "payment_records_unavailable" });
  }
}
