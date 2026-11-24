import test from "node:test";
import assert from "node:assert/strict";
import { handleTcsPublic } from "../api/_lib/tcs-public.js";

function mockResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    ended: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { this.ended = true; return this; }
  };
}

test("public telemetry gateway accepts canonical TCS origins and rejects unknown origins", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.TCS_BACKEND_SUPABASE_URL;
  const previousKey = process.env.TCS_BACKEND_PUBLISHABLE_KEY;
  const canonicalOrigins = [
    "https://thechocostudios.bond",
    "https://information.thechocostudios.bond",
    "https://chocoai.thechocostudios.bond",
    "https://helpcenter.thechocostudios.bond",
    "https://linkguard.thechocostudios.bond",
    "https://sheeblink.thechocostudios.bond",
    "https://tcs-admin-panel.vercel.app"
  ];
  let upstreamCalls = 0;

  process.env.TCS_BACKEND_SUPABASE_URL = "https://example.supabase.co";
  process.env.TCS_BACKEND_PUBLISHABLE_KEY = "public-test-key";
  globalThis.fetch = async (url, options) => {
    upstreamCalls += 1;
    assert.equal(url, "https://example.supabase.co/functions/v1/tcs-telemetry");
    assert.equal(options.headers.apikey, "public-test-key");
    return {
      status: 200,
      json: async () => ({ ok: true, accepted: true })
    };
  };

  try {
    for (const origin of canonicalOrigins) {
      const response = mockResponse();
      await handleTcsPublic({
        method: "OPTIONS",
        headers: { origin }
      }, response);
      assert.equal(response.statusCode, 204, origin);
      assert.equal(response.ended, true, origin);
      assert.equal(response.headers["access-control-allow-origin"], origin);
      assert.match(response.headers["access-control-allow-methods"], /POST/);
    }

    const origin = "https://information.thechocostudios.bond";
    const accepted = mockResponse();
    await handleTcsPublic({
      method: "POST",
      headers: { origin, "x-forwarded-for": "203.0.113.10" },
      body: {
        action: "track",
        event: "visit",
        siteKey: "tcs-information",
        visitorId: "visitor-test",
        sessionId: "session-test",
        path: "/"
      }
    }, accepted);
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.headers["access-control-allow-origin"], origin);
    assert.equal(accepted.body.accepted, true);
    assert.equal(upstreamCalls, 1);

    const rejected = mockResponse();
    await handleTcsPublic({
      method: "POST",
      headers: { origin: "https://untrusted.example" },
      body: { action: "track" }
    }, rejected);
    assert.equal(rejected.statusCode, 403);
    assert.equal(rejected.body.error, "origin_not_allowed");
    assert.equal(upstreamCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.TCS_BACKEND_SUPABASE_URL;
    else process.env.TCS_BACKEND_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.TCS_BACKEND_PUBLISHABLE_KEY;
    else process.env.TCS_BACKEND_PUBLISHABLE_KEY = previousKey;
  }
});
