# Backend delivery status

This file distinguishes implemented behavior from the complete product specification.

## Implemented foundation
- Dedicated SQLite database using Node's built-in SQLite API (single application process), transactional writes and audit trail.
- Tenant plus record-owner isolation; administrator IDs configured explicitly through the restricted server environment. No implicit first-login administrator.
- Creator CRUD, country/contact/social fields, tags, archival API, collaboration history, tasks, policy versions, product catalog, contract drafts and external deliverable links.
- Optimistic version checks, idempotency for creation, server-side input allowlists, CSRF protection, parameterized queries and bounded request sizes.
- Authenticated UI for creating/editing/searching records, tasks and evidence history. No demo rows in the database.
- CSV preview with row decisions, source fingerprint idempotency, explicit duplicate confirmation and safe archival rollback API. Import does not overwrite existing records. Non-supported columns, including sensitive legacy attributes, are not stored. Owner labels and follower raw values are provenance, not operational authority/current metrics.
- Stage changes only for manually evidenced early conversation states. Integration-driven milestones fail closed.
- Database backup command with integrity verification and a dedicated daily timer.

## Not yet a complete P0 backend
- Gmail real-account validation, incremental history sync, attachment/HTML retrieval, reviewed sending and ambiguous-send reconciliation. Current synchronization is manual paginated read-only full threads with explicit classification, not continuous.
- OpenAI real-provider validation, editable draft/approval workflow, persisted suggestion browser, decision queue and Ask Agent. Responses API suggestions for linked complete plain-text threads and approved policies are implemented, with store=false and no tools/sending.
- Public Creator forms, email verification, issued contracts, atomic Clickwrap acceptance and receipts.
- Shipment gate evidence, shipping/fit events, upload scanning/private storage, publication evidence and independent rights/commission clocks.
- Lark notifications, full role/assignment management, broader CRM fields (dogs, multiple social identities), source-field mapping, import preview resume/rollback UI and business reports.

These functions remain explicitly unavailable; contract drafts and content links are not represented as accepted contracts or uploaded/scanned files. Direct manual mutation cannot create an accepted contract or a shipping milestone.

## Required inputs
- Work mailbox confirmed by user: jay@meedoo.group. This is not OAuth authorization.
- Google OAuth web-client configuration and mailbox consent; initial history range and sending aliases.
- AI provider and server-side credentials.
- Approved contract text/entity, payment method/deadline, identity verification and privacy/retention choices; approved products, sizes, stock and shipping rules.

## Operating boundaries
One Node process; SQLite and sessions are not configured for horizontal scaling. Sessions remain memory-only and expire on process restart. The built-in SQLite API is experimental on the deployed Node 22 runtime. Backups are local, with no off-host disaster recovery or retention cleanup configured. Do not copy the live SQLite database without using the backup API (WAL may contain recent writes).

## Restore
Stop only meedoo-creator. Preserve the current database and its WAL/SHM files in a restricted directory. Copy a verified backup to DB_PATH, owned by meedoo-creator with mode 0600, then start only this application. Do not modify the shared PostgreSQL service. Practice restore against a separate temporary path before production recovery.

## Automatic mailbox (2026-10-07)
Google connection now queues a persistent, server-side full-history job. Existing connections are queued on startup. The worker traverses all pages, checkpoints each page, retries with backoff and repeats a scan five minutes after completion. Closing a browser does not stop it. Identical provider content is not duplicated; human classifications and links are retained. Spam/Trash are excluded; deleting mail in Gmail does not purge the local archive. HTML-only messages and attachments still require manual review.
Inbox shows paginated summaries (50 visible rows per page, no ingestion cap), participant, message count, actual collaboration status, subject, preview and date, with search and inbox/unread/classification filters. No fabricated CRM statuses, external avatar lookups or sending controls. Gmail history-based incremental optimization remains future work.

Inbox and Agent are separate navigation items. Inbox displays all mail. Agent displays unfinished cooperation tasks and actionable AI suggestions as expandable cards; completing/reviewing a card is version-checked and audited, and never sends a message. Passive AI wait results and completed work are excluded. OpenAI remains separately configured; no mock tasks are inserted into production.

## Mail rendering (2026-10-07)
Mail bodies now preserve plain-text and HTML MIME alternatives separately with declared charset decoding. Browser rendering uses vendored DOMPurify 3.4.16, a strict tag/attribute allowlist and a Shadow DOM with a self-hosted stylesheet; application CSP remains unchanged. Readable 15px sans-serif body text replaces code blocks. Paragraphs, emphasis, tables and safe external links are retained. External images show placeholders, and scripts/forms/frames/CSS/active attributes are removed. Quotes and delivery diagnostics are collapsed but remain expandable. Attachment names are listed; attachment downloads and original visual styling are not implemented.
Existing rows are upgraded once on the next background scan, even if the provider fingerprint is unchanged. HTML-only and attachment messages remain ineligible for AI analysis until their plain-text context is complete. Inbox and Agent conversation views share the renderer.
Validation: 19 Node tests plus test/mail-render.browser.fixture (14 browser checks under production-equivalent CSP); the browser fixture must be served locally with /mail-view.mjs, /mail-body.css, /style.css and /vendor/dompurify.mjs mapped to public files. No production test messages are created.

## Reviewed sending (2026-10-08)
Admin-only Gmail reply sending is implemented with an explicit recipient/body preview and confirmation, actual granted-scope verification, CSRF/tenant/owner checks, draft/policy/content checks, UTF-8 MIME reply headers and a durable send ledger. Repeated requests cannot resend the same draft. Timeout, malformed success and ambiguous provider failures lock the conversation; startup converts interrupted sends to unknown. Operators must investigate unknown outcomes in Gmail before database-level reconciliation; there is no automatic retry or automatic reconciliation. Single-recipient, plain-text replies only; no Cc, attachments, aliases or automated sends. Unit and browser validation use synthetic provider responses, not real outbound messages. This supersedes earlier reviewed-sending gaps above.

## Compact reply composer (2026-10-08)
The composer shows the actual Gmail reply recipient inline and uses one explicit Send click, with no second confirmation dialog. Backend grant, draft, policy, thread and duplicate-send checks remain. Repeated AI summaries and attachment disclaimers are removed from the editor; generation errors remain visible. Template-bound outgoing attachments are not implemented yet; real templates and approved files are still needed.

## Template library and send correction (2026-10-08)
The Settings library now manages private brand files and enabled templates with fixed attachment bindings; Inbox can select templates, add/remove assets and persist attachments with draft versions. AI can select an enabled template by ID; the backend adds only that template’s stored assets. Outgoing multipart MIME contains validated bytes, with per-file and total-size limits. No live outbound validation has been performed.
Gmail rotates incoming attachmentId values on repeated full-thread reads. Send-content validation now uses normalized message content plus routing instead of these ephemeral IDs; substantive messages and recipient/header changes still block a stale send. The earlier two production attempts were rejected before sending (409), not sent or ambiguous. Playbook source import remains pending document access; its API currently denies reading.

Automatic attachments are limited to the requested brand material categories: uploaded files are labeled Brand Overview, Lookbook or Other. AI returns requested_materials only for an explicit incoming request; the backend intersects those categories with the selected enabled template’s bound files. Ordinary interest, prior offers and declines do not warrant attachments. Manual attachment selection remains available.
