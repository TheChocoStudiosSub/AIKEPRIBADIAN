function send(res, status, data) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(data);
}

function sessionToken(req) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== "tcs_admin_session") continue;
    return part.slice(separator + 1).trim();
  }
  return "";
}

function configuration() {
  const base = String(process.env.TCS_BACKEND_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.TCS_BACKEND_PUBLISHABLE_KEY || "");
  if (!base || !key) throw new Error("backend_not_configured");
  return { base, key };
}

export async function callAdminBridge(req, action, payload = {}) {
  const { base, key } = configuration();
  const origin = String(req.headers.origin || "https://tcs-admin-panel.vercel.app");
  const token = sessionToken(req);
  const response = await fetch(base + "/functions/v1/tcs-telemetry", {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Origin: origin,
      "x-tcs-admin-session": token
    },
    body: JSON.stringify({ action, payload }),
    cache: "no-store",
    signal: AbortSignal.timeout(18000)
  });
  const data = await response.json().catch(() => ({ ok: false, error: "invalid_backend_response" }));
  return { status: response.status, data: data && typeof data === "object" ? data : { ok: false, error: "invalid_backend_response" } };
}

export async function proxyAdminDb(req, path, method = "GET", payload, prefer) {
  const result = await callAdminBridge(req, "db_proxy", { path, method, payload, prefer });
  if (result.status >= 400 || result.data?.ok === false) {
    throw new Error(String(result.data?.error || "admin_database_unavailable"));
  }
  return result.data?.data ?? null;
}

export async function handleTcsManagement(req, res, input) {
  try {
    const result = await callAdminBridge(req, "management", input || {});
    return send(res, result.status, result.data);
  } catch (error) {
    console.error("TCS management gateway failed", String(error?.message || error));
    return send(res, 503, { ok: false, error: "management_backend_unavailable" });
  }
}
