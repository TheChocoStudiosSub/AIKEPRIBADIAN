import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeKnowledgeSources,
  retrieveKnowledge
} from "../netlify/functions/core/retrieval.mjs";

const requiredFiles = [
  "README.md",
  "frontend/README.md",
  "docs/frontend/ARCHITECTURE.md",
  "docs/frontend/INTEGRATION-CONTRACTS.md",
  "docs/frontend/DEVELOPER-HANDOFF.md",
  "netlify.toml",
  "public/index.html",
  "public/assets/css/tokens.css",
  "public/assets/css/base.css",
  "public/assets/css/workspace.css",
  "public/assets/css/components.css",
  "public/assets/css/responsive.css",
  "public/assets/js/chat-keyboard.js",
  "public/assets/js/ads-loader.js",
  "public/assets/js/chat-controller.js",
  "public/assets/js/site-preferences.js",
  "public/assets/js/mobile-sponsor-popup.js",
  "netlify/functions/chat.js",
  "netlify/functions/core/rate-limit.mjs",
  "docs/backend/README.md",
  "supabase/config.toml",
  "supabase/migrations/20261019010000_account_sync.sql",
  "supabase/migrations/20261021010000_knowledge_rag.sql",
  "supabase/migrations/20261127134844_choco_ai_distributed_chat_rate_limit.sql",
  "supabase/migrations/20261127134852_harden_private_owner_auth_tables.sql",
  "tests/rate-limit.test.mjs",
  "tests/chat-backend.test.mjs",
  "tests/license-api.test.mjs"
];

for (const file of requiredFiles) {
  await readFile(file, "utf8");
  console.log(`PASS required file: ${file}`);
}

const [facts, concepts, experiences] = await Promise.all([
  readFile("data/knowledge/facts.json", "utf8").then(JSON.parse),
  readFile("data/knowledge/concepts.json", "utf8").then(JSON.parse),
  readFile("data/knowledge/experiences.json", "utf8").then(JSON.parse)
]);
const documents = normalizeKnowledgeSources([facts, concepts, experiences]);
assert.ok(documents.length >= 5, "Local knowledge corpus must contain reviewed, useful documents.");

const cases = [
  { query: "Groq API Netlify frontend backend", expected: "project-stack" },
  { query: "retrieval augmented generation knowledge documents", expected: "rag-sources" },
  { query: "memory versus conversation history database", expected: "memory-vs-history" },
  { query: "evaluation benchmark before fine tuning", expected: "evaluation-before-training" }
];

let passed = 0;
for (const item of cases) {
  const results = retrieveKnowledge(item.query, documents, { limit: 4 });
  const found = results.some((result) => result.id === item.expected);
  console.log(`${found ? "PASS" : "FAIL"} real-corpus query: ${item.query}; expected=${item.expected}`);
  if (found) passed += 1;
}
assert.equal(passed, cases.length, "Real repository knowledge failed the retrieval smoke baseline.");
console.log(`Repository smoke checks passed; real-corpus retrieval ${passed}/${cases.length}.`);
