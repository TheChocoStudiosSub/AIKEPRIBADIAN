import test from "node:test";
import assert from "node:assert/strict";
import chatHandler from "../netlify/functions/chat.js";

const trackedEnv = [
  "GROQ_API_KEY",
  "TCS_KNOWLEDGE_SUPABASE_URL",
  "TCS_KNOWLEDGE_PUBLISHABLE_KEY",
  "TCS_OWNER_AUTH_SERVER_KEY"
];
const originalEnv = Object.fromEntries(trackedEnv.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

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

test("chat endpoint enforces the distributed rate-limit response contract", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  process.env.TCS_KNOWLEDGE_SUPABASE_URL = "https://knowledge.example.test";
  process.env.TCS_KNOWLEDGE_PUBLISHABLE_KEY = "publishable-test-key";
  process.env.TCS_OWNER_AUTH_SERVER_KEY = "test-server-key-only";

  let forwardedPayload;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://knowledge.example.test/rest/v1/rpc/tcs_chat_consume_rate_limit");
    forwardedPayload = JSON.parse(init.body);
    return new Response(JSON.stringify({
      ok: true,
      allowed: false,
      remaining: 0,
      retry_after_seconds: 90
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-vercel-forwarded-for": "203.0.113.7" },
    body: JSON.stringify({ message: "pertanyaan tentang TCS", stream: true })
  }));

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "90");
  assert.match((await response.json()).error, /Batas sementara/);
  assert.equal(forwardedPayload.p_scope, "chat");
  assert.match(forwardedPayload.p_subject_hash, /^[0-9a-f]{64}$/);
  assert.equal(forwardedPayload.p_window_seconds, 600);
  assert.equal(forwardedPayload.p_max_requests, 20);
  assert.equal(forwardedPayload.p_server_key, "test-server-key-only");
});

test("chat endpoint rejects bodies larger than 64 KB", async () => {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hello", extra: "x".repeat(70 * 1024) })
  }));
  assert.equal(response.status, 413);
});

function configureChatIntegration({ ownerVerified = false, publicDocuments = [], ownerDocuments = [], groqReply = "Jawaban uji Choco AI." } = {}) {
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  process.env.TCS_KNOWLEDGE_SUPABASE_URL = "https://knowledge.example.test";
  process.env.TCS_KNOWLEDGE_PUBLISHABLE_KEY = "publishable-test-key";
  process.env.TCS_OWNER_AUTH_SERVER_KEY = "test-server-key-only";

  const calls = [];
  let groqPayload = null;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });

    if (url.endsWith("/rpc/tcs_chat_consume_rate_limit")) {
      return new Response(JSON.stringify({
        ok: true,
        allowed: true,
        remaining: 19,
        retry_after_seconds: 600
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (url.endsWith("/rpc/tcs_owner_validate_session")) {
      return new Response(JSON.stringify(ownerVerified), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.endsWith("/rpc/tcs_public_search_knowledge")) {
      return new Response(JSON.stringify(publicDocuments), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.endsWith("/rpc/tcs_owner_search_knowledge")) {
      return new Response(JSON.stringify(ownerDocuments), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url === "https://api.groq.com/openai/v1/chat/completions") {
      groqPayload = JSON.parse(init.body);
      return new Response(JSON.stringify({
        model: "openai/gpt-oss-20b",
        choices: [{
          message: { content: groqReply },
          finish_reason: "stop"
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    throw new Error("Unexpected upstream request: " + url);
  };

  return {
    calls,
    get groqPayload() { return groqPayload; }
  };
}

test("chat endpoint preserves the non-stream JSON contract and TCS-only system scope", async () => {
  const integration = configureChatIntegration({
    publicDocuments: [{
      app_name: "TCS LinkGuard",
      title: "Panduan LinkGuard",
      content: "Panduan publik TCS LinkGuard."
    }]
  });

  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Apa fungsi TCS LinkGuard?",
      history: [{ role: "user", content: "Konteks TCS sebelumnya." }],
      memories: [],
      preferences: {
        responseLength: "balanced",
        tonePreference: "adaptive",
        detailPreference: "adaptive",
        humorPreference: false,
        emojiPreference: false
      },
      modelMode: "standard",
      client: "chatbot",
      stream: false
    })
  }));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /application\/json/i);
  const payload = await response.json();
  assert.deepEqual(payload, {
    reply: "Jawaban uji Choco AI.",
    model: "openai/gpt-oss-20b",
    truncated: false
  });

  assert.equal(integration.groqPayload.model, "openai/gpt-oss-20b");
  assert.equal(integration.groqPayload.stream, false);
  assert.equal(integration.groqPayload.messages.at(-1).role, "user");
  assert.equal(integration.groqPayload.messages.at(-1).content, "Apa fungsi TCS LinkGuard?");
  assert.match(integration.groqPayload.messages[0].content, /hanya melayani kebutuhan yang berkaitan dengan TCS/i);
  assert.match(
    integration.groqPayload.messages.find(message => message.content.includes("TCS_KNOWLEDGE_HUB_PUBLIC_BEGIN")).content,
    /Panduan publik TCS LinkGuard/
  );
  assert.ok(integration.calls.some(call => call.url.endsWith("/rpc/tcs_public_search_knowledge")));
  assert.equal(integration.calls.some(call => call.url.endsWith("/rpc/tcs_owner_search_knowledge")), false);
  assert.doesNotMatch(JSON.stringify(payload), /test-only-not-a-real-key|test-server-key-only/);
});

test("chat endpoint prioritizes the selected UI language over the user's message language", async () => {
  const integration = configureChatIntegration();
  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Apa fungsi TCS LinkGuard?",
      responseLanguage: "en",
      history: [{ role: "user", content: "Jelaskan produk TCS." }],
      memories: [],
      preferences: {},
      modelMode: "standard",
      client: "chatbot",
      stream: false
    })
  }));

  assert.equal(response.status, 200);
  const selectedLanguagePrompt = integration.groqPayload.messages.find(message =>
    message.role === "system" && message.content.includes("Bahasa balasan wajib dari pemilih bahasa aplikasi: en.")
  );
  assert.ok(selectedLanguagePrompt);
  assert.match(selectedLanguagePrompt.content, /selected English.*entirely in English/i);
  const finalLanguageRule = integration.groqPayload.messages.find(message =>
    message.role === "system" && message.content.includes("FINAL RESPONSE LANGUAGE RULE:")
  );
  assert.match(finalLanguageRule.content, /selected application language overrides/i);
});

