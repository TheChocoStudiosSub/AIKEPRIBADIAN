# Choco AI knowledge sources

Choco AI uses two separate knowledge layers:

- `data/knowledge/facts.json`, `concepts.json`, and `experiences.json` contain the small local knowledge corpus shipped with the application.
- `public.tcs_knowledge_documents` in the connected Supabase project stores curated TCS product knowledge and source metadata.

## Public and internal separation

- Public chat can retrieve only documents marked `visibility = 'public'` through `tcs_public_search_knowledge`.
- Owner chat can retrieve internal product references only after the backend validates the Owner session. The server then calls `tcs_owner_search_knowledge` with the server-only `TCS_OWNER_AUTH_SERVER_KEY`.
- Internal `READMEGPT.md` content must never be copied into the public browser bundle or exposed through the public search RPC.

## READMEGPT source files

The ten TCS product repositories listed in the Supabase knowledge registry each contain a `READMEGPT.md` reference file. Five files are plain UTF-8 Markdown and five are stored as whitespace-separated 8-bit binary text. The binary files must be decoded to UTF-8 text before indexing. The canonical indexed copies are stored in Supabase as internal documents, with the source repository, branch commit, file blob SHA, encoding, and content SHA-256 recorded.

Product facts must distinguish implemented behavior, public README claims, planned scope, and items that remain unverified. Repository names and product descriptions are not evidence that a feature exists.

## Synchronization audit

Every completed GitHub-to-Supabase import should create a row in `public.tcs_knowledge_sync_runs`. Store metadata only in the audit log; never place credentials, license keys, customer records, or full document bodies in the sync log.

## Environment

Configure `TCS_KNOWLEDGE_SUPABASE_URL`, `TCS_KNOWLEDGE_PUBLISHABLE_KEY`, and `TCS_OWNER_AUTH_SERVER_KEY` in the Vercel server environment. Do not use these values in frontend JavaScript. The Owner server key is not a user password and must not be stored in long-term chat memory.
