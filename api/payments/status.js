function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "method_not_allowed" });
  const orderId = String(req.query?.orderId || "").trim();
  if (!/^[A-Za-z0-9._~-]{8,50}$/.test(orderId)) return send(res, 400, { ok: false, error: "invalid_order_id" });
  const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || "");
  if (!base || !key) return send(res, 503, { ok: false, error: "payment_backend_not_configured" });
  try {
    const response = await fetch(base + "/rest/v1/tcs_payment_transactions?select=order_id,product_name,amount_idr,transaction_status,payment_type,paid_at,created_at&order_id=eq." + encodeURIComponent(orderId) + "&limit=1", {
      headers: { apikey: key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });
    const rows = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(rows)) return send(res, 502, { ok: false, error: "payment_status_unavailable" });
    if (!rows.length) return send(res, 404, { ok: false, error: "order_not_found" });
    const row = rows[0];
    return send(res, 200, {
      ok: true,
      orderId: row.order_id,
      productName: row.product_name,
      amountIdr: Number(row.amount_idr),
      status: row.transaction_status,
      paymentType: row.payment_type,
      paidAt: row.paid_at,
      createdAt: row.created_at
    });
  } catch {
    return send(res, 503, { ok: false, error: "payment_status_unavailable" });
  }
}
