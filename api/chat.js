import handler from "../netlify/functions/chat.js";
import { adaptNetlifyHandler } from "./_lib/netlify-adapter.js";
import saraHandler from "./_lib/sara-runtime.js";

const chocoHandler = adaptNetlifyHandler(handler);

export default async function vercelHandler(req, res) {
  let url;
  try {
    url = new URL(req.url || "/", "https://vercel.invalid");
  } catch {
    url = new URL("/", "https://vercel.invalid");
  }

  // /api/sara is internally rewritten to /api/chat?mode=sara so both
  // assistants share one serverless function on the Vercel Hobby limit.
  if (url.pathname === "/api/sara" || url.searchParams.get("mode") === "sara") {
    return saraHandler(req, res);
  }

  return chocoHandler(req, res);
}
