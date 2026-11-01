function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

export default function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "method_not_allowed" });
  const clientKey = String(process.env.MIDTRANS_CLIENT_KEY || "").trim();
  if (!clientKey) return send(res, 503, { ok: false, error: "payment_frontend_not_configured" });
  const production = String(process.env.MIDTRANS_IS_PRODUCTION || "false").toLowerCase() === "true";
  return send(res, 200, {
    ok: true,
    clientKey,
    snapScriptUrl: production
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js"
  });
}
