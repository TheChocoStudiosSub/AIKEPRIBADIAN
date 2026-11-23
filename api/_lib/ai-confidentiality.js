const PROVIDER_NAMES = /\b(?:groq|supabase|vercel|netlify|firebase|cloudflare|amazon\s+web\s+services|aws|google\s+cloud|gcp|microsoft\s+azure|azure|openai|anthropic|claude|gemini|mistral|deepseek|cohere|openrouter|together(?:\s+ai)?|fireworks(?:\s+ai)?|cerebras|replicate|modal|railway|render|fly\.io|neon|planetscale|mongodb(?:\s+atlas)?|upstash)\b/i;
const SECRET_IDENTIFIERS = /\b(?:GROQ_[A-Z0-9_]+|SUPABASE_[A-Z0-9_]+|TCS_[A-Z0-9_]*(?:KEY|TOKEN|SECRET)[A-Z0-9_]*|service_role|secret_key|publishable_key|connection_string)\b/i;
const INTERNAL_PATHS = /(?:netlify\/functions|api\/_lib|api\/chat\.js|\/rest\/v1\/rpc\/|\.github\/workflows|supabase\/migrations|\.env(?:\.|\b)|\.sql\b)/i;
const INTERNAL_MECHANISMS = /\b(?:backend|back-end|infrastruktur|arsitektur(?:\s+internal)?|tech stack|stack teknologi|penyedia(?:\s+(?:ai|model|inferensi|layanan))?|provider|vendor|hosting|server|database|basis data|api|rpc|row level security|\bRLS\b|service role|environment variables?|variabel lingkungan|server handler|server-side key|migration|migrasi database|database schema|schema database|nama tabel|table name|api endpoint|endpoint internal|private endpoint|internal endpoint|kredensial|access token|token akses|secret|rahasia teknis|source code|kode sumber|repository|repositori|repo|file konfigurasi|nama model|model id|deployment|deploy|ci\/cd|schema)\b/i;
const INTERNAL_SUBJECT = /\b(?:tcs|the choco studios|choco\s*ai|sara|lu|lo|kamu|anda|saya|aku|kami|kita|you|your|we|our|aplikasi ini|layanan ini|sistem ini|produk ini|milik kita|milik tcs|yang digunakan|yang dipakai|di balik|this system|this app|our app|our system)\b/i;
const GENERIC_EDUCATION_QUESTION = /^\s*(?:(?:apa\s+itu|jelaskan(?:\s+secara\s+umum)?|definisi|pengertian|apa\s+perbedaan|apa\s+bedanya|bedakan|bagaimana\s+cara\s+kerja|cara\s+kerja|bagaimana\s+kerja|what is|explain(?:\s+what)?|define|how does|how do|what(?:'s)? the difference between)\b)/i;

export const INTERNAL_TECHNICAL_REPLY =
  "Detail teknologi dan pengelolaan internal TCS tidak dipublikasikan. Saya dapat membantu menjelaskan fitur, layanan, dan panduan penggunaan yang tersedia bagi pengguna.";

function toSearchableText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value ?? "");
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

function isGenericPublicEducation(text) {
  return GENERIC_EDUCATION_QUESTION.test(text) && !INTERNAL_SUBJECT.test(text);
}

export function isInternalDisclosureQuestion(value) {
  const text = toSearchableText(value);
  if (!text.trim()) return false;
  if (SECRET_IDENTIFIERS.test(text)) return true;
  const genericEducation = isGenericPublicEducation(text);
  if (PROVIDER_NAMES.test(text)) return !genericEducation;
  if (INTERNAL_PATHS.test(text)) return true;
  if (!INTERNAL_MECHANISMS.test(text)) return false;
  if (genericEducation) return false;
  return true;
}

export function isRestrictedInternalContent(value) {
  const text = toSearchableText(value);
  if (SECRET_IDENTIFIERS.test(text) || INTERNAL_PATHS.test(text)) return true;
  const hasInternalSubject = INTERNAL_SUBJECT.test(text);
  return hasInternalSubject &&
    (PROVIDER_NAMES.test(text) || INTERNAL_MECHANISMS.test(text));
}

export function containsInternalTechnicalDisclosure(value) {
  return isRestrictedInternalContent(value);
}

export function protectOpenAiSseStream(source, holdback = 120) {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let inputBuffer = "";
  let fullAnswer = "";
  let pending = "";
  let blocked = false;
  let sawDone = false;

  const encodeDelta = text => encoder.encode(
    "data: " + JSON.stringify({ choices: [{ delta: { content: text } }] }) + "\n\n"
  );
  const encodeDone = () => encoder.encode("data: [DONE]\n\n");

  function processFrame(frame) {
    if (blocked || sawDone) return [];
    const payload = frame.split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trim())
      .join("\n");
    if (!payload) return [];
    if (payload === "[DONE]") {
      sawDone = true;
      const output = [];
      if (!blocked && pending) output.push(encodeDelta(pending));
      pending = "";
      output.push(encodeDone());
      return output;
    }

    let event;
    try { event = JSON.parse(payload); }
    catch { return []; }
    if (event && event.error) {
      blocked = true;
      pending = "";
      return [encodeDelta("Layanan AI sedang mengalami kendala. Silakan coba kembali.")];
    }

    const delta = event && event.choices && event.choices[0] &&
      event.choices[0].delta && event.choices[0].delta.content;
    if (typeof delta !== "string" || !delta) return [];

    fullAnswer += delta;
    if (containsInternalTechnicalDisclosure(fullAnswer)) {
      blocked = true;
      pending = "";
      return [encodeDelta(INTERNAL_TECHNICAL_REPLY)];
    }

    pending += delta;
    if (pending.length > holdback) {
      const safeChunk = pending.slice(0, pending.length - holdback);
      pending = pending.slice(-holdback);
      return safeChunk ? [encodeDelta(safeChunk)] : [];
    }
    return [];
  }

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const result = await reader.read();
          inputBuffer += decoder.decode(result.value || new Uint8Array(), {
            stream: !result.done
          });
          const frames = inputBuffer.split(/\r?\n\r?\n/);
          inputBuffer = frames.pop() || "";
          for (const frame of frames) {
            for (const output of processFrame(frame)) controller.enqueue(output);
          }

          if (result.done) {
            if (inputBuffer.trim()) {
              for (const output of processFrame(inputBuffer)) controller.enqueue(output);
            }
            if (!sawDone) {
              if (!blocked && pending) controller.enqueue(encodeDelta(pending));
              controller.enqueue(encodeDone());
            }
            controller.close();
            return;
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        try { reader.releaseLock(); } catch {}
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
}
