import handler from "../netlify/functions/chat.js";
import { adaptNetlifyHandler } from "./_lib/netlify-adapter.js";
import saraHandler from "./_lib/sara-runtime.js";

const chocoHandler = adaptNetlifyHandler(handler);
const appHandler = adaptNetlifyHandler(async (request) => {
  if (request.method !== "POST") return handler(request);
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Body request bukan JSON yang valid." }, { status: 400 }); }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  return handler(new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, client: "app", stream: true })
  }));
});

export default async function vercelHandler(req, res) {
  let url;
  try { url = new URL(req.url || "/", "https://vercel.invalid"); }
  catch { url = new URL("/", "https://vercel.invalid"); }

  if (url.pathname === "/api/sara" || url.searchParams.get("mode") === "sara") {
    return saraHandler(req, res);
  }
  if (url.searchParams.get("client") === "app") return appHandler(req, res);
  return chocoHandler(req, res);
}
