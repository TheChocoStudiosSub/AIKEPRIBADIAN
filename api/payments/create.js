import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try { if (new URL(origin).host !== host) return false; } catch { return false; }
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
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 16000) { resolve(null); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

function env() {
  const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || "");
  const serverKey = String(process.env.MIDTRANS_SERVER_KEY || "");
  const production = String(process.env.MIDTRANS_IS_PRODUCTION || "false").toLowerCase() === "true";
  return { base, key, serverKey, production };
}

async function dbRequest(path, method = "GET", body) {
  const { base, key } = env();
  if (!base || !key) throw new Error("database_not_configured");
  const response = await fetch(base + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: key,
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

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeEqualHex(left, right) {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });

  const { base, key, serverKey, production } = env();
  if (!base || !key || !serverKey) {
    return send(res, 503, { ok: false, error: "payment_backend_not_configured" });
  }

  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return send(res, 400, { ok: false, error: "invalid_json" });
  }

  const productId = clean(body.productId, 100).toLowerCase();
  const customerName = clean(body.customerName, 100);
  const customerEmail = clean(body.customerEmail, 254).toLowerCase();
  const customerPhone = clean(body.customerPhone, 30);
  const requestId = clean(body.requestId, 40);
  const requestToken = clean(body.requestToken, 200);
  const hasLicenseRequest = Boolean(requestId || requestToken);
  if (!/^[a-z0-9][a-z0-9_-]{2,99}$/.test(productId) ||
      customerName.length < 2 || !validEmail(customerEmail) ||
      !/^[+0-9(). -]{8,30}$/.test(customerPhone) ||
      (hasLicenseRequest && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) ||
        requestToken.length < 20 || requestToken.length > 200))) {
    return send(res, 400, { ok: false, error: "invalid_checkout_details" });
  }

  try {
    const products = await dbRequest(
      "tcs_license_products?select=product_id,product_sku,product_name,expected_amount_idr,currency&product_id=eq." +
      encodeURIComponent(productId) + "&active=eq.true&limit=1"
    );
    const product = Array.isArray(products) ? products[0] : null;
    if (!product) return send(res, 404, { ok: false, error: "product_unavailable" });
    const amount = Number(product.expected_amount_idr);
    if (!Number.isSafeInteger(amount) || amount <= 0 || product.currency !== "IDR") {
      return send(res, 409, { ok: false, error: "product_price_not_configured" });
    }

    if (hasLicenseRequest) {
      const requests = await dbRequest(
        "tcs_license_requests?select=id,product_id,product_sku,request_token_hash,status,verification_status,payment_status,buyer_username,transaction_reference,expires_at&id=eq." +
        encodeURIComponent(requestId) + "&limit=1"
      );
      const licenseRequest = Array.isArray(requests) ? requests[0] : null;
      const tokenHash = createHash("sha256").update(requestToken, "utf8").digest("hex");
      if (!licenseRequest || !safeEqualHex(licenseRequest.request_token_hash, tokenHash)) {
        return send(res, 404, { ok: false, error: "license_request_not_found" });
      }
      if (licenseRequest.product_id !== product.product_id || licenseRequest.product_sku !== product.product_sku) {
        return send(res, 409, { ok: false, error: "license_request_product_mismatch" });
      }
      if (licenseRequest.status !== "pending" || licenseRequest.verification_status !== "pending" ||
          licenseRequest.payment_status !== "unverified" || licenseRequest.buyer_username ||
          licenseRequest.transaction_reference || Date.parse(licenseRequest.expires_at) <= Date.now()) {
        return send(res, 409, { ok: false, error: "license_request_not_payable" });
      }
      const previous = await dbRequest(
        "tcs_payment_transactions?select=order_id,snap_token,redirect_url,amount_idr,product_name&license_request_id=eq." +
        encodeURIComponent(requestId) + "&transaction_status=eq.pending&order=created_at.desc&limit=1"
      );
      if (Array.isArray(previous) && previous.length) {
        return send(res, 200, {
          ok: true,
          orderId: previous[0].order_id,
          token: previous[0].snap_token,
          redirectUrl: previous[0].redirect_url,
          amountIdr: Number(previous[0].amount_idr),
          productName: previous[0].product_name,
          reused: true
        });
      }
    }

    const orderId = "TCS-" + Date.now().toString(36).toUpperCase() + "-" +
      randomBytes(6).toString("hex").toUpperCase();
    const midtransHost = production ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
    const auth = Buffer.from(serverKey + ":", "utf8").toString("base64");
    const snapResponse = await fetch(midtransHost + "/snap/v1/transactions", {
      method: "POST",
      headers: {
        Authorization: "Basic " + auth,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: amount },
        item_details: [{
          id: product.product_sku,
          price: amount,
          quantity: 1,
          name: product.product_name.slice(0, 50)
        }],
        customer_details: {
          first_name: customerName,
          email: customerEmail,
          phone: customerPhone
        }
      }),
      signal: AbortSignal.timeout(20000)
    });
    const snap = await snapResponse.json().catch(() => null);
    if (!snapResponse.ok || typeof snap?.token !== "string" || typeof snap?.redirect_url !== "string") {
      console.error("Midtrans Snap token request failed", { status: snapResponse.status, orderId });
      return send(res, 502, { ok: false, error: "midtrans_checkout_unavailable" });
    }

    await dbRequest("tcs_payment_transactions", "POST", {
      order_id: orderId,
      product_id: product.product_id,
      product_sku: product.product_sku,
      product_name: product.product_name,
      amount_idr: amount,
      currency: "IDR",
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      transaction_status: "pending",
      snap_token: snap.token,
      redirect_url: snap.redirect_url,
      license_request_id: hasLicenseRequest ? requestId : null,
      license_status: hasLicenseRequest ? "awaiting_payment" : "not_linked"
    });

    return send(res, 200, {
      ok: true,
      orderId,
      token: snap.token,
      redirectUrl: snap.redirect_url,
      amountIdr: amount,
      productName: product.product_name
    });
  } catch (error) {
    console.error("TCS payment creation failed", error?.message || "unknown_error");
    return send(res, 503, { ok: false, error: "payment_service_unavailable" });
  }
}
