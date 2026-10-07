# Deployment handoff — creator.meedoo.fun
Status: deployed on 2026-10-07. HTTPS and real Lark sign-in/logout verified. The persistent backend foundation is deployed; see docs/BACKEND_STATUS.md for remaining product scope. Existing backstage and gifts services and PostgreSQL remained running unchanged. Current release path is resolved through /opt/meedoo-creator/current.

## Safe installation sequence
1. Inspect OS, current listeners (especially 80,443,4317), systemd/Docker workloads, nginx/apache/caddy config and existing certificates. Do not install a competing proxy, replace global config or stop other services.
2. Confirm creator.meedoo.fun A/AAAA records reach the intended host. Resolve incompatible AAAA records before ACME. Confirm inbound HTTP/HTTPS using existing firewall policies; do not flush firewall rules.
3. Use Node 22+ without upgrading the system runtime used by other apps. If /usr/bin/node is unsuitable, install an isolated runtime and adjust only this unit's ExecStart.
4. Create a dedicated non-login meedoo-creator user. Place a versioned release under /opt/meedoo-creator/releases/<commit>; maintain /opt/meedoo-creator/current symlink. Keep files owned by root and readable by the service.
5. Create /etc/meedoo-creator.env with mode 0600, root-owned, using .env.example. systemd reads it before dropping privileges. Fill credentials and allowlists through a secure server management channel, not Git or shell history. Never store the SSH password here.
6. Confirm loopback port 4317 is free. Install the dedicated unit, start it, and verify http://127.0.0.1:4317/healthz. If port is occupied choose a free port and adjust both environment and proxy template.
7. If nginx is the existing proxy, back up configuration and add only this hostname's HTTP vhost using nginx-http.conf. If another proxy is in use, translate the route into that proxy instead; do not blindly use these templates.
8. Validate config before reload. Use existing ACME tooling in webroot mode, root /var/www/meedoo-acme, to issue a certificate for creator.meedoo.fun. Avoid standalone mode that takes over port 80. Confirm certificate paths, then enable the HTTPS template. Validate before reload; do not restart unrelated apps.
9. Add safe renewal reload hook (nginx -t before reload) to the existing ACME setup. Verify HTTPS chain, renewal dry-run, Lark redirect, allowed login, denied login, logout and session expiry.
10. Check existing services still respond, and document release SHA, unit, port and config paths.

## Rollback
Restore the previous application symlink and restart only meedoo-creator. Restore only this virtual host's previous config and validate before proxy reload. Do not delete shared certificates or global proxy files. First installation rollback removes only this app's route/unit, leaving all other services intact.

## Outstanding inputs
Lark is configured and real login is verified. Pending Google OAuth web client and OpenAI API configuration. Google callback: https://creator.meedoo.fun/auth/google/callback. Work mailbox: jay@meedoo.group. See docs/BACKEND_STATUS.md for verification and product gaps.

## Persistent backend deployment
Set DB_PATH=/var/lib/meedoo-creator/workspace.sqlite and explicit LARK_ADMIN_OPEN_IDS in the root-only environment file. The unit StateDirectory provides a private writable path. Install the dedicated backup service/timer only after testing deploy/backup.mjs against the deployed Node runtime. Current daily backups are local and integrity-checked; off-host recovery and retention remain unconfigured. Preserve the database and encryption key through releases.

The nginx callback logging exception must cover both /auth/lark/callback and /auth/google/callback, including error logging. Validate before reloading nginx. Never log provider codes, tokens or secrets.
