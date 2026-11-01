# Security

Local Dashboard is a single-user application that runs on your machine and reads your services. It is not exposed to the network.

## Reporting

This is a personal project. Open an issue or message the maintainer privately if you find a problem; do not publish working exploits.

## Model

- The HTTP server binds to `127.0.0.1` only. Requests with a foreign `Host` header and write requests from foreign origins are rejected (CSRF / DNS rebinding).
- Responses carry CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`.
- The Electron window has `contextIsolation`, `sandbox` and no Node integration. Navigation away from the app is blocked; external links open in the system browser.
- Access to services is read-only: notes, mail, calendar and Drive are never modified.
- The briefing sends a compact digest to `https://api.deepseek.com`. Vault note bodies, mail bodies and full URLs are never included.

## Secrets

- Connection secrets (Google tokens, IMAP passwords, GitHub token, DeepSeek key) are encrypted with AES-256-GCM using `data/secret.key`.
- `.env` and `data/` are gitignored. The repository contains no live credentials.
- `data/secret.key` is created with user-only permissions (mode `0600`). On Windows this maps to the current user's profile ACL.
- Backups copy the database but not `secret.key`. To restore on another machine, copy the key file too; without it encrypted values cannot be decrypted.

## Accepted risks

- The installer is not code-signed; Windows SmartScreen may warn about an unknown publisher.
- The port is reachable by other processes running as the same user. The API has no authentication beyond the local binding and origin checks.
- `data/server.log` may contain file paths and error messages, but never secrets.
- Browser history of excluded domains is skipped at write time; other domains are stored locally and only aggregated domain counts reach the AI provider.
