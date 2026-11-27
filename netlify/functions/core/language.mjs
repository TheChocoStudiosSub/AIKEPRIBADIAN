const WORDS = {
  en: new Set([
    "the", "and", "you", "your", "who", "what", "where", "when", "why", "how", "yes", "yeah", "ok", "okay", "i", "we", "our", "my",
    "is", "are", "was", "were", "can", "could", "would", "should", "this", "that",
    "these", "those", "tell", "me", "please", "do", "does", "did", "have", "has",
    "created", "creator", "made", "make", "find", "found", "from", "with", "for",
    "about", "another", "website", "site", "hello", "hi", "thanks", "thank", "explain",
    "show", "give", "which", "it", "they", "them", "their", "there", "here",
    "need", "want", "speak", "language", "english"
  ]),
  id: new Set([
    "yang", "dan", "lu", "gw", "saya", "aku", "kamu", "apa", "siapa", "dimana",
    "kenapa", "gimana", "bagaimana", "bisa", "bahasa", "inggris", "halo", "hai",
    "dong", "aja", "nih", "itu", "ini", "dari", "untuk", "dengan", "adalah",
    "punya", "udah", "sudah", "mau", "bentar", "tolong", "terus", "nggak",
    "enggak", "ga", "gak", "kapan", "kenal", "ceritakan", "jelaskan",
    "situs", "berbicara", "pengen"
  ])
};

const MESSAGES = {
  id: {
    methodPost: "Gunakan metode POST.",
    missingApiKey: "Kunci API Groq belum dikonfigurasi di environment server.",
    bodyTooLarge: "Body request terlalu besar. Maksimal 64 KB.",
    invalidJson: "Body request harus berupa JSON object yang valid.",
    emptyMessage: "Pesan masih kosong.",
    messageTooLong: "Pesan terlalu panjang. Maksimal {limit} karakter.",
    ownerUnavailable: "Verifikasi Owner sedang tidak tersedia. Coba lagi beberapa saat.",
    ownerRateLimited: "Terlalu banyak percobaan verifikasi. Tunggu 15 menit sebelum mencoba kembali.",
    ownerInvalidConfig: "Konfigurasi verifikasi Owner tidak valid.",
    ownerInvalidCredential: "Kredensial Owner tidak valid.",
    ownerSessionFailed: "Sesi Owner belum dapat dibuat. Silakan coba kembali.",
    ownerVerified: "Identitas Owner berhasil diverifikasi. Sesi Owner aktif selama 8 jam pada browser ini.",
    rateLimit: "Batas sementara tercapai. Coba lagi dalam sekitar {seconds} detik.",
    groqRateLimitWait: "Batas penggunaan Groq sedang tercapai. Tunggu sekitar {seconds} detik sebelum mencoba kembali.",
    groqRateLimit: "Batas penggunaan Groq sedang tercapai. Tunggu sebentar sebelum mencoba kembali.",
    groqHttp: "Layanan Groq mengembalikan HTTP {status}. Coba lagi nanti.",
    groqNoStream: "Groq tidak mengirimkan aliran respons.",
    groqUnavailable: "Tidak bisa menghubungi layanan Groq.",
    groqEmpty: "Model mengembalikan jawaban kosong.",
    explicitRefusal: "Gw nggak akan meladeni bahasa seksual vulgar. Kalau yang lu butuhkan informasi kesehatan atau edukasi seksual, tanyakan dengan konteks yang jelas dan gw akan jawab secara informatif.",
    violenceRefusal: "Gw nggak bisa membantu merencanakan pembunuhan atau melukai orang. Kalau ini berkaitan dengan seseorang yang sedang bikin lu marah, jauhi orang itu dan benda yang bisa dipakai untuk melukai. Kalau ada bahaya langsung, hubungi layanan darurat setempat atau orang tepercaya sekarang.",
    blocked: "Permintaan itu tidak bisa dibantu."
  },
  en: {
    methodPost: "Use the POST method.",
    missingApiKey: "The Groq API key is not configured in the server environment.",
    bodyTooLarge: "The request body is too large. The maximum size is 64 KB.",
    invalidJson: "The request body must be a valid JSON object.",
    emptyMessage: "The message is empty.",
    messageTooLong: "The message is too long. The maximum length is {limit} characters.",
    ownerUnavailable: "Owner verification is temporarily unavailable. Please try again shortly.",
    ownerRateLimited: "There have been too many verification attempts. Please wait 15 minutes before trying again.",
    ownerInvalidConfig: "The Owner verification configuration is invalid.",
    ownerInvalidCredential: "The Owner credentials are invalid.",
    ownerSessionFailed: "The Owner session could not be created. Please try again.",
    ownerVerified: "Owner identity verified. The Owner session is active in this browser for 8 hours.",
    rateLimit: "The temporary usage limit has been reached. Please try again in about {seconds} seconds.",
    groqRateLimitWait: "Groq is temporarily rate-limiting requests. Please wait about {seconds} seconds before trying again.",
    groqRateLimit: "Groq is temporarily rate-limiting requests. Please wait a moment before trying again.",
    groqHttp: "Groq returned HTTP {status}. Please try again later.",
    groqNoStream: "Groq did not return a response stream.",
    groqUnavailable: "Unable to reach the Groq service.",
    groqEmpty: "The model returned an empty response.",
    explicitRefusal: "I can’t help with sexually explicit or vulgar content. For health or sexual-education information, ask a clear, non-explicit question and I’ll answer factually.",
    violenceRefusal: "I can’t help plan a killing or harm someone. If you are angry with someone, create distance and move away from anything that could be used as a weapon. If anyone is in immediate danger, contact local emergency services or a trusted person now.",
    blocked: "I can’t help with that request."
  },
  zh: {
    methodPost: "请使用 POST 方法。",
    missingApiKey: "服务器环境中尚未配置 Groq API 密钥。",
    bodyTooLarge: "请求正文过大。最大限制为 64 KB。",
    invalidJson: "请求正文必须是有效的 JSON 对象。",
    emptyMessage: "消息为空。",
    messageTooLong: "消息过长。最多允许 {limit} 个字符。",
    ownerUnavailable: "Owner 身份验证暂时不可用，请稍后重试。",
    ownerRateLimited: "验证尝试次数过多，请等待 15 分钟后再试。",
    ownerInvalidConfig: "Owner 身份验证配置无效。",
    ownerInvalidCredential: "Owner 凭据无效。",
    ownerSessionFailed: "无法创建 Owner 会话，请重试。",
    ownerVerified: "Owner 身份验证成功。此浏览器中的 Owner 会话有效期为 8 小时。",
    rateLimit: "已达到临时使用限制，请在约 {seconds} 秒后重试。",
    groqRateLimitWait: "Groq 当前正在限制请求。请等待约 {seconds} 秒后重试。",
    groqRateLimit: "Groq 当前正在限制请求，请稍后重试。",
    groqHttp: "Groq 返回了 HTTP {status}。请稍后重试。",
    groqNoStream: "Groq 未返回响应流。",
    groqUnavailable: "无法连接到 Groq 服务。",
    groqEmpty: "模型返回了空响应。",
    explicitRefusal: "我不能帮助生成露骨或粗俗的性内容。关于健康或性教育的问题，请以清晰、非露骨的方式提问，我会提供客观的信息。",
    violenceRefusal: "我不能帮助策划杀人或伤害他人。如果你正在生某人的气，请与对方保持距离，并远离可能用于伤害他人的物品。如果有人正面临直接危险，请立即联系当地紧急服务或可信赖的人。",
    blocked: "我无法帮助处理此请求。"
  }
};

