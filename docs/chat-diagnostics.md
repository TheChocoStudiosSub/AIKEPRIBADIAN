# Choco AI chat diagnostics

## What is recorded

Each valid non-Owner chat request is linked to:
- a server-issued anonymous visitor ID stored in a signed, HttpOnly cookie;
- a conversation ID and the title shown in the current chat UI (the first user message, limited to 36 characters);
- the client IP address read from trusted hosting request headers;
- request mode, model, upstream status, response finish reason, stream [DONE] receipt, response character/byte counts, and error state.

Full prompts, full assistant replies, cookies, and API credentials are not stored. Raw IP addresses and short conversation titles are stored in the private Supabase schema and expire after 30 days. Only server-key-gated RPCs can write or read these records. The Owner lookup endpoint also requires a valid Choco AI Owner session.

The visitor ID identifies a browser profile, not a verified human. Clearing cookies or switching browsers creates a new visitor ID. A shared network can have multiple visitor IDs even when the IP address is the same.

## Current frontend contract

The current frontend sends the first user message and conversation history. The backend uses the first user message as the title and a signed cookie as the conversation fallback. For tab-safe isolation, the frontend should send:
- conversationId: a UUID generated per tab/conversation and renewed by the “Percakapan baru” action;
- conversationTitle: the same title rendered in the recent-conversation list.

The browser must not send an IP address or visitor ID; both are derived or issued by the server.

The chat response exposes the following headers:
- X-Choco-Diagnostic-ID
- X-Choco-Conversation-ID

The frontend can report what it actually received by POSTing to /api/chat-diagnostics:
```json
{
  "action": "client_report",
  "diagnosticId": "<X-Choco-Diagnostic-ID>",
  "receivedCharacters": 1234,
  "receivedDone": true
}
```
This report is client telemetry, not authoritative proof. The Owner compares it with the server-side response character count and [DONE] state.

## Owner lookup

POST /api/owner/chat-diagnostics with a valid Owner session cookie:
```json
{
  "action": "lookup",
  "diagnosticId": "<diagnostic-id>",
  "limit": 20
}
```
You can filter by conversationId, visitorId, or ipAddress instead. IP and User-Agent are only returned to the verified Owner endpoint.
