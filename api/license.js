const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "method_not_allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return send(res, 400, { error: "invalid_json" });
  }

  const allowedActions = new Set(["status", "submit_purchase_reference", "deliver"]);
  const action = String(body.action || "status");
  if (!allowedActions.has(action)) return send(res, 400, { error: "unknown_action" });

  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const requestToken = typeof body.requestToken === "string" ? body.requestToken.trim() : "";
  if (!UUID_RE.test(requestId) || requestToken.length < 20 || requestToken.length > 200) {
    return send(res, 400, { error: "invalid_request" });
  }

  const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = String(process.env.TCS_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "");
  if (!base || !publishableKey) return send(res, 503, { error: "license_service_not_configured" });

  const payload = { action, requestId, requestToken };
  if (action === "submit_purchase_reference") {
    const buyerUsername = typeof body.buyerUsername === "string" ? body.buyerUsername.trim() : "";
    const transactionReference = typeof body.transactionReference === "string" ? body.transactionReference.trim() : "";
    if (!/^[A-Za-z0-9._-]{3,80}$/.test(buyerUsername) ||
        transactionReference.length < 4 || transactionReference.length > 120) {
      return send(res, 400, { error: "invalid_purchase_details" });
    }
    payload.buyerUsername = buyerUsername;
    payload.transactionReference = transactionReference;
  }

  try {
    const upstream = await fetch(base + "/functions/v1/tcs-license", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey
      },
      cache: "no-store",
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000)
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const status = upstream.status === 404 ? 404 : upstream.status >= 500 ? 503 : upstream.status;
      return send(res, status, { error: result.error || "license_request_failed" });
    }

    if (action === "submit_purchase_reference") {
      return send(res, 200, {
        ok: true,
        submitted: Boolean(result.submitted),
        requestId: result.requestId || requestId,
        productSku: result.productSku || "tcs-stock-sales-basic"
      });
    }

    if (action === "deliver") {
      if (result.productId !== "tcs-stock-sales-basic" ||
          typeof result.licenseKey !== "string" || !result.licenseKey) {
        return send(res, 502, { error: "unexpected_license_response" });
      }
      return send(res, 200, {
        ok: true,
        requestId: result.requestId || requestId,
        productId: result.productId,
        productSku: result.productSku || "tcs-stock-sales-basic",
        licenseKey: result.licenseKey,
        source: "preissued_inventory"
      });
    }

    if (result.productId !== "tcs-stock-sales-basic" ||
        !["pending", "approved", "rejected", "expired"].includes(result.status)) {
      return send(res, 502, { error: "unexpected_license_response" });
    }
    return send(res, 200, {
      ok: true,
      requestId: result.requestId,
      productId: result.productId,
      productSku: result.productSku || "tcs-stock-sales-basic",
      status: result.status,
      verificationStatus: result.verificationStatus || "pending",
      paymentStatus: result.paymentStatus || "unverified",
      buyerDetailsReceived: Boolean(result.buyerDetailsReceived),
      expiresAt: result.expiresAt || null
    });
  } catch {
    return send(res, 503, { error: "license_service_unavailable" });
  }
}
