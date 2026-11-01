# AGENTS.md

Guidance for agents and contributors working on Local Dashboard.

## Purpose

One screen that answers two questions about the user's own working context: **what happened lately** and **what needs attention now**. A daily briefing from DeepSeek ties the two together. Read-only, local, single user.

## Architecture

One Node process:

- **API** — Fastify, served on `127.0.0.1:4317` (configurable via `PORT`).
- **Desktop shell** — Electron (`electron/main.cjs`) starts `startServer()` from `src/server/server.ts`, opens a window on the local port and owns the tray, native notifications and Windows autostart. `dist/server/server.cjs` is the bundled server.
- **Connections** — `connections` table rows are the source of truth; `registry.ts` builds one source per connection (Google yields Drive and Calendar). Secrets are encrypted with AES-256-GCM using `data/secret.key`. `.env` is imported once via `importConnectionsFromEnv`.
- **UI** — React + Vite with plain CSS, built to static assets and served by the same process. In dev, Vite proxies to the API.
- **Storage** — SQLite through the built-in `node:sqlite`. No ORM, no native dependencies.
- **Vault source** — `chokidar` watches `<VAULT_PATH>`, hashes changed notes, stores a snapshot plus a line diff.
- **Drive source** — `googleapis` polls `files.list` with `modifiedTime` ordering and a stored cursor; read-only scope.
- **Mail source** — `imapflow` + `mailparser` over Gmail IMAP: all folders except All Mail, incremental by UID, bodies kept for 90 days, attachments by name only.
- **Calendar source** — `googleapis` Calendar API, primary calendar, window of −1 to +7 days.
- **Scheduler** — `node-cron`, daily briefing at 08:00 with catch-up on start and retry every 15 minutes until today's briefing exists.
- **Briefing** — POST to `https://api.deepseek.com/chat/completions`, model `deepseek-chat`.

### Planned layout

```
src/
  server/
    index.ts            entry: config, Fastify, scheduler, watcher
    db/schema.ts        DDL as a TS module (bundles cleanly)
    db/index.ts         open DB, typed query helpers
    sources/vault.ts    scan, watch, diff, task extraction
    sources/drive.ts    OAuth, sync, change detection
    sources/mail.ts     IMAP sync, mail digest
    sources/mail-imap.ts imapflow adapter
    sources/calendar.ts Calendar sync, today's events
    google.ts           shared OAuth client, scopes, token store
    briefing.ts         digest assembly + DeepSeek call
    routes.ts           HTTP API
  web/                  React app
data/                   runtime only: dashboard.db, google-token.json (gitignored)
docs/                   design docs and plans
```

### Commands

```powershell
npm run dev            # API + Vite, hot reload in the browser
npm run build          # typecheck + build UI
npm run build:server   # bundle the server for Electron (dist/server/server.cjs)
npm run electron:dev   # build everything and open the desktop window
npm run dist           # Windows installer + portable exe in release/
npm start              # server only, no desktop shell
npm test               # vitest
```

## Approved decisions

These were agreed with the user; do not re-litigate them without asking.

- Local web app first; a Tauri shell is optional later.
- Desktop shell is Electron: it embeds the existing Node server rather than requiring a system Node install. Packaged data lives in `%APPDATA%\Local Dashboard\data`; `.env` is copied there by the user, never bundled.
- Services are configured as connections (multiple accounts per service allowed) through the settings screen; `.env` is imported once and remains a CLI fallback. DeepSeek stays a single global key.
- Read-only everywhere. Never write to notes, the vault, or Drive.
- Two dashboard halves: **history** (diff-backed activity log) and **attention queue**.
- Sources for phase 1: the Obsidian vault, Google Drive, Gmail (read-only IMAP) and Google Calendar.
- Mail keeps message bodies for 90 days; older messages keep headers and subject only. Attachments are never downloaded, only their names are stored.
- Only a **digest** goes to DeepSeek — never raw vault content, never whole files. For mail the digest may carry subjects, senders and the first ~200 characters of unread messages; bodies and attachments never leave the machine.
- Briefing target: 5–7 bullets covering what moved, what is stuck, one suggestion. Stored in SQLite, previous ones kept.
- Scheduled 08:00 by default; generate on startup if today's briefing is missing.
- Attention queue rules: open tasks grouped by tag (recurring tags such as `#vitamins` collapse into one row with a count), notes with frontmatter `status: Undone` untouched for 14+ days, notes sitting in `Inbox` for 3+ days, unread mail from the last 30 days and the next calendar event.
- Autostart is managed by Electron (`app.setLoginItemSettings`), toggled from the tray.
- Visual language follows `DESIGN.md`: dark only, canonical palette, motion that reports state. Display type is Unbounded, body is Onest (OFL, self-hosted in `src/web/fonts`).

