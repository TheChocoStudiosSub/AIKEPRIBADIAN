import test from "node:test";
import assert from "node:assert/strict";
import licenseHandler from "../api/license.js";

const originalEnv = {
  url: process.env.TCS_SUPABASE_URL,
  key: process.env.TCS_SUPABASE_PUBLISHABLE_KEY
};
const originalFetch = globalThis.fetch;
const requestId = "11111111-1111-4111-8111-111111111111";
const requestToken = "request-token-for-automated-tests-000000";

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function invoke({ method = "POST", body, url = "/api/license" } = {}) {
  const req = {
    method,
    url,
    body,
    headers: {}
  };
  const res = createResponse();
  await licenseHandler(req, res);
  return res;
}

test.before(() => {
  process.env.TCS_SUPABASE_URL = "https://tcs-backend.example.test";
  process.env.TCS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_only";
});

test.after(() => {
  if (originalEnv.url === undefined) delete process.env.TCS_SUPABASE_URL;
  else process.env.TCS_SUPABASE_URL = originalEnv.url;
  if (originalEnv.key === undefined) delete process.env.TCS_SUPABASE_PUBLISHABLE_KEY;
  else process.env.TCS_SUPABASE_PUBLISHABLE_KEY = originalEnv.key;
  globalThis.fetch = originalFetch;
});

test("license endpoint rejects non-POST methods", async () => {
  const response = await invoke({ method: "GET" });
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "POST");
  assert.equal(response.headers["Cache-Control"], "no-store, max-age=0");
});

test("license endpoint rejects malformed request identifiers before upstream access", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("must not be called");
  };

  const response = await invoke({
    body: { action: "status", requestId: "not-a-uuid", requestToken }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test("status action preserves the documented response contract", async () => {
  let upstreamPayload;
  let upstreamHeaders;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://tcs-backend.example.test/functions/v1/tcs-license");
    upstreamPayload = JSON.parse(init.body);
    upstreamHeaders = init.headers;
    return new Response(JSON.stringify({
      requestId,
      productId: "tcs-stock-sales-basic",
      productSku: "tcs-stock-sales-basic",
      status: "pending",
      verificationStatus: "pending",
      paymentStatus: "unverified",
      buyerDetailsReceived: false,
      expiresAt: null
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const response = await invoke({
    body: { action: "status", requestId, requestToken }
  });

  assert.equal(upstreamPayload.action, "status");
  assert.equal(upstreamPayload.requestId, requestId);
  assert.equal(upstreamPayload.requestToken, requestToken);
  assert.equal(upstreamHeaders.apikey, "sb_publishable_test_only");
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "pending");
  assert.equal(response.body.paymentStatus, "unverified");
  assert.equal(response.headers["Cache-Control"], "no-store, max-age=0");
});

test("purchase-reference action validates and forwards only its contract fields", async () => {
  let upstreamPayload;
  globalThis.fetch = async (_url, init) => {
    upstreamPayload = JSON.parse(init.body);
    return new Response(JSON.stringify({ submitted: true, requestId, productSku: "tcs-stock-sales-basic" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const response = await invoke({
    body: {
      action: "submit_purchase_reference",
      requestId,
      requestToken,
      buyerUsername: "buyer_123",
      transactionReference: "ORDER-12345",
      ignored: "must-not-be-forwarded"
    }
  });

  assert.deepEqual(upstreamPayload, {
    action: "submit_purchase_reference",
    requestId,
    requestToken,
    buyerUsername: "buyer_123",
    transactionReference: "ORDER-12345"
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.submitted, true);
});

test("delivery action refuses a key for an unexpected product", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    productId: "another-product",
    licenseKey: "DO-NOT-RETURN"
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const response = await invoke({
    body: { action: "deliver", requestId, requestToken }
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.body.error, "unexpected_license_response");
  assert.equal("licenseKey" in response.body, false);
});

test("delivery action returns only the verified product key", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    requestId,
    productId: "tcs-stock-sales-basic",
    productSku: "tcs-stock-sales-basic",
    licenseKey: "TCS-TEST-LICENSE-KEY"
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const response = await invoke({
    body: { action: "deliver", requestId, requestToken }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.licenseKey, "TCS-TEST-LICENSE-KEY");
  assert.equal(response.body.productId, "tcs-stock-sales-basic");
});

test("license gateway does not expose upstream exception text", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: "SQLSTATE 23505: internal table and constraint details"
  }), { status: 409, headers: { "Content-Type": "application/json" } });

  const response = await invoke({
    body: { action: "status", requestId, requestToken }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error, "license_request_failed");
  assert.doesNotMatch(JSON.stringify(response.body), /SQLSTATE|constraint details/i);
});
