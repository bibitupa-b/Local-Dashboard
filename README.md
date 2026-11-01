# Local Dashboard

A single-user dashboard that runs on your own machine and shows one quiet screen: what changed in your notes and cloud drive, what is waiting for your attention, and a short daily briefing written by DeepSeek.

Everything stays local. The only outbound request is the digest sent to the DeepSeek API when a briefing is generated.

> Status: 0.9 — Unbounded/Onest typography, Glassy Orbit icon and tilt-shift motion; 1.0 follows after stabilisation.

Screens: open `docs/screenshots/0.8/index.html`.

## What it does

- **Activity history** — detects edits to a local Obsidian vault and changes in Google Drive, keeps a diff-backed log.
- **Attention queue** — open tasks from notes (grouped by tag), projects marked `status: Undone` that have gone stale, notes left in the Inbox, unread mail and the next calendar event.
- **Today** — a slim strip with the day's calendar events, free windows and conflicts.
- **Search** — one query across note text, mail, Drive file names and Google Docs content.
- **Browser history** — reads a copy of Chrome/Edge history; digest sees only domain aggregates, and sensitive domains can be excluded.
- **GitHub** — unread notifications and review requests in the attention queue.
- **Notifications** — Windows toasts 15 minutes before an event and when an automatic briefing is ready.
- **Daily briefing** — DeepSeek receives a compact digest (not your vault) and returns 5–7 bullets: what moved, what is stuck, one suggestion for today. Runs on a schedule and on demand.
- **Mail** — read-only Gmail over IMAP: subjects, senders and text of messages from the last 90 days (up to 512 KB each); older mail keeps headers only. Attachments are indexed by name, never downloaded.

Explicit non-goals: writing to your services, cloud storage of your data, mobile clients, multiple users, email and calendar (later phases).

## Requirements

- Windows (primary target; the server itself is portable)
- Node.js 26+ — SQLite comes from the built-in `node:sqlite`, so there is no native build step
- A DeepSeek API key
- A Google Cloud OAuth client (Desktop app) for Drive and Calendar
- Gmail with 2-Step Verification, for an app password (mail is read over IMAP)

## Setup

```powershell
git clone git@github.com:bibitupa-b/Local-Dashboard.git
cd Local-Dashboard
npm install
```

For the desktop app, install `release\Local Dashboard Setup <version>.exe`. For running from source, `npm run electron:dev`.

`.env` is optional. It is imported once on first start and stays useful for CLI runs:

| Variable | Purpose |
| --- | --- |
| `PORT` | Local port. Defaults to `4317`. |
| `DEEPSEEK_API_KEY` | Optional fallback; the key can be entered in Settings instead. |
| `VAULT_PATH` | Optional default vault path; add vaults in Settings. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional import for a Google connection. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Optional import for a Gmail connection. |
| `GITHUB_TOKEN` | Optional import for a GitHub connection. |
| `BROWSER_HISTORY_PATH` | Optional import for browser history. |

Google Drive and Calendar are connected from **Settings → Connections**. Use a **Desktop app** OAuth client with the redirect URI `http://127.0.0.1:4317/api/oauth/google/callback` (change the port if you set `PORT`). Set the app's publishing status to **Production** — while it stays in *Testing*, Google expires refresh tokens after 7 days.

## Connections

Everything is configured in **Settings → Connections** and stored in the local database; secrets are encrypted with a key file in `data/`.

- **Obsidian vault** — one or more folders, read-only.
- **Google Drive & Calendar** — Client ID/secret plus one OAuth consent; the token is stored per connection.
- **Gmail (IMAP)** — address and app password.
- **GitHub** — personal access token with the `notifications` scope.
- **Browser history** — Helium/Chrome/Edge auto-detected, or a custom Chromium profile path.
- **DeepSeek API** — key for the daily briefing.

Each group has a **?** hint with the exact steps to obtain access. After the first account is connected, **+ Add account** adds another one of the same service.

## Desktop app

The dashboard ships as an Electron app: the same Fastify server runs inside the desktop process, the window points at the local port, and the tray keeps it one click away.

```powershell
npm run electron:dev   # build UI + server bundle, open the desktop window
npm run dist           # Windows installer and portable exe in release/
```

In the packaged app:

- data lives in `%APPDATA%\Local Dashboard\data` (database, logs, backups);
- closing the window keeps the app in the tray; **Quit** in the tray menu, `Ctrl+Q`, or the Settings button stops the server and frees the port;
- **Start with Windows** is enabled on first launch and can be toggled from the tray;
- if the port is already served by another copy or a dev server, the window attaches to it instead of failing.

## Running without the desktop shell

```powershell
npm run dev    # server + Vite with hot reload
npm run build  # production build
npm start      # single process serving the built UI
```

Open http://localhost:4317.

The server writes its SQLite database and logs to `data/`, which is gitignored. A copy of the database is taken daily into `data/backups/`, keeping the last seven days. Logs go to `data/server.log` (rotated at 5 MB).

## Security

- The server binds to `127.0.0.1` only, rejects foreign `Host` headers and cross-origin write requests, and sends CSP, `nosniff`, `X-Frame-Options` and `Referrer-Policy` headers.
- Connection secrets are encrypted with AES-256-GCM using `data/secret.key`. The key stays on the machine; without it the encrypted values cannot be recovered. Backups copy the database but not the key — keep a copy of `secret.key` if you plan to restore elsewhere.
- The app is read-only toward services: it never writes notes, mail, calendar or Drive.
- The build is not code-signed, so Windows SmartScreen may warn on first launch.


## How the briefing works

1. The scheduler (default 08:00) or the **Briefing now** button assembles a digest for the period since the previous briefing (or the last 24 hours on first run): notes changed with line counts, completed and new tasks, projects still `Undone`, Inbox backlog size, Drive changes, today's calendar and unread mail.
2. The digest is sent to DeepSeek (`deepseek-chat`, OpenAI-compatible API). For mail it contains subjects, senders and the first ~200 characters of unread messages — never full bodies or attachments.
3. The reply is stored in SQLite and rendered as a card; previous briefings stay available.
4. If the machine was off at the scheduled time, a briefing is generated on next start when today's is missing.

Your vault is never uploaded. Only the digest leaves the machine, so folder or note exclusions can be applied at digest time if needed.

## Stack

Node 26 · Fastify · `node:sqlite` · React + Vite + plain CSS · `chokidar` (vault watch) · `googleapis` (Drive, Calendar) · `imapflow` + `mailparser` (Gmail) · `node-cron`

## Roadmap

1. ~~Vault sync, history, attention queue, DeepSeek briefing, autostart~~
2. ~~Gmail and Google Calendar as additional sources~~
3. Tray icon, native notifications, search across history
4. Optional Tauri shell if a browser tab stops being convenient

## License

MIT — see [LICENSE](LICENSE).
