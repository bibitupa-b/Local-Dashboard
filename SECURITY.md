# Security

Local Dashboard is a single-user application that runs on your machine and reads your services. It is not exposed to the network.

## Reporting

This is a personal project. Open an issue or message the maintainer privately if you find a problem; do not publish working exploits.

## Model

- The HTTP server binds to `127.0.0.1` only. Requests with a foreign `Host` header and write requests from foreign origins are rejected (CSRF / DNS rebinding).
- Responses carry CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`.
- The Electron window has `contextIsolation`, `sandbox` and no Node integration. Navigation away from the app is blocked; external links open in the system browser.
- Access to services is read-only: notes, mail, calendar and Drive are never modified.
- The briefing sends a compact digest to `https://api.deepseek.com` (`deepseek-flash`). The digest carries note paths, five short excerpts (up to 200 characters) from changed notes, mail subjects/senders with the first ~200 characters of unread messages, calendar events, due Google Tasks, weather values, RSS headlines/summaries, Slack channel names/counts, Teams chat names/counts and domain counts. Whole notes, full mail bodies, attachments, browser URLs, page titles, feed URLs and Slack or Teams message text are never included. A strict check re-reads every point against the digest.
- Weather coordinates go only to `api.open-meteo.com`; RSS feed URLs are fetched directly from the configured addresses. Neither goes to DeepSeek.
- **Local only** blocks every outbound request, including DeepSeek, weather, RSS, Slack, Microsoft 365, CalDAV, Gmail, GitHub and Google. Only the local vault and browser history keep syncing, and the briefing is generated from local rules. Network data already in the database stays visible; the topbar marks Local only.
- CalDAV talks only to the server URL you configured (iCloud or a custom host), read-only, using the app password or account password stored encrypted. The server never writes to events.
- Microsoft 365 talks only to `login.microsoftonline.com` (token exchange) and `graph.microsoft.com` (read-only). The delegated scopes are `offline_access User.Read Calendars.Read Chat.Read`: Outlook mail and Teams channels are not requested, and no admin consent is involved (if the tenant blocks user consent, an admin approves the four scopes once). Teams requests only message ids, timestamps, senders and mention flags via `$select`; message text is never stored, logged or sent.

## Secrets

- Connection secrets (Google tokens, Microsoft tokens and client secret, IMAP passwords, GitHub token, DeepSeek key, CalDAV password) are encrypted with AES-256-GCM using `data/secret.key`.
- `.env` and `data/` are gitignored. The repository contains no live credentials.
- `data/secret.key` is created with user-only permissions (mode `0600`). On Windows this maps to the current user's profile ACL.
- Backups copy the database but not `secret.key`. To restore on another machine, copy the key file too; without it encrypted values cannot be decrypted.

## Accepted risks

- The installer is not code-signed; Windows SmartScreen may warn about an unknown publisher.
- The port is reachable by other processes running as the same user. The API has no authentication beyond the local binding and origin checks.
- `data/server.log` may contain file paths and error messages, but never secrets.
- Browser history of excluded domains is skipped at write time; other domains are stored locally and only aggregated domain counts reach the AI provider.
