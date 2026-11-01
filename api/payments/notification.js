import { createHash, timingSafeEqual } from "node:crypto";

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function env() {
  return {
    base: String(process.env.TCS_SUPABASE_URL || "").replace(/\\/+$/, ""),
    key: String(process.env.SUPABASE_SECRET_KEY || ""),
    serverKey: String(process.env.MIDTRANS_SERVER_KEY || ""),
    production: String(process.env.MIDTRANS_IS_PRODUCTION || "false").toLowerCase() === "true"
  };
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function dbRequest(path, method = "GET", body) {
  const { base, key } = env();
  if (!base || !key) throw new Error("database_not_configured");
  const response = await fetch(base + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation"
    },
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("database_request_failed");
  return data;
}

function mapStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["capture", "settlement", "pending", "deny", "cancel", "expire", "refund", "partial_refund", "challenge"].includes(value)) return value;
  return "failure";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  const { base, key, serverKey, production } = env();
  if (!base || !key || !serverKey) return send(res, 503, { ok: false, error: "payment_backend_not_configured" });

  const body = req.body && typeof req.body === "object" ? req.body : null;
  if (!body || Array.isArray(body)) return send(res, 400, { ok: false, error: "invalid_notification" });
  const orderId = String(body.order_id || "");
  const statusCode = String(body.status_code || "");
  const grossAmount = String(body.gross_amount || "");
  const signature = String(body.signature_key || "");
  if (!/^[A-Za-z0-9._~-]{8,50}$/.test(orderId) || !/^\\d{3}$/.test(statusCode) ||
      !/^\\d+(?:\\.\\d{1,2})?$/.test(grossAmount) || !/^[a-f0-9]{128}$/i.test(signature)) {
    return send(res, 400, { ok: false, error: "invalid_notification_fields" });
  }

  const expected = createHash("sha512")
    .update(orderId + statusCode + grossAmount + serverKey, "utf8")
    .digest("hex");
  if (!safeEqual(signature.toLowerCase(), expected)) {
    return send(res, 403, { ok: false, error: "invalid_notification_signature" });
  }

  try {
    const apiHost = production ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
    const auth = Buffer.from(serverKey + ":", "utf8").toString("base64");
    const statusResponse = await fetch(apiHost + "/v2/" + encodeURIComponent(orderId) + "/status", {
      headers: { Authorization: "Basic " + auth, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
    const status = await statusResponse.json().catch(() => null);
    if (!statusResponse.ok || !status || String(status.order_id) !== orderId) {
      return send(res, 502, { ok: false, error: "midtrans_status_verification_failed" });
    }

    const amount = Number(status.gross_amount);
    if (!Number.isSafeInteger(Math.round(amount)) || Math.round(amount * 100) !== Math.round(Number(grossAmount) * 100)) {
      return send(res, 409, { ok: false, error: "transaction_amount_mismatch" });
    }
    const transactionStatus = mapStatus(status.transaction_status);
    const fraudStatus = String(status.fraud_status || "").toLowerCase();
    const paid = transactionStatus === "settlement" ||
      (transactionStatus === "capture" && fraudStatus === "accept");

    const update = {
      transaction_status: transactionStatus,
      midtrans_transaction_id: String(status.transaction_id || "").slice(0, 100) || null,
      payment_type: String(status.payment_type || "").slice(0, 60) || null,
      status_message: String(status.status_message || "").slice(0, 500) || null,
      fraud_status: fraudStatus.slice(0, 40) || null,
      paid_at: paid ? new Date().toISOString() : null,
      notification_payload: {
        transaction_status: transactionStatus,
        transaction_time: String(status.transaction_time || "").slice(0, 40),
        settlement_time: String(status.settlement_time || "").slice(0, 40),
        payment_type: String(status.payment_type || "").slice(0, 60),
        status_code: String(status.status_code || "").slice(0, 8)
      },
      updated_at: new Date().toISOString()
    };
    const rows = await dbRequest(
      "tcs_payment_transactions?order_id=eq." + encodeURIComponent(orderId),
      "PATCH",
      update
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error("Midtrans notification order not found in TCS", { orderId });
      return send(res, 404, { ok: false, error: "order_not_found" });
    }
    return send(res, 200, { ok: true, orderId, transactionStatus });
  } catch (error) {
    console.error("TCS Midtrans notification failed", error?.message || "unknown_error");
    return send(res, 503, { ok: false, error: "notification_processing_unavailable" });
  }
}
