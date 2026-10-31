# AGENTS.md

Guidance for agents and contributors working on Local Dashboard.

## Purpose

One screen that answers two questions about the user's own working context: **what happened lately** and **what needs attention now**. A daily briefing from DeepSeek ties the two together. Read-only, local, single user.

## Architecture

One Node process:

- **API** — Fastify, served on `127.0.0.1:4317` (configurable via `PORT`).
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
    db/schema.sql       tables + migrations
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
npm run dev      # API + Vite, hot reload
npm run build    # typecheck + build UI
npm start        # production
npm test         # vitest
```

## Approved decisions

These were agreed with the user; do not re-litigate them without asking.

- Local web app first; a Tauri shell is optional later.
- Read-only everywhere. Never write to notes, the vault, or Drive.
- Two dashboard halves: **history** (diff-backed activity log) and **attention queue**.
- Sources for phase 1: the Obsidian vault, Google Drive, Gmail (read-only IMAP) and Google Calendar.
- Mail keeps message bodies for 90 days; older messages keep headers and subject only. Attachments are never downloaded, only their names are stored.
- Only a **digest** goes to DeepSeek — never raw vault content, never whole files. For mail the digest may carry subjects, senders and the first ~200 characters of unread messages; bodies and attachments never leave the machine.
- Briefing target: 5–7 bullets covering what moved, what is stuck, one suggestion. Stored in SQLite, previous ones kept.
- Scheduled 08:00 by default; generate on startup if today's briefing is missing.
- Attention queue rules: open tasks grouped by tag (recurring tags such as `#vitamins` collapse into one row with a count), notes with frontmatter `status: Undone` untouched for 14+ days, notes sitting in `Inbox` for 3+ days, unread mail from the last 30 days and the next calendar event.
- Autostart via a `.vbs` shortcut in `shell:startup` that runs the server hidden.

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
| `settings` | key/value: vault path, schedule, exclusions, last sync cursors |

Snapshots are affordable: the vault is small (tens of notes). Keep them; they make diffs and "what did I write last week" work without rescanning history.

## Adding a new source

Keep Gmail and Calendar symmetrical with the existing sources. Each source module exposes:

- `id` — stable name used in settings and change rows;
- `configured()` — whether credentials exist, so the UI can show a connect prompt instead of an error;
- `sync(db, now?)` — fetch since the cursor stored in `settings`, write `*_files` and `*_changes`, advance the cursor only on success;
- `lastSync(db)` — ISO timestamp of the last successful sync;
- `digest(db, since)` — the few lines that belong in the briefing.

The scheduler and digest builder iterate over registered sources, so a new source needs no changes to the dashboard shell.

## Rules

- **Secrets** live only in `.env` and `data/`. Both are gitignored; never log tokens, never commit `data/`, `dist/`, or `node_modules/`.
- **No raw vault content to the API.** Budget roughly a few thousand tokens per briefing; truncate long notes to a couple of sentences.
- **Windows is the primary target.** Use `path.join`, handle non-ASCII paths (the vault uses Cyrillic and emoji folder names), read and write UTF-8.
- **Minimal dependencies.** Standard library and existing packages first; no ORM, no state manager, no UI framework — the interface is plain React and one CSS file.
- **Tests for the logic that can silently break:** task extraction, diffing, digest assembly, change detection. Vitest, colocated as `*.test.ts`.
- **Keep the main screen quiet.** Three blocks only: briefing, activity feed, attention queue. Configuration lives on a separate settings route.
- **Get a full design document before large new phases.** Phase-1 decisions live in this file; deeper design docs go to `docs/`.
