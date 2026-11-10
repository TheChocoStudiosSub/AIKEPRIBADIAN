import handler from "../netlify/functions/chat.js";
import { adaptNetlifyHandler } from "./_lib/netlify-adapter.js";

async function appChatHandler(request) {
  if (request.method !== "POST") return handler(request);
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Body request bukan JSON yang valid." }, { status: 400 }); }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  const appRequest = new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, client: "app", stream: true })
  });
  return handler(appRequest);
}

export default adaptNetlifyHandler(appChatHandler);
