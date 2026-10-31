# Local Dashboard

A single-user dashboard that runs on your own machine and shows one quiet screen: what changed in your notes and cloud drive, what is waiting for your attention, and a short daily briefing written by DeepSeek.

Everything stays local. The only outbound request is the digest sent to the DeepSeek API when a briefing is generated.

> Status: early development. The design is settled; application code is not in the repository yet. Commands below describe the intended interface.

## What it does

- **Activity history** — detects edits to a local Obsidian vault and changes in Google Drive, keeps a diff-backed log.
- **Attention queue** — open tasks from notes (grouped by tag), projects marked `status: Undone` that have gone stale, notes left in the Inbox, and freshly changed Drive files.
- **Daily briefing** — DeepSeek receives a compact digest (not your vault) and returns 5–7 bullets: what moved, what is stuck, one suggestion for today. Runs on a schedule and on demand.

Explicit non-goals: writing to your services, cloud storage of your data, mobile clients, multiple users, email and calendar (later phases).

## Requirements

- Windows (primary target; the server itself is portable)
- Node.js 26+ — SQLite comes from the built-in `node:sqlite`, so there is no native build step
- A DeepSeek API key
- A Google Cloud OAuth client (Desktop app) for Drive

## Setup

```powershell
git clone git@github.com:bibitupa-b/Local-Dashboard.git
cd Local-Dashboard
npm install
Copy-Item .env.example .env
```

Fill in `.env`:

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | Key from platform.deepseek.com. Without it the briefing card shows setup instructions; the rest of the dashboard works. |
| `GOOGLE_CLIENT_ID` | From your Google Cloud OAuth client. |
| `GOOGLE_CLIENT_SECRET` | Same client. |
| `VAULT_PATH` | Path to the vault. Defaults to `%USERPROFILE%\Documents\Main Obsidian Vault`. |
| `PORT` | Local port. Defaults to `4317`. |

Google Drive is connected once from the settings page: the app opens the consent screen and stores the refresh token in `data/google-token.json` (gitignored).

Use a **Desktop app** OAuth client with the redirect URI `http://127.0.0.1:4317/oauth2callback`. Set the app's publishing status to **Production** — while it stays in *Testing*, Google expires refresh tokens after 7 days and you would have to sign in again every week.

## Running

```powershell
npm run dev    # server + Vite with hot reload
npm run build  # production build
npm start      # single process serving the built UI
```

Open http://localhost:4317.

### Start with Windows

`scripts/start-hidden.vbs` starts the server without a console window. Create a shortcut to it and put the shortcut in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` (`Win+R` → `shell:startup`). Then bookmark http://localhost:4317.

The server writes its SQLite database and the Google token to `data/`, which is gitignored.

## How the briefing works

1. The scheduler (default 08:00) or the **Briefing now** button assembles a digest: notes changed in the last 24 hours with line counts, completed and new tasks, projects still `Undone`, Inbox backlog size, Drive changes.
2. The digest is sent to DeepSeek (`deepseek-chat`, OpenAI-compatible API).
3. The reply is stored in SQLite and rendered as a card; previous briefings stay available.
4. If the machine was off at the scheduled time, a briefing is generated on next start when today's is missing.

Your vault is never uploaded. Only the digest leaves the machine, so folder or note exclusions can be applied at digest time if needed.

## Stack

Node 26 · Fastify · `node:sqlite` · React + Vite + plain CSS · `chokidar` (vault watch) · `googleapis` (Drive) · `node-cron`

## Roadmap

1. Vault sync, history, attention queue, DeepSeek briefing, autostart
2. Gmail and Google Calendar as additional sources
3. Tray icon, native notifications, search across history
4. Optional Tauri shell if a browser tab stops being convenient

## License

MIT — see [LICENSE](LICENSE).
