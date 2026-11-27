import test from "node:test";
import assert from "node:assert/strict";
import chatHandler from "../netlify/functions/chat.js";

const originalGroqKey = process.env.GROQ_API_KEY;

test("chat endpoint rejects non-POST methods", async () => {
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "GET"
  }));
  assert.equal(response.status, 405);
  assert.match((await response.json()).error, /POST/);
});

test("chat endpoint rejects malformed JSON without calling Groq", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  }));
  assert.equal(response.status, 400);
});

test("chat endpoint rejects an empty message", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "   " })
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /kosong/i);
});

test("chat endpoint rejects messages over the published character limit", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "x".repeat(4001) })
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /4000/);
});

test("chat endpoint rejects JSON arrays and null bodies", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  for (const body of ["[]", "null"]) {
    const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    }));
    assert.equal(response.status, 400);
  }
});

test.after(() => {
  if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqKey;
});
