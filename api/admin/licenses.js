const ALLOWED_ACTIONS = new Set([
  "dashboard", "list_pending", "list_requests", "list_products", "list_inventory",
  "list_licenses", "list_events", "verify_purchase", "hold", "approve", "reject",
  "import_preissued", "set_product_price", "set_license_status"
]);

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function readCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
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

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 16000) {
        resolve(null);
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

async function ownerRpc(action, payload = {}) {
  const base = String(process.env.TCS_KNOWLEDGE_SUPABASE_URL || "").replace(/\/+$/, "");
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

async function isOwner(req) {
  const token = readCookie(req, "tcs_owner_session");
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  const result = await ownerRpc("tcs_owner_validate_session", { p_token: token });
  return result.ok && result.data === true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
  if (!await isOwner(req)) return send(res, 401, { ok: false, error: "owner_session_required" });

  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) return send(res, 400, { ok: false, error: "invalid_json" });
  const action = String(body.action || "").slice(0, 32);
  if (!ALLOWED_ACTIONS.has(action)) return send(res, 400, { ok: false, error: "unknown_action" });

  const base = String(process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || "");
  if (!base || !secretKey) return send(res, 503, { ok: false, error: "license_backend_not_configured" });

  try {
    const response = await fetch(base + "/functions/v1/tcs-license-admin", {
      method: "POST",
      headers: {
        apikey: secretKey,
        "Content-Type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("TCS admin backend request failed", { action, status: response.status });
      return send(res, response.status, data && typeof data === "object" ? data : { ok: false, error: "admin_backend_error" });
    }
    return send(res, 200, data && typeof data === "object" ? data : { ok: false, error: "invalid_admin_response" });
  } catch {
    return send(res, 503, { ok: false, error: "admin_backend_unavailable" });
  }
}
