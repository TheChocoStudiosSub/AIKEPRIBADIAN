const LEGACY_URLS = [
  ["https://tcs-chocoai.vercel.app", "https://chocoai.thechocostudios.bond"],
  ["https://tcs-choco-ai.vercel.app", "https://chocoai.thechocostudios.bond"],
  ["https://the-choco-studios-official.vercel.app", "https://thechocostudios.bond"],
  ["https://the-choco-studios-information.vercel.app", "https://information.thechocostudios.bond"],
  ["https://the-choco-studio-information.netlify.app", "https://information.thechocostudios.bond"],
  ["https://choco-ai-help-center.vercel.app", "https://helpcenter.thechocostudios.bond"],
  ["https://choco-ai-help-center.netlify.app", "https://helpcenter.thechocostudios.bond"],
  ["https://tcs-linkguard.vercel.app", "https://linkguard.thechocostudios.bond"],
  ["https://sheeblink.vercel.app", "https://sheeblink.thechocostudios.bond"],
  ["https://vornika-games.vercel.app", "https://vornika.thechocostudios.bond"],
  ["https://tcs-uploadfit.vercel.app", "https://apps.microsoft.com/detail/9MZ61KZF53LW"],
  ["https://tcs-template.vercel.app", "TCS Template is currently SSO-protected; no verified public access URL is available"]
];

const MAX_LEGACY_URL_LENGTH = Math.max(...LEGACY_URLS.map(([url]) => url.length));

export function canonicalizeTcsUrls(value) {
  let text = String(value ?? "");
  for (const [legacy, canonical] of LEGACY_URLS) {
    text = text.split(legacy).join(canonical);
  }
  return text;
}

/**
 * Rewrite retired public TCS aliases in an upstream SSE stream without buffering
 * the complete response. A rolling tail prevents URL matches from being split
 * across network chunks.
 */
export function canonicalizeTcsStream(stream) {
  if (!stream || typeof stream.getReader !== "function") return stream;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let carry = "";

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const combined = carry + decoder.decode(value, { stream: true });
          const safeLength = Math.max(0, combined.length - MAX_LEGACY_URL_LENGTH);
          if (safeLength > 0) {
            controller.enqueue(encoder.encode(canonicalizeTcsUrls(combined.slice(0, safeLength))));
            carry = combined.slice(safeLength);
          } else {
            carry = combined;
          }
        }
        carry += decoder.decode();
        if (carry) controller.enqueue(encoder.encode(canonicalizeTcsUrls(carry)));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        try { reader.releaseLock(); } catch {}
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
    }
  });
}
