const ALLOWED_ORIGINS = new Set([
  "https://the-choco-studios-official.vercel.app",
  "https://the-choco-studios-information.vercel.app",
  "https://the-choco-studios-information.netlify.app",
  "https://the-choco-studio-information.netlify.app",
  "https://choco-ai-independent-seven.vercel.app",
  "https://tcs-chocoai.vercel.app",
  "https://tcs-choco-ai.vercel.app",
  "https://choco-ai-help-center.netlify.app",
  "https://tcs-admin-panel.vercel.app"
]);

function send(res, status, data, origin = "") {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Vary", "Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (status === 204) return res.status(204).end();
  return res.status(status).json(data);
}

function header(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : String(value || "");
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 180000) { resolve(null); req.destroy(); }
    });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

export async function handleTcsPublic(req, res) {
  const origin = header(req, "origin");
  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { ok: false, error: "origin_not_allowed" });
    return send(res, 204, {}, origin);
  }
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { ok: false, error: "origin_not_allowed" }, "");

  const base = String(process.env.TCS_BACKEND_SUPABASE_URL || process.env.TCS_SUPABASE_URL || "").replace(/\/+$/, "");
  const publicKey = String(process.env.TCS_BACKEND_PUBLISHABLE_KEY || process.env.TCS_SUPABASE_PUBLISHABLE_KEY || "");
  if (!base || !publicKey) return send(res, 503, { ok: false, error: "service_not_configured" }, origin);

  const input = await readBody(req);
  if (!input || typeof input !== "object" || Array.isArray(input)) return send(res, 400, { ok: false, error: "invalid_json" }, origin);

  try {
    const clientIp = header(req, "x-vercel-forwarded-for") || header(req, "x-forwarded-for") || "";
    const upstream = await fetch(base + "/functions/v1/tcs-telemetry", {
      method: "POST",
      headers: {
        apikey: publicKey,
        Authorization: "Bearer " + publicKey,
        "Content-Type": "application/json",
        Origin: origin,
        "x-tcs-client-ip": clientIp.slice(0, 160)
      },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    const data = await upstream.json().catch(() => ({ ok: false, error: "invalid_backend_response" }));
    return send(res, upstream.status, data && typeof data === "object" ? data : { ok: false, error: "invalid_backend_response" }, origin);
  } catch (error) {
    console.error("TCS public telemetry gateway failed", String(error?.message || error));
    return send(res, 503, { ok: false, error: "telemetry_unavailable" }, origin);
  }
}
