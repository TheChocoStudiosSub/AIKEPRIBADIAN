# Choco AI chat diagnostics

## What is recorded

Each chat request that passes the distributed rate limit and is not from a verified Owner session is linked to:
- a server-issued anonymous visitor ID stored in a signed, HttpOnly cookie;
- a conversation ID and the title supplied by the current chat UI (limited to 36 characters; common email addresses, phone numbers, and URLs are masked before storage);
- the client IP address read from trusted hosting request headers;
- request mode, model, upstream status, response finish reason, stream [DONE] receipt, response character/byte counts, and error state.

Full prompts, full assistant replies, cookies, and API credentials are not stored. Raw IP addresses, user agents, visitor/conversation IDs, and short UI titles are stored in the private Supabase schema. Common email addresses, phone numbers, and URLs in titles are masked, but a title can still contain other user-provided text; do not put secrets in conversation titles. Records are deleted by an internal Supabase Cron job every 15 minutes once they expire (30-day retention). Only server-key-gated RPCs can write or read these records. The Owner lookup endpoint also requires a valid Choco AI Owner session. Verified Owner requests and requests rejected by the chat rate limiter are not recorded.

The visitor ID identifies a browser profile, not a verified human. Clearing cookies or switching browsers creates a new visitor ID. A shared network can have multiple visitor IDs even when the IP address is the same.

## Frontend implementation checklist

The frontend owns the identity of each visible conversation. The backend owns the visitor identity, trusted client IP detection, diagnostic record, and validation.

## Frontend integration status on this PR branch

The browser integration is now included in this PR branch:
- `public/assets/js/chat-diagnostics-client.js` provides secure conversation UUID generation, response-header validation, SSE frame parsing, and best-effort receipt submission.
- `public/assets/js/chat-controller.js` sends the active conversation ID and visible title, reads the diagnostic headers, counts assistant content received, and reports completion or partial delivery.
- `public/index.html` loads the diagnostics helper before the chat controller.
- `tests/chat-diagnostics-client.test.mjs` covers UUID generation, response headers, SSE parsing, receipt payloads, and failure isolation.

The current chat UI keeps the active conversation and message history in page memory. A page refresh starts a fresh in-memory conversation; this integration does not add persistent chat history or restore old conversations from the recent list. Each open tab starts with its own conversation UUID, and pressing **Percakapan baru** rotates that UUID.

### 1. Keep a separate conversation ID for each conversation

- Generate a UUID when a new conversation is created.
- Keep that ID attached to that conversation's frontend state/data and send the same ID on every message in that conversation.
- When the user selects **Percakapan baru**, generate a fresh UUID. Do not reuse the previous conversation ID.
- Do not keep one global conversation ID in localStorage for every tab. Two tabs displaying different conversations must send different conversation IDs.
- When opening an existing conversation from the recent-conversation list, restore that conversation's own ID.

### 2. Send the visible conversation title with every chat request

Include these fields in the existing POST request to `/api/chat`:

```json
{
  "conversationId": "<uuid-for-this-conversation>",
  "conversationTitle": "<title-currently-shown-in-the-UI>"
}
```

Keep the existing chat payload and history fields. Add these two fields rather than replacing the existing request body.

Use the same title the user sees in the chat/recent-conversation UI. If the title is generated or edited after the first message, send the updated title on subsequent requests. The backend sanitizes the title, masks common email/phone/URL patterns, and limits it to 36 characters. If no title is supplied, it stores the generic label `Percakapan`; it never copies the message body into the title as a fallback. Titles are still metadata and may contain other user-provided wording.

### 3. Read the diagnostic response headers

For each response from `/api/chat`, read these headers:

- `X-Choco-Diagnostic-ID`: identifies this individual request. Save it for the client receipt report.
- `X-Choco-Conversation-ID`: the conversation ID resolved by the backend. It should match the ID sent by the frontend.

Header names are case-insensitive. Do not put either value in the visible chat transcript. If the diagnostic ID header is absent, skip the client receipt report for that request.

### 4. Report what the browser actually received

After receiving the response, POST to `/api/chat-diagnostics` with same-origin credentials:

```json
{
  "action": "client_report",
  "diagnosticId": "<X-Choco-Diagnostic-ID>",
  "receivedCharacters": 1234,
  "receivedDone": true
}
```

For a streamed response:
- Count the actual text characters received from assistant content deltas and appended to the displayed answer. Do not count SSE metadata, role names, tool metadata, or other JSON fields.
- Set `receivedDone` to `true` only after the stream's `[DONE]` marker is received.
- If the stream errors, is cut off, or is cancelled before `[DONE]`, still send the report with the characters received so far and `receivedDone: false`, when the diagnostic ID header is available.
- Parse streamed chunks with buffering. A network chunk boundary is not guaranteed to match an SSE event boundary.

For a non-streamed JSON response:
- Count the assistant text actually received and displayed.
- Set `receivedDone` to `true` only after the response body has been fully read and parsed successfully. Do not treat an HTTP error or an incomplete response as successful completion.

Use `credentials: "same-origin"` and JSON content type when calling the receipt endpoint. The browser must not send an IP address, visitor ID, or conversation ID to this endpoint; the backend verifies the signed visitor cookie and binds the report to the diagnostic record. Receipt submissions are rate-limited to 40 per visitor per 10 minutes, and each diagnostic record accepts only its first client receipt. A rejected or unavailable receipt never changes the chat response.

### 5. Keep diagnostic failures out of the chat experience

- Failure to read diagnostic headers or submit a client receipt must not break, delay, or replace the user's chat response.
- Do not display diagnostic IDs, visitor IDs, IP addresses, or telemetry errors in the normal chat UI.
- Do not log full prompts, full replies, cookies, or API credentials as a workaround.

## Backend fallback behavior

The frontend sends an explicit UUID for the active conversation. If a client omits it, the backend reuses the conversation ID in the valid signed cookie even when the request history is empty, which keeps a failed first-turn retry in the same group. The cookie fallback is browser-wide and therefore is not sufficient to separate simultaneous tabs; explicit per-conversation IDs remain required for tab-safe correlation.

Server-side `response_bytes` means UTF-8 bytes of assistant text content only, consistently for streamed and non-streamed requests. It does not include SSE framing or metadata.

The browser must not send an IP address or visitor ID; both are derived or issued by the server.

## Owner lookup

POST `/api/owner/chat-diagnostics` with a valid Owner session cookie:

```json
{
  "action": "lookup",
  "diagnosticId": "<diagnostic-id>",
  "limit": 20
}
```

You can filter by `conversationId`, `visitorId`, or `ipAddress` instead. IP and User-Agent are only returned to the verified Owner endpoint.
