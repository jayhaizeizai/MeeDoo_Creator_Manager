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
