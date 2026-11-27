export const CHAT_RATE_LIMIT = Object.freeze({
  scope: "chat",
  windowSeconds: 600,
  maxRequests: 20
});

const TRUSTED_ADDRESS_HEADERS = [
  "x-vercel-forwarded-for",
  "x-nf-client-connection-ip",
  "x-forwarded-for"
];

export function getClientAddress(headers) {
  for (const name of TRUSTED_ADDRESS_HEADERS) {
    const raw = headers?.get?.(name);
    if (typeof raw !== "string" || !raw.trim()) continue;

    const address = raw.split(",")[0].trim();
    if (address && address.length <= 128 && !/[\r\n]/.test(address)) {
      return address;
    }
  }

  return "unknown";
}

export function normalizeRateLimitResult(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      payload.ok !== true || typeof payload.allowed !== "boolean") {
    return null;
  }

  const retryValue = Number(payload.retry_after_seconds);
  const retryAfterSeconds = Number.isFinite(retryValue)
    ? Math.max(1, Math.min(3600, Math.ceil(retryValue)))
    : CHAT_RATE_LIMIT.windowSeconds;

  const remainingValue = Number(payload.remaining);
  const remaining = Number.isFinite(remainingValue)
    ? Math.max(0, Math.min(CHAT_RATE_LIMIT.maxRequests, Math.floor(remainingValue)))
    : 0;

  return {
    allowed: payload.allowed,
    remaining,
    retryAfterSeconds,
    resetAt: typeof payload.reset_at === "string" ? payload.reset_at : null,
    degraded: false
  };
}

export function createInMemoryRateLimiter({
  limit = CHAT_RATE_LIMIT.maxRequests,
  windowSeconds = CHAT_RATE_LIMIT.windowSeconds,
  now = () => Date.now()
} = {}) {
  const buckets = new Map();
  const windowMs = Math.max(1, Number(windowSeconds) || CHAT_RATE_LIMIT.windowSeconds) * 1000;
  const maximum = Math.max(1, Number(limit) || CHAT_RATE_LIMIT.maxRequests);

  return function consume(subject) {
    const currentTime = Number(now());
    const safeNow = Number.isFinite(currentTime) ? currentTime : Date.now();

    for (const [key, bucket] of buckets) {
      if (bucket.expiresAt <= safeNow) buckets.delete(key);
    }

    const windowStart = Math.floor(safeNow / windowMs) * windowMs;
    const expiresAt = windowStart + windowMs;
    const key = String(subject || "unknown") + ":" + windowStart;
    const bucket = buckets.get(key) || { count: 0, expiresAt };

    bucket.count += 1;
    buckets.set(key, bucket);

    return {
      allowed: bucket.count <= maximum,
      remaining: Math.max(0, maximum - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - safeNow) / 1000)),
      resetAt: new Date(expiresAt).toISOString(),
      degraded: true
    };
  };
}
