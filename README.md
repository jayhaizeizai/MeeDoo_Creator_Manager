# MeeDoo Creator Manager
Front-end prototype plus a server-side Lark OAuth login adapter. **Not deployed yet.**

## Run
Node.js 22+; no runtime npm dependencies.

```sh
cp .env.example .env
# For local preview, set NODE_ENV=development and APP_ORIGIN=http://localhost:4317
npm start
npm test
```

The public demo contains only fictional records and never sends mail. Authenticated users currently see an empty workspace because Gmail, database, AI, uploads and Clickwrap services are not implemented. UI previews of these modules are not functional backend features.

## Lark
Configure server-only LARK_APP_ID, LARK_APP_SECRET, LARK_ALLOWED_TENANTS and LARK_ALLOWED_OPEN_IDS. Both allowlists are mandatory; no tenant-wide access is assumed. Register the exact redirect URL:

`https://creator.meedoo.fun/auth/lark/callback`

Enable web login for the internal Lark app and give intended members access. The adapter uses the international Lark accounts authorize endpoint, v2 OAuth token exchange and v1 user_info. Real-app endpoint/permission compatibility still needs live validation; tests mock Lark and do not establish a successful real sign-in.

Credentials and provider tokens never reach frontend code. Server-side state is browser-bound, one-use and valid for ten minutes. Sessions use random opaque HttpOnly/SameSite cookies, Secure under HTTPS, eight-hour expiry and CSRF-checked logout. Both tenant_key and open_id must be allowlisted. Current role is operator only; later business APIs must implement granular roles.

Sessions are in memory: one process only; restart logs users out. Before horizontal scaling, use a shared durable session/rate-limit store. No provider tokens are retained after identity retrieval. No password or production secret is included in this repository.

## Existing-server deployment
See deploy/DEPLOYMENT.md. Templates are deliberately not auto-installed: existing server services and proxy configuration could not be inspected from the current execution environment.

## Product documentation
Start with [PRD](docs/PRODUCT_SPEC.md), [UI](docs/UI_SPEC.md), [Agent](docs/AGENT_SYSTEM.md), [Clickwrap](docs/CLICKWRAP_SPEC.md) and [CSV mapping](docs/CSV_IMPORT_SPEC.md).
