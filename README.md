# MeeDoo Creator Manager
Lark-authenticated workspace deployed at https://creator.meedoo.fun. Persistent backend foundation is implemented; the complete P0 product is not yet delivered. See [backend status](docs/BACKEND_STATUS.md).

## Run
Node.js 22.16+; no runtime npm dependencies. SQLite is experimental on Node 22. Production requires persistent DB_PATH; local development may use DB_PATH=./data/workspace.sqlite.

```sh
cp .env.example .env
# For local preview, set NODE_ENV=development and APP_ORIGIN=http://localhost:4317
npm start
npm test
```

Unauthenticated visitors only see the Lark sign-in page; no demo workspace or sample records are shipped. Authenticated users manage persistent Creator, collaboration, task, product, policy, contract-draft and content-link records. CSV imports require row-level review. Approved policies are immutable. Contract acceptance, shipping, private uploads and sending remain unavailable pending their evidence workflows.

## Lark
Configure server-only LARK_APP_ID, LARK_APP_SECRET, LARK_ALLOWED_TENANTS and LARK_ALLOWED_OPEN_IDS. Both allowlists are mandatory; no tenant-wide access is assumed. Register the exact redirect URL:

`https://creator.meedoo.fun/auth/lark/callback`

Enable web login for the internal Lark app and give intended members access. The adapter uses the international Lark accounts authorize endpoint, v2 OAuth token exchange and v1 user_info. Real-app endpoint/permission compatibility still needs live validation; tests mock Lark and do not establish a successful real sign-in.

Credentials and provider tokens never reach frontend code. Server-side state is browser-bound, one-use and valid for ten minutes. Sessions use random opaque HttpOnly/SameSite cookies, Secure under HTTPS, eight-hour expiry and CSRF-checked logout. Both tenant_key and open_id must be allowlisted. LARK_ADMIN_OPEN_IDS explicitly assigns administrators; other authorized members are operators limited to records they own.

Sessions are in memory: one process only; restart logs users out. Before horizontal scaling, use a shared durable session/rate-limit store. No provider tokens are retained after identity retrieval. No password or production secret is included in this repository.

## Existing-server deployment
See deploy/DEPLOYMENT.md. Use the existing dedicated systemd service and nginx vhost. Preserve other server services. The database lives in /var/lib/meedoo-creator and is excluded from releases.

## Product documentation
Start with [PRD](docs/PRODUCT_SPEC.md), [UI](docs/UI_SPEC.md), [Agent](docs/AGENT_SYSTEM.md), [Clickwrap](docs/CLICKWRAP_SPEC.md) and [CSV mapping](docs/CSV_IMPORT_SPEC.md).

## Google and AI setup
Google redirect: https://creator.meedoo.fun/auth/google/callback. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, WORK_EMAIL and TOKEN_ENCRYPTION_KEY (32 random bytes, 64 hex characters) only in the restricted server environment. Enable Gmail API and authorize from Settings. OAuth requests gmail.readonly and gmail.send, records actual grants, and prompts existing read-only connections to reauthorize. Sending remains unimplemented and disabled. The integration provides automatic resumable full-history synchronization (excluding Spam/Trash), five-minute refresh scans, explicit classification and no sending. Tokens are encrypted outside audit records.

Configure OPENAI_API_KEY and OPENAI_MODEL only on the server. Linked complete plain-text threads can generate suggestions using Responses API, store=false, approved policies and no tools. Full analysis requires complete content; reply drafting supports readable text with explicit attachment-review warnings. Provider credentials and live validation are deployment-specific. See deploy/backup.mjs for consistent database backups; off-host backups remain to be configured.


## MiniMax replies
Set AI_PROVIDER=minimax, MINIMAX_API_KEY, MINIMAX_MODEL=MiniMax-M3 and MINIMAX_REGION=global (international) or cn (China) in the root-only server environment. Uses the official Chat Completions endpoint with no tools, validated JSON output and no automatic sending. Complete plain-text conversations can generate an editable reply without a CRM link; existing linked analysis remains available. HTML-only mail is converted to text with vendored html-to-text. Attachments do not block text-based reply drafting, but always require human review; missing text still blocks generation. Draft edits retain the original and version history; regeneration appends a new suggestion. Authentication, tenant checks, CSRF and stale-thread checks apply. No provider key is exposed to the browser.

Inbox has per-user workspace read/unread markers in the right-hand menu; Gmail remains read-only. New message IDs invalidate an old read marker. The mail detail uses a contact sidebar, collapsible message cards and an editable reply panel.
