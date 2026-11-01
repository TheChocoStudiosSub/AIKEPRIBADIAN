function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try { if (new URL(origin).host !== host) return false; } catch { return false; }
  }
  return String(req.headers["sec-fetch-site"] || "").toLowerCase() !== "cross-site";
}

async function ownerRpc(action, payload = {}) {
  const base = String(process.env.TCS_KNOWLEDGE_SUPABASE_URL || "").replace(/\\/+$/, "");
  const publishableKey = String(process.env.TCS_KNOWLEDGE_PUBLISHABLE_KEY || "");
  const serverKey = String(process.env.TCS_OWNER_AUTH_SERVER_KEY || "");
  if (!base || !publishableKey || !serverKey) return { ok: false };
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
    if (!response.ok) return { ok: false };
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
  const token = readCookie(req, "tcs_owner_session");
  if (!/^[a-f0-9]{64}$/i.test(token)) return send(res, 401, { ok: false, error: "owner_session_required" });
  const session = await ownerRpc("tcs_owner_validate_session", { p_token: token });
  if (!session.ok || session.data !== true) return send(res, 401, { ok: false, error: "owner_session_required" });

  const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || "");
  if (!base || !key) return send(res, 503, { ok: false, error: "payment_backend_not_configured" });
  try {
    const response = await fetch(base + "/rest/v1/tcs_payment_transactions?select=id,order_id,product_name,product_sku,amount_idr,currency,customer_name,customer_email,customer_phone,transaction_status,payment_type,midtrans_transaction_id,status_message,fraud_status,paid_at,expires_at,created_at,updated_at&order=created_at.desc&limit=200", {
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
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
