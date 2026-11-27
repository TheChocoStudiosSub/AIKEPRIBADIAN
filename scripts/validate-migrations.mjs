import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const migrationDirectory = "supabase/migrations";
const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const checks = [];
const sqlByFile = new Map();

for (const filename of migrationFiles) {
  const sql = await readFile(path.join(migrationDirectory, filename), "utf8");
  const lower = sql.toLowerCase();
  sqlByFile.set(filename, lower);

  checks.push({
    name: `${filename} has a timestamped migration filename`,
    ok: /^\d{14}_[a-z0-9_]+\.sql$/.test(filename)
  });

  const dollarQuotes = sql.match(/\$\$/g) || [];
  checks.push({
    name: `${filename} has balanced SQL dollar quotes`,
    ok: dollarQuotes.length % 2 === 0 &&
      !/\b(?:as|do)\s+\$(?!\$|[a-z_][a-z0-9_]*\$)/i.test(sql)
  });
}

const base = sqlByFile.get("20261019010000_account_sync.sql") || "";
const rag = sqlByFile.get("20261021010000_knowledge_rag.sql") || "";
const chatRateLimit = sqlByFile.get("20261127134844_choco_ai_distributed_chat_rate_limit.sql") || "";
const ownerAuthHardening = sqlByFile.get("20261127134852_harden_private_owner_auth_tables.sql") || "";
const chatDiagnostics = sqlByFile.get("20261127170000_choco_ai_chat_diagnostics.sql") || "";

for (const table of ["profiles", "conversations", "messages", "memories"]) {
  checks.push({
    name: `account schema enables RLS for ${table}`,
    ok: base.includes(`alter table public.${table} enable row level security`)
  });
}

checks.push(
  { name: "knowledge migration exists", ok: Boolean(rag) },
  { name: "knowledge table enables RLS", ok: rag.includes("alter table public.knowledge_documents enable row level security") },
  { name: "knowledge documents are private by default", ok: /visibility text not null default 'private'/.test(rag) },
  { name: "knowledge reads are owner/public scoped", ok: rag.includes("visibility = 'public' or auth.uid() = owner_id") },
  { name: "knowledge writes require owner identity", ok: rag.includes("with check (auth.uid() = owner_id)") },
  { name: "search RPC uses invoker privileges", ok: rag.includes("security invoker") },
  { name: "search RPC caps result count", ok: rag.includes("least(coalesce(result_limit, 4), 8)") },
  { name: "knowledge updated_at trigger uses valid dollar quoting", ok: /returns trigger language plpgsql as \$\$[\s\S]*?end;\s*\$\$;/i.test(rag) },
  { name: "distributed chat rate-limit migration exists", ok: Boolean(chatRateLimit) },
  { name: "distributed chat rate-limit table is private and RLS-enabled", ok: chatRateLimit.includes("alter table private.tcs_chat_rate_limits enable row level security") },
  { name: "distributed chat rate-limit table has no direct client grants", ok: chatRateLimit.includes("revoke all on table private.tcs_chat_rate_limits") && chatRateLimit.includes("from public, anon, authenticated, service_role") },
  { name: "distributed chat rate-limit RPC is a server-key-gated definer", ok: chatRateLimit.includes("create or replace function public.tcs_chat_consume_rate_limit") && chatRateLimit.includes("security definer") && chatRateLimit.includes("private._tcs_owner_check_server_key(p_server_key)") },
  { name: "private chat diagnostics migration exists", ok: Boolean(chatDiagnostics) },
  { name: "chat diagnostics table stays private and RLS-enabled", ok: chatDiagnostics.includes("create table if not exists private.tcs_chat_diagnostics") && chatDiagnostics.includes("alter table private.tcs_chat_diagnostics enable row level security") },
  { name: "chat diagnostics table has no direct client grants", ok: chatDiagnostics.includes("revoke all on table private.tcs_chat_diagnostics") && chatDiagnostics.includes("from public, anon, authenticated, service_role") },
  { name: "chat diagnostic write/read RPCs validate the Owner server key", ok: (chatDiagnostics.match(/private\._tcs_owner_check_server_key\(p_server_key\)/g) || []).length >= 2 },
  { name: "chat diagnostic RPCs restrict execution to anon backend role", ok: /tcs_chat_write_diagnostic\([\s\S]*?\) to anon;/i.test(chatDiagnostics) && /tcs_chat_get_diagnostics\([\s\S]*?\)\s+to anon;/i.test(chatDiagnostics) },
  { name: "chat diagnostics do not store full chat message content", ok: !/prompt_text|reply_text|message_content|full_prompt|full_response/i.test(chatDiagnostics) },
  { name: "private Owner auth hardening migration exists", ok: Boolean(ownerAuthHardening) },
  { name: "Owner login attempts table enables RLS", ok: ownerAuthHardening.includes("alter table private.tcs_owner_auth_attempts enable row level security") },
  { name: "Owner auth config table enables RLS", ok: ownerAuthHardening.includes("alter table private.tcs_owner_auth_config enable row level security") },
  { name: "private Owner auth tables revoke client privileges", ok: ownerAuthHardening.includes("revoke all on table private.tcs_owner_auth_attempts") && ownerAuthHardening.includes("revoke all on table private.tcs_owner_auth_config") && ownerAuthHardening.includes("from public, anon, authenticated, service_role") },
  { name: "migrations do not embed credentials", ok: ![...sqlByFile.values()].some((sql) => /(supabase_service_role_key|supabase_access_token|groq_api_key|password\s*=\s*[\x27"][^\x27"]+)/i.test(sql)) }
);

let failures = 0;
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  if (!check.ok) failures += 1;
}
console.log(`Migration safety checks: ${checks.length - failures}/${checks.length}`);
if (failures) process.exitCode = 1;
