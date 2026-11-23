const PROVIDER_NAMES = /\\b(?:groq|supabase|vercel|netlify|firebase|cloudflare|amazon\\s+web\\s+services|aws|google\\s+cloud|gcp|microsoft\\s+azure|azure|openai|anthropic|claude|gemini|mistral|deepseek|cohere|openrouter|together(?:\\s+ai)?|fireworks(?:\\s+ai)?|cerebras|replicate|modal|railway|render|fly\\.io|neon|planetscale|mongodb(?:\\s+atlas)?|upstash)\\b/i;
const SECRET_IDENTIFIERS = /\\b(?:GROQ_[A-Z0-9_]+|SUPABASE_[A-Z0-9_]+|TCS_[A-Z0-9_]*(?:KEY|TOKEN|SECRET)[A-Z0-9_]*|service_role|secret_key|publishable_key|connection_string)\\b/i;
const INTERNAL_PATHS = /(?:netlify\\/functions|api\\/_lib|api\\/chat\\.js|\\/rest\\/v1\\/rpc\\/|\\.github\\/workflows|supabase\\/migrations|\\.env(?:\\.|\\b)|\\.sql\\b)/i;
const INTERNAL_MECHANISMS = /\\b(?:rpc|row level security|\\bRLS\\b|service role|environment variables?|variabel lingkungan|server handler|server-side key|migration|migrasi database|database schema|schema database|nama tabel|table name|api endpoint|endpoint internal|private endpoint|internal endpoint)\\b/i;
const TECHNICAL_DISCLOSURE_REQUEST = /\\b(?:backend|back-end|infrastruktur|arsitektur(?:\\s+internal)?|tech stack|stack teknologi|teknologi di balik|penyedia(?:\\s+(?:ai|model|inferensi|layanan))?|provider|vendor|hosting|host(?:ing)?|server|database|basis data|api key|kunci api|secret|rahasia teknis|kredensial|access token|token akses|rpc|endpoint|source code|kode sumber|repository|repositori|repo|file konfigurasi|environment variable|variabel lingkungan|nama model|model id|model yang digunakan|deployment|deploy|ci\\/cd|schema|migrasi)\\b/i;
const INTERNAL_SUBJECT = /\\b(?:tcs|the choco studios|choco\\s*ai|sara|lu|kamu|anda|saya|aku|kami|kita|you|your|we|our|aplikasi ini|layanan ini|sistem ini|produk ini|milik kita|milik tcs)\\b/i;

export const INTERNAL_TECHNICAL_REPLY =
  "Detail teknologi dan pengelolaan internal TCS tidak dipublikasikan. Saya dapat membantu menjelaskan fitur, layanan, dan panduan penggunaan yang tersedia bagi pengguna.";

function toSearchableText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value ?? "");
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

export function isInternalDisclosureQuestion(value) {
  const text = toSearchableText(value);
  if (!text.trim()) return false;
  if (PROVIDER_NAMES.test(text) || SECRET_IDENTIFIERS.test(text)) return true;
  return TECHNICAL_DISCLOSURE_REQUEST.test(text) && INTERNAL_SUBJECT.test(text);
}

export function isRestrictedInternalContent(value) {
  const text = toSearchableText(value);
  return PROVIDER_NAMES.test(text) ||
    SECRET_IDENTIFIERS.test(text) ||
    INTERNAL_PATHS.test(text) ||
    INTERNAL_MECHANISMS.test(text);
}

export function containsInternalTechnicalDisclosure(value) {
  return isRestrictedInternalContent(value);
}