test("chat endpoint preserves OpenAI-compatible SSE streaming", async () => {
  configureChatIntegration();
  const encoder = new TextEncoder();
  let streamGroqPayload = null;
  let mockFetchError = null;

  globalThis.fetch = async (url, init = {}) => {
    try {
    if (url.endsWith("/rpc/tcs_chat_consume_rate_limit")) {
      return new Response(JSON.stringify({
        ok: true, allowed: true, remaining: 18, retry_after_seconds: 590
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.endsWith("/rpc/tcs_public_search_knowledge")) {
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://api.groq.com/openai/v1/chat/completions") {
      streamGroqPayload = JSON.parse(init.body);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Halo"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" TCS"}}]}\n\n'));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" }
      });
    }
    throw new Error("Unexpected upstream request: " + url);
    } catch (error) {
      mockFetchError = { name: error?.name, message: error?.message };
      throw error;
    }
  };

  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Jelaskan dokumentasi TCS.",
      history: [],
      memories: [],
      preferences: {},
      modelMode: "standard",
      client: "chatbot",
      stream: true
    })
  }));

  assert.equal(response.status, 200, JSON.stringify(mockFetchError));
  assert.match(response.headers.get("Content-Type"), /text\/event-stream/i);
  assert.equal(response.headers.get("Cache-Control"), "no-cache, no-store, no-transform");
  assert.equal(response.headers.get("X-Choco-Stream"), "groq");
  assert.equal(streamGroqPayload.stream, true);
  assert.equal(streamGroqPayload.model, "openai/gpt-oss-20b");
  const streamText = await response.text();
  assert.match(streamText, /"content":"Halo"/);
  assert.match(streamText, /"content":" TCS"/);
  assert.match(streamText, /data: \[DONE\]/);
});

test("unverified Owner cookies never unlock internal knowledge retrieval", async () => {
  const integration = configureChatIntegration({
    ownerVerified: false,
    ownerDocuments: [{
      app_name: "Internal",
      title: "Private owner document",
      content: "SECRET_INTERNAL_KNOWLEDGE_MARKER"
    }]
  });

  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "tcs_owner_session=unverified-test-session"
    },
    body: JSON.stringify({
      message: "Tolong jelaskan proyek internal TCS.",
      history: [],
      memories: [],
      preferences: {},
      modelMode: "standard",
      client: "chatbot",
      stream: false
    })
  }));

  assert.equal(response.status, 200);
  assert.equal(integration.calls.some(call => call.url.endsWith("/rpc/tcs_owner_validate_session")), true);
  assert.equal(integration.calls.some(call => call.url.endsWith("/rpc/tcs_owner_search_knowledge")), false);
  assert.equal(integration.groqPayload.messages.some(message =>
    typeof message.content === "string" && message.content.includes("SECRET_INTERNAL_KNOWLEDGE_MARKER")
  ), false);
});