## Data model

| Table | Holds |
| --- | --- |
| `vault_files` | path, content hash, mtime, size |
| `vault_changes` | file path, detected at, lines added/removed, diff, snapshot text |
| `drive_files` | Drive file id, name, mime type, modified time, parents |
| `drive_changes` | file id, kind, detected at |
| `tasks` | note path, task text, tag, done state, first/last seen |
| `briefings` | created at, trigger (auto/manual), markdown, digest metadata |
| `mail_folders` | folder path, UIDVALIDITY, last synced UID, last sync time |
| `mail_messages` | folder, UID, sender, subject, date, seen/starred, snippet, body (90 days), attachment names |
| `calendar_events` | Google event id, calendar, summary, start/end, location, status |
| `connections` | service, label, config JSON, encrypted secret, enabled, last error |
| `settings` | key/value: schedule, exclusions, enabled sources, sync cursors |

Snapshots are affordable: the vault is small (tens of notes). Keep them; they make diffs and "what did I write last week" work without rescanning history.

## Adding a new source

Keep Gmail and Calendar symmetrical with the existing sources. Each source module exposes:

- `id` — stable name used in settings and change rows;
- `configured()` — whether credentials exist, so the UI can show a connect prompt instead of an error;
- `sync(db, now?)` — fetch since the cursor stored in `settings`, write `*_files` and `*_changes`, advance the cursor only on success;
- `lastSync(db)` — ISO timestamp of the last successful sync;
- `digest(db, since)` — the few lines that belong in the briefing.

The scheduler and digest builder iterate over registered sources, so a new source needs no changes to the dashboard shell.

## Roadmap

Core mechanics (done): sync health and logging, mail filters and reply detection, calendar free windows, notifications, search, diffs, backups.

Desktop (done in 0.5.0): Electron shell with tray, native notifications, Windows autostart, NSIS installer and portable build; server bundled with esbuild.

### v0.4.0 — New signals
- Browser history: read a copy of the Chromium History DB (Chrome, then Edge), store domain/title/visited time, skip excluded domains. Digest gets aggregates only, never page URLs.
- GitHub: `GITHUB_TOKEN` (scope `notifications`), unread notifications and review requests in the attention queue and digest.
- Google Docs content: export text for Google-native files (cap 20 KB), searchable, named in the digest.

### v0.5.0 — Briefing as a habit
- Weekly review on Sunday 18:00, `weekly` briefing kind comparing seven days.
- Optional writing of the briefing into the vault (explicit toggle; the only write path in the app).
- Briefing feedback (`useful` / `miss`) with evidence links per bullet.

### v0.6.0 — Mail and calendar depth
- IMAP IDLE with reconnect instead of 15-minute polling; notify on important mail.
- Thread grouping by normalized subject and participants.
- Meeting prep 30 minutes before an event: related mail and notes (needs attendees stored).

### v0.7.0 — Surface and speed
- Tray icon with briefing and sync status (riskiest: third-party tray package without Tauri).
- FTS5 search with source and date filters.
- Dark theme and keyboard shortcuts (`/` search, `b` briefing).

Each item: test → code → green run → commit; release bumps the version, tags and pushes. New sources follow the `configured / sync / digest` contract. Browser and mail send only aggregates and headers to DeepSeek — never URLs or message bodies.


## Rules

- **Secrets** live only in `.env` and `data/` (connection secrets encrypted with `data/secret.key`). Both are gitignored; never log tokens, never commit `data/`, `dist/`, or `node_modules/`.
- **Local-only surface.** The server binds `127.0.0.1`, rejects foreign `Host` headers and cross-origin writes, and sets CSP and security headers. Keep those hooks when adding routes.
- **No raw vault content to the API.** Budget roughly a few thousand tokens per briefing; truncate long notes to a couple of sentences.
- **Windows is the primary target.** Use `path.join`, handle non-ASCII paths (the vault uses Cyrillic and emoji folder names), read and write UTF-8.
- **Minimal dependencies.** Standard library and existing packages first; no ORM, no state manager, no UI framework — the interface is plain React and one CSS file.
- **Tests for the logic that can silently break:** task extraction, diffing, digest assembly, change detection. Vitest, colocated as `*.test.ts`.
- **Keep the main screen quiet.** Three blocks only: briefing, activity feed, attention queue. Configuration lives on a separate settings route.
- **Get a full design document before large new phases.** Phase-1 decisions live in this file; deeper design docs go to `docs/`.
