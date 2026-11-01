function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "method_not_allowed" });
  const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || "");
  if (!base || !key) return send(res, 503, { ok: false, error: "payment_backend_not_configured" });
  try {
    const response = await fetch(base + "/rest/v1/tcs_license_products?select=product_id,product_sku,product_name,expected_amount_idr,currency&active=eq.true&order=product_name.asc", {
      headers: { apikey: key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });
    const products = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(products)) return send(res, 502, { ok: false, error: "product_catalog_unavailable" });
    return send(res, 200, {
      ok: true,
      products: products.map((product) => ({
        productId: product.product_id,
        sku: product.product_sku,
        name: product.product_name,
        amountIdr: Number.isSafeInteger(Number(product.expected_amount_idr)) ? Number(product.expected_amount_idr) : null,
        currency: product.currency
      }))
    });
  } catch {
    return send(res, 503, { ok: false, error: "product_catalog_unavailable" });
  }
}