test("verified Owner sessions may retrieve internal Knowledge Hub context", async () => {
  const integration = configureChatIntegration({
    ownerVerified: true,
    ownerDocuments: [{
      app_name: "TCS Internal",
      title: "Owner-only source",
      source_repo_path: "private/owner-notes",
      content: "OWNER_ONLY_CONTEXT_MARKER"
    }]
  });

  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "tcs_owner_session=verified-test-session"
    },
    body: JSON.stringify({
      message: "Jelaskan catatan internal TCS.",
      history: [],
      memories: [],
      preferences: {},
      modelMode: "standard",
      client: "chatbot",
      stream: false
    })
  }));

  assert.equal(response.status, 200);
  assert.equal(integration.calls.some(call => call.url.endsWith("/rpc/tcs_owner_validate_session")), true);
  assert.equal(integration.calls.some(call => call.url.endsWith("/rpc/tcs_owner_search_knowledge")), true);
  assert.match(
    integration.groqPayload.messages.find(message => message.content.includes("TCS_OWNER_INTERNAL_KNOWLEDGE_BEGIN")).content,
    /OWNER_ONLY_CONTEXT_MARKER/
  );
  const ownerSearchCall = integration.calls.find(call => call.url.endsWith("/rpc/tcs_owner_search_knowledge"));
  assert.equal(JSON.parse(ownerSearchCall.init.body).p_server_key, "test-server-key-only");
});

test.after(() => {
  for (const key of trackedEnv) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  globalThis.fetch = originalFetch;
});


test("English TCS questions keep English response language despite Indonesian knowledge documents", async () => {
  const integration = configureChatIntegration({
    publicDocuments: [{
      app_name: "Sara AI",
      title: "Sara AI Help Center",
      content: "Sara supports TCS users at https://choco-ai-help-center.vercel.app/."
    }]
  });

  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "what a sara ai?",
      history: [],
      memories: [],
      preferences: {},
      modelMode: "standard",
      client: "chatbot",
      stream: false
    })
  }));

  assert.equal(response.status, 200);
  const languageRule = integration.groqPayload.messages.find(message =>
    message.role === "system" && /FINAL RESPONSE LANGUAGE RULE/.test(message.content)
  );
  assert.ok(languageRule);
  assert.match(languageRule.content, /entirely in English/i);
  const knowledge = integration.groqPayload.messages.find(message =>
    message.content.includes("TCS_KNOWLEDGE_HUB_PUBLIC_BEGIN")
  );
  assert.ok(knowledge);
  assert.match(knowledge.content, /https:\/\/helpcenter\.thechocostudios\.bond\//);
  assert.doesNotMatch(knowledge.content, /choco-ai-help-center\.vercel\.app/i);
});

test("Groq rate-limit errors are returned in the user's language", async () => {
  configureChatIntegration();
  const baseFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (url === "https://api.groq.com/openai/v1/chat/completions") {
      return new Response(JSON.stringify({ error: { message: "provider internal details" } }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "2" }
      });
    }
    return baseFetch(url, init);
  };

  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "what a sara ai?",
      history: [],
      memories: [],
      preferences: {},
      modelMode: "standard",
      client: "chatbot",
      stream: false
    })
  }));

  assert.equal(response.status, 429);
  const payload = await response.json();
  assert.match(payload.error, /Groq is temporarily rate-limiting requests/i);
  assert.match(payload.error, /2 seconds/i);
  assert.doesNotMatch(payload.error, /provider internal details/i);
});

test("retired aliases in model-generated non-stream replies are canonicalized", async () => {
  const legacyReply = "Sara is available at https://choco-ai-help-center.vercel.app/bot.html";
  configureChatIntegration({ groqReply: legacyReply });

  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "What is Sara AI?",
      history: [],
      memories: [],
      preferences: {},
      modelMode: "standard",
      client: "chatbot",
      stream: false
    })
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.reply, "Sara is available at https://helpcenter.thechocostudios.bond/bot.html");
});


test("retired aliases in streamed model replies are canonicalized across chunks", async () => {
  configureChatIntegration();
  const baseFetch = globalThis.fetch;
  const source = 'data: {"choices":[{"delta":{"content":"Sara: https://choco-ai-help-center.vercel.app/bot.html"}}]}\n\n' +
    'data: [DONE]\n\n';
  const splitAt = source.indexOf("choco-ai-help-center") + 7;
  const encoder = new TextEncoder();
  globalThis.fetch = async (url, init = {}) => {
    if (url === "https://api.groq.com/openai/v1/chat/completions") {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(source.slice(0, splitAt)));
          controller.enqueue(encoder.encode(source.slice(splitAt)));
          controller.close();
        }
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" }
      });
    }
    return baseFetch(url, init);
  };

  const response = await chatHandler(new Request("https://chocoai.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "What is Sara AI?",
      history: [],
      memories: [],
      preferences: {},
      modelMode: "standard",
      client: "chatbot",
      stream: true
    })
  }));

  assert.equal(response.status, 200);
  const payload = await response.text();
  assert.match(payload, /https:\/\/helpcenter\.thechocostudios\.bond\/bot\.html/);
  assert.doesNotMatch(payload, /choco-ai-help-center\.vercel\.app/i);
});
