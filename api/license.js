const SUPABASE_FUNCTION_URL = "https://jzatbvxpclwbkjflkyan.supabase.co/functions/v1/tcs-license";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_CXEBG6c3PXW8DuQTn2IOyw_y9ZQdYBz";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const action = ["submit_purchase_reference", "claim"].includes(body?.action) ? body.action : "status";
  const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
  const requestToken = typeof body?.requestToken === "string" ? body.requestToken.trim() : "";
  if (!UUID_RE.test(requestId) || requestToken.length < 20 || requestToken.length > 200) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const payload = { action, requestId, requestToken };
  if (action === "submit_purchase_reference" || action === "claim") {
    const reference = typeof body?.purchaseReference === "string" ? body.purchaseReference.trim() : "";
    if (reference.length < 4 || reference.length > 120) {
      return res.status(400).json({ error: "invalid_purchase_reference" });
    }
    payload.purchaseReference = reference;
  }
  try {
    const upstream = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
      cache: "no-store",
      body: JSON.stringify(payload)
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const status = upstream.status === 404 ? 404 : upstream.status >= 500 ? 503 : upstream.status;
      return res.status(status).json({ error: result.error || "license_request_failed" });
    }
    if (action === "submit_purchase_reference") {
      return res.status(200).json({ ok: true, submitted: Boolean(result.submitted), requestId: result.requestId || requestId });
    }
    if (action === "claim") {
      if (result.productId !== "tcs-stock-sales-basic" || typeof result.licenseKey !== "string" || !result.licenseKey) {
        return res.status(502).json({ error: "unexpected_license_response" });
      }
      return res.status(200).json({
        ok: true,
        requestId: result.requestId || requestId,
        productId: result.productId,
        licenseKey: result.licenseKey,
        source: "preissued_inventory"
      });
    }
    if (result.productId !== "tcs-stock-sales-basic" || !["pending", "approved", "rejected", "expired"].includes(result.status)) {
      return res.status(502).json({ error: "unexpected_license_response" });
    }
    return res.status(200).json({
      ok: true, requestId: result.requestId, productId: result.productId,
      status: result.status, expiresAt: result.expiresAt || null,
      purchaseReferenceReceived: Boolean(result.purchaseReferenceReceived)
    });
  } catch {
    return res.status(503).json({ error: "license_service_unavailable" });
  }
}
