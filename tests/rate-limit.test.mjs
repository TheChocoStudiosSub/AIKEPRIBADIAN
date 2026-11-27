import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_RATE_LIMIT,
  createInMemoryRateLimiter,
  getClientAddress,
  normalizeRateLimitResult
} from "../netlify/functions/core/rate-limit.mjs";

test("rate limit policy stays aligned with the deployed chat contract", () => {
  assert.deepEqual(CHAT_RATE_LIMIT, {
    scope: "chat",
    windowSeconds: 600,
    maxRequests: 20
  });
});

test("uses Vercel's platform address before forwarded client headers", () => {
  const headers = new Headers({
    "x-vercel-forwarded-for": "203.0.113.10, 10.0.0.2",
    "x-forwarded-for": "198.51.100.99"
  });
  assert.equal(getClientAddress(headers), "203.0.113.10");
});

test("supports Netlify's platform address header", () => {
  const headers = new Headers({
    "x-nf-client-connection-ip": "2001:db8::1",
    "x-forwarded-for": "198.51.100.99"
  });
  assert.equal(getClientAddress(headers), "2001:db8::1");
});

test("falls back to the first forwarded address, then unknown", () => {
  assert.equal(
    getClientAddress(new Headers({ "x-forwarded-for": "192.0.2.9, 10.0.0.2" })),
    "192.0.2.9"
  );
  assert.equal(getClientAddress(new Headers()), "unknown");
});

test("normalizes an allowed distributed response", () => {
  assert.deepEqual(normalizeRateLimitResult({
    ok: true,
    allowed: true,
    remaining: 7,
    retry_after_seconds: 74,
    reset_at: "2026-11-27T13:10:00.000Z"
  }), {
    allowed: true,
    remaining: 7,
    retryAfterSeconds: 74,
    resetAt: "2026-11-27T13:10:00.000Z",
    degraded: false
  });
});

test("normalizes a blocked response and clamps unsafe retry values", () => {
  const result = normalizeRateLimitResult({
    ok: true,
    allowed: false,
    remaining: -20,
    retry_after_seconds: 999999
  });
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.equal(result.retryAfterSeconds, 3600);
});

test("rejects malformed or failed RPC results", () => {
  assert.equal(normalizeRateLimitResult(null), null);
  assert.equal(normalizeRateLimitResult({ ok: false, error: "unauthorized" }), null);
  assert.equal(normalizeRateLimitResult({ ok: true, allowed: "false" }), null);
  assert.equal(normalizeRateLimitResult([]), null);
});

test("in-memory fallback enforces the same limit and expires its window", () => {
  let now = 1_000_000;
  const consume = createInMemoryRateLimiter({
    limit: 2,
    windowSeconds: 60,
    now: () => now
  });

  assert.equal(consume("ip-a").allowed, true);
  assert.equal(consume("ip-a").allowed, true);
  const blocked = consume("ip-a");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.degraded, true);
  assert.equal(consume("ip-b").allowed, true);

  now += 60_000;
  assert.equal(consume("ip-a").allowed, true);
});

test("in-memory fallback returns positive retry-after values", () => {
  const consume = createInMemoryRateLimiter({
    limit: 1,
    windowSeconds: 10,
    now: () => 5_000
  });
  consume("subject");
  const result = consume("subject");
  assert.equal(result.allowed, false);
  assert.ok(result.retryAfterSeconds >= 1 && result.retryAfterSeconds <= 10);
});
