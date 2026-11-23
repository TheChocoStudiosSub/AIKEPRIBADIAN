const PROVIDER_NAMES = /\b(?:groq|supabase|vercel|netlify|firebase|cloudflare|amazon\s+web\s+services|aws|google\s+cloud|gcp|microsoft\s+azure|azure|openai|anthropic|claude|gemini|mistral|deepseek|cohere|openrouter|together(?:\s+ai)?|fireworks(?:\s+ai)?|cerebras|replicate|modal|railway|render|fly\.io|neon|planetscale|mongodb(?:\s+atlas)?|upstash)\b/i;
const SECRET_IDENTIFIERS = /\b(?:GROQ_[A-Z0-9_]+|SUPABASE_[A-Z0-9_]+|TCS_[A-Z0-9_]*(?:KEY|TOKEN|SECRET)[A-Z0-9_]*|service_role|secret_key|publishable_key|connection_string)\b/i;
const INTERNAL_PATHS = /(?:netlify\/functions|api\/_lib|api\/chat\.js|\/rest\/v1\/rpc\/|\.github\/workflows|supabase\/migrations|\.env(?:\.|\b)|\.sql\b)/i;
const INTERNAL_MECHANISMS = /\b(?:backend|back-end|infrastruktur|arsitektur(?:\s+internal)?|tech stack|stack teknologi|penyedia(?:\s+(?:ai|model|inferensi|layanan))?|provider|vendor|hosting|server|database|basis data|api|rpc|row level security|\bRLS\b|service role|environment variables?|variabel lingkungan|server handler|server-side key|migration|migrasi database|database schema|schema database|nama tabel|table name|api endpoint|endpoint internal|private endpoint|internal endpoint|kredensial|access token|token akses|secret|rahasia teknis|source code|kode sumber|repository|repositori|repo|file konfigurasi|nama model|model id|deployment|deploy|ci\/cd|schema)\b/i;
const INTERNAL_SUBJECT = /\b(?:tcs|the choco studios|choco\s*ai|sara|lu|kamu|anda|saya|aku|kami|kita|you|your|we|our|aplikasi ini|layanan ini|sistem ini|produk ini|milik kita|milik tcs|yang digunakan|yang dipakai|di balik)\b/i;
const GENERIC_EDUCATION_QUESTION = /^\s*(?:apa itu|jelaskan(?:\s+secara\s+umum)?|definisi|pengertian|what is|explain what)\b/i;

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
  if (!INTERNAL_MECHANISMS.test(text) && !INTERNAL_PATHS.test(text)) return false;
  if (INTERNAL_SUBJECT.test(text)) return true;
  return !GENERIC_EDUCATION_QUESTION.test(text);
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
