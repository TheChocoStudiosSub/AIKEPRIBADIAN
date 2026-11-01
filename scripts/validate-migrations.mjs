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
  { name: "migrations do not embed credentials", ok: ![...sqlByFile.values()].some((sql) => /(supabase_service_role_key|supabase_access_token|groq_api_key|password\s*=\s*[\x27"][^\x27"]+)/i.test(sql)) }
);

let failures = 0;
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  if (!check.ok) failures += 1;
}
console.log(`Migration safety checks: ${checks.length - failures}/${checks.length}`);
if (failures) process.exitCode = 1;