function languageScore(value) {
  const words = String(value || "").normalize("NFKC").toLowerCase().match(/[\p{L}]+/gu) || [];
  let en = 0;
  let id = 0;
  for (const word of words) {
    if (WORDS.en.has(word)) en += 1;
    if (WORDS.id.has(word)) id += 1;
  }
  return { en, id };
}

function confidentLanguage(value) {
  if (/[\u3400-\u9fff]/u.test(String(value || ""))) return "zh";
  const { en, id } = languageScore(value);
  if (en >= 1 && en > id) return "en";
  if (id >= 1 && id > en) return "id";
  return null;
}

export function detectResponseLanguage(message, history = []) {
  const current = confidentLanguage(message);
  if (current) return current;

  if (Array.isArray(history)) {
    for (const item of history.slice(-6).reverse()) {
      if (item?.role !== "user" || typeof item.content !== "string") continue;
      const previous = confidentLanguage(item.content);
      if (previous) return previous;
    }
  }
  return "id";
}

export function formatChatMessage(key, language = "id", values = {}) {
  const locale = MESSAGES[language] ? language : "id";
  const template = MESSAGES[locale][key] || MESSAGES.id[key] || MESSAGES.id.blocked;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : ""
  );
}

export function normalizeResponseLanguage(value) {
  if (typeof value !== "string") return null;
  const language = value.trim().toLowerCase();
  if (language === "id" || language.startsWith("id-")) return "id";
  if (language === "en" || language.startsWith("en-")) return "en";
  if (language === "zh" || language.startsWith("zh-")) return "zh";
  return null;
}

export function resolveResponseLanguage(preferredLanguage, message, history = []) {
  return normalizeResponseLanguage(preferredLanguage) || detectResponseLanguage(message, history);
}

export function getLanguageInstruction(language) {
  if (language === "en") {
    return "The user selected English in the application's language selector. Reply entirely in English. Keep every explanation, heading, clarification, refusal, and status sentence in English, even when the user's message, conversation history, or retrieved TCS documents use another language. Preserve official TCS names and URLs.";
  }
  if (language === "zh") {
    return "用户在应用语言选择器中选择了简体中文。请完全使用简体中文回复。说明、标题、澄清、拒绝和状态提示都必须使用简体中文，即使用户消息、对话历史或检索到的 TCS 文档使用其他语言。保留 TCS 官方名称和 URL。";
  }
  return "Pengguna memilih bahasa Indonesia pada pemilih bahasa aplikasi. Balas sepenuhnya dalam bahasa Indonesia, termasuk penjelasan, judul, klarifikasi, penolakan, dan status, meskipun pesan pengguna, riwayat percakapan, atau dokumen TCS menggunakan bahasa lain. Pertahankan nama resmi TCS dan URL.";
}
