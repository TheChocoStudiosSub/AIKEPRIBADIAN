import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeTcsUrls, canonicalizeTcsStream } from "../netlify/functions/core/canonical-urls.mjs";

test("rewrites retired TCS deployment aliases to canonical domains", () => {
  const input = [
    "https://the-choco-studios-official.vercel.app/",
    "https://the-choco-studios-information.vercel.app/",
    "https://tcs-chocoai.vercel.app/",
    "https://choco-ai-help-center.vercel.app/bot.html",
    "https://tcs-linkguard.vercel.app/",
    "https://sheeblink.vercel.app/",
    "https://vornika-games.vercel.app/"
  ].join(" ");

  const result = canonicalizeTcsUrls(input);
  assert.ok(result.includes("https://thechocostudios.bond/"));
  assert.ok(result.includes("https://information.thechocostudios.bond/"));
  assert.ok(result.includes("https://chocoai.thechocostudios.bond/"));
  assert.ok(result.includes("https://helpcenter.thechocostudios.bond/bot.html"));
  assert.ok(result.includes("https://linkguard.thechocostudios.bond/"));
  assert.ok(result.includes("https://sheeblink.thechocostudios.bond/"));
  assert.ok(result.includes("https://vornika.thechocostudios.bond/"));
  assert.doesNotMatch(result, /(?:tcs-chocoai|the-choco-studios|choco-ai-help-center|tcs-linkguard|sheeblink|vornika-games)\.vercel\.app/i);
});

test("keeps aliases without an established replacement unchanged", () => {
  const input = "https://tcs-uploadfit.vercel.app/ https://tcs-template.vercel.app/";
  assert.equal(canonicalizeTcsUrls(input), input);
});

test("rewrites URLs split across SSE chunks", async () => {
  const source = 'data: {"choices":[{"delta":{"content":"https://the-choco-studios-official.vercel.app/bergabung/"}}]}\n\n';
  const splitAt = source.indexOf("the-choco-studios") + 8;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(source.slice(0, splitAt)));
      controller.enqueue(encoder.encode(source.slice(splitAt)));
      controller.close();
    }
  });

  const result = await new Response(canonicalizeTcsStream(stream)).text();
  assert.ok(result.includes("https://thechocostudios.bond/bergabung/"));
  assert.ok(!result.includes("the-choco-studios-official.vercel.app"));
});
