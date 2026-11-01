import { createHash, timingSafeEqual } from "node:crypto";

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function env() {
  return {
    base: String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, ""),
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


async function setLicenseState(orderId, licenseStatus, licenseId = null) {
  await dbRequest(
    "tcs_payment_transactions?order_id=eq." + encodeURIComponent(orderId),
    "PATCH",
    { license_status: licenseStatus, ...(licenseId ? { license_id: licenseId } : {}), updated_at: new Date().toISOString() }
  );
}

async function finalizeLinkedLicense(orderId) {
  const transactions = await dbRequest(
    "tcs_payment_transactions?select=id,order_id,product_id,product_sku,amount_idr,license_request_id,license_status&order_id=eq." +
    encodeURIComponent(orderId) + "&limit=1"
  );
  const transaction = Array.isArray(transactions) ? transactions[0] : null;
  if (!transaction || !transaction.license_request_id) return;
  if (transaction.license_status === "issued") return;

  const requestId = transaction.license_request_id;
  const requests = await dbRequest(
    "tcs_license_requests?select=id,product_id,product_sku,status,verification_status,payment_status,expires_at,verified_amount_idr,transaction_reference&id=eq." +
    encodeURIComponent(requestId) + "&limit=1"
  );
  const request = Array.isArray(requests) ? requests[0] : null;
  if (!request || request.product_id !== transaction.product_id || request.product_sku !== transaction.product_sku) {
    await setLicenseState(orderId, "failed");
    return;
  }

  if (request.status === "approved") {
    if (request.transaction_reference !== orderId ||
        Number(request.verified_amount_idr) !== Number(transaction.amount_idr)) {
      await setLicenseState(orderId, "failed");
      return;
    }
    const licenses = await dbRequest(
      "tcs_licenses?select=id&request_id=eq." + encodeURIComponent(requestId) + "&limit=1"
    );
    const licenseId = Array.isArray(licenses) && licenses[0] ? licenses[0].id : null;
    await setLicenseState(orderId, licenseId ? "issued" : "failed", licenseId);
    return;
  }

  if (request.status !== "pending" || Date.parse(request.expires_at) <= Date.now()) {
    await setLicenseState(orderId, "failed");
    return;
  }

  if (request.verification_status === "pending" && request.payment_status === "unverified") {
    const now = new Date().toISOString();
    const verified = await dbRequest(
      "tcs_license_requests?id=eq." + encodeURIComponent(requestId) + "&status=eq.pending&verification_status=eq.pending",
      "PATCH",
      {
        transaction_reference: orderId,
        verification_status: "verified",
        payment_status: "funds_received",
        verified_amount_idr: Number(transaction.amount_idr),
        verified_by: "midtrans",
        verified_at: now,
        verification_note: "Pembayaran dikonfirmasi melalui notifikasi dan Status API Midtrans."
      }
    );
    if (!Array.isArray(verified) || verified.length === 0) {
      const refreshed = await dbRequest(
        "tcs_license_requests?select=id,status,verification_status,payment_status&id=eq." +
        encodeURIComponent(requestId) + "&limit=1"
      );
      const current = Array.isArray(refreshed) ? refreshed[0] : null;
      if (!current || current.status !== "pending" ||
          current.verification_status !== "verified" || current.payment_status !== "funds_received") {
        await setLicenseState(orderId, "failed");
        return;
      }
    } else {
      await dbRequest("tcs_purchase_verifications", "POST", [{
        request_id: requestId,
        product_id: transaction.product_id,
        product_sku: transaction.product_sku,
        transaction_reference: orderId,
        expected_amount_idr: Number(transaction.amount_idr),
        verified_amount_idr: Number(transaction.amount_idr),
        payment_status: "funds_received",
        verification_status: "verified",
        verified_by: "midtrans",
        verification_note: "Notifikasi Midtrans dan Status API terverifikasi.",
        verified_at: now
      }]);
      await dbRequest("tcs_license_events", "POST", [{
        request_id: requestId,
        product_id: transaction.product_id,
        event_type: "purchase_verified_midtrans",
        details: { order_id: orderId, verified_amount_idr: Number(transaction.amount_idr), source: "midtrans_webhook" }
      }]);
    }
  } else if (request.verification_status !== "verified" || request.payment_status !== "funds_received" ||
      request.transaction_reference !== orderId || Number(request.verified_amount_idr) !== Number(transaction.amount_idr)) {
    await setLicenseState(orderId, "failed");
    return;
  }

  const verifiedRequests = await dbRequest(
    "tcs_license_requests?select=id,status,verification_status,payment_status,transaction_reference,verified_amount_idr&id=eq." +
    encodeURIComponent(requestId) + "&limit=1"
  );
  const verifiedRequest = Array.isArray(verifiedRequests) ? verifiedRequests[0] : null;
  if (!verifiedRequest || verifiedRequest.status !== "pending" ||
      verifiedRequest.verification_status !== "verified" ||
      verifiedRequest.payment_status !== "funds_received" ||
      verifiedRequest.transaction_reference !== orderId ||
      Number(verifiedRequest.verified_amount_idr) !== Number(transaction.amount_idr)) {
    await setLicenseState(orderId, "failed");
    return;
  }

  const approval = await dbRequest("rpc/tcs_admin_approve_verified_request", "POST", {
    p_request_id: requestId,
    p_approved_by: "midtrans_webhook"
  });
  if (approval?.ok === true && approval.license_id) {
    await setLicenseState(orderId, "issued", approval.license_id);
    return;
  }
  if (approval?.error === "inventory_empty") {
    await setLicenseState(orderId, "awaiting_inventory");
    return;
  }

  const refreshed = await dbRequest(
    "tcs_license_requests?select=id,status&id=eq." + encodeURIComponent(requestId) + "&limit=1"
  );
  if (Array.isArray(refreshed) && refreshed[0]?.status === "approved") {
    const licenses = await dbRequest(
      "tcs_licenses?select=id&request_id=eq." + encodeURIComponent(requestId) + "&limit=1"
    );
    const licenseId = Array.isArray(licenses) && licenses[0] ? licenses[0].id : null;
    await setLicenseState(orderId, licenseId ? "issued" : "failed", licenseId);
    return;
  }
  await setLicenseState(orderId, "failed");
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
  if (!/^[A-Za-z0-9._~-]{8,50}$/.test(orderId) || !/^\d{3}$/.test(statusCode) ||
      !/^\d+(?:\.\d{1,2})?$/.test(grossAmount) || !/^[a-f0-9]{128}$/i.test(signature)) {
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

    // Load the locally recorded order before accepting any provider status.
    // The Midtrans status amount must match both the signed notification and our own order.
    const recorded = await dbRequest(
      "tcs_payment_transactions?select=order_id,amount_idr,currency,transaction_status,license_status,paid_at,fraud_status&order_id=eq." +
      encodeURIComponent(orderId) + "&limit=1"
    );
    const order = Array.isArray(recorded) ? recorded[0] : null;
    if (!order) return send(res, 404, { ok: false, error: "order_not_found" });

    const providerAmount = Number(status.gross_amount);
    const notificationAmount = Number(grossAmount);
    const expectedAmount = Number(order.amount_idr);
    if (order.currency !== "IDR" || !Number.isSafeInteger(expectedAmount) || expectedAmount <= 0 ||
        !Number.isFinite(providerAmount) || !Number.isFinite(notificationAmount) ||
        !Number.isSafeInteger(providerAmount) || !Number.isSafeInteger(notificationAmount) ||
        providerAmount !== notificationAmount || providerAmount !== expectedAmount) {
      console.error("Midtrans payment amount integrity check failed", { orderId });
      return send(res, 409, { ok: false, error: "transaction_amount_mismatch" });
    }

    const incomingStatus = mapStatus(status.transaction_status);
    const incomingFraudStatus = String(status.fraud_status || "").toLowerCase();
    const alreadyPaid = order.transaction_status === "settlement" ||
      (order.transaction_status === "capture" && String(order.fraud_status || "").toLowerCase() === "accept");
    const incomingPaid = incomingStatus === "settlement" ||
      (incomingStatus === "capture" && incomingFraudStatus === "accept");

    // Never let a delayed non-paid notification overwrite a payment already confirmed as paid.
    // Refund states remain authoritative and are still recorded for reconciliation.
    const isRefund = incomingStatus === "refund" || incomingStatus === "partial_refund";
    if (alreadyPaid && !incomingPaid && !isRefund) {
      await finalizeLinkedLicense(orderId);
      return send(res, 200, { ok: true, orderId, transactionStatus: order.transaction_status, duplicate: true });
    }

    const transactionStatus = incomingStatus;
    const fraudStatus = incomingFraudStatus;
    const paid = incomingPaid || alreadyPaid;

    const update = {
      transaction_status: transactionStatus,
      midtrans_transaction_id: String(status.transaction_id || "").slice(0, 100) || null,
      payment_type: String(status.payment_type || "").slice(0, 60) || null,
      status_message: String(status.status_message || "").slice(0, 500) || null,
      fraud_status: fraudStatus.slice(0, 40) || null,
      ...(paid && !order.paid_at ? { paid_at: new Date().toISOString() } : {}),
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
    if (paid) await finalizeLinkedLicense(orderId);
    return send(res, 200, { ok: true, orderId, transactionStatus });
  } catch (error) {
    console.error("TCS Midtrans notification failed", error?.message || "unknown_error");
    return send(res, 503, { ok: false, error: "notification_processing_unavailable" });
  }
}
