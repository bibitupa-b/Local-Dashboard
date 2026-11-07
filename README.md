# Local Dashboard

**One quiet screen: where to start today, what happened, and one briefing.**

Local Dashboard reads your notes, mail, calendar, Drive, GitHub, Teams chats and browser history,
then reduces them to a single **Start here** number, today's calendar and a short daily briefing
written by DeepSeek. Everything runs on your own machine. Only a compact digest leaves it when a
briefing is generated — and the briefing itself, only if you turn on delivery.

![Dashboard](docs/screenshots/current/dashboard.jpeg)

`Windows` · `Local-first` · `Read-only` · `Single user` · `MIT` · `v1.17.0`

## What's new in 1.17.0

- **Mail that arrives now** — opt-in IMAP IDLE on a Gmail connection watches `INBOX` and syncs as
  soon as mail lands. New mail and reply items already counted by the attention rules raise one
  native notification each; a message never notifies twice. A dropped connection reconnects with
  backoff (1 s doubling to 5 minutes), syncs are serialized, and the existing polling still runs as
  a fallback.
- **Delivery is opt-in** — SMTP and Telegram connections can send the saved briefing right after it
  is generated. Both are off until you enable them, each channel fails independently, and a delivery
  error never blocks the briefing from being saved.
- **The delivery warning is explicit** — the Delivery group says the briefing leaves this machine and
  carries the same subjects and snippets as the digest. **Local only** blocks delivery and IDLE along
  with every other outbound request.

## What's new in 1.16.0

- **One Microsoft 365 connection** — Outlook Calendar and Teams chats from a single Azure app
  registration. Outlook events join the normal calendar source and free windows; Teams mentions from
  the last 24 hours become a `Teams: N mentions` line in the briefing and in "Start here".
- **Chats only, never channel messages** — personal and group chats are read; channels are not
  requested. Message bodies are never fetched (`$select`); only chat names, senders, timestamps and
  mention flags are stored, and message text is never stored, logged or sent.
- **No admin consent for chats** — the delegated `Chat.Read` scope is granted by the user at first
  sign-in; if the tenant blocks user consent, an admin approves the four delegated scopes once.
  Microsoft tokens refresh automatically and stay encrypted like every other secret.

## What's new in 1.15.0

- **Everything is optional** — the app starts without a vault, a connection or a DeepSeek key. A
  fresh install opens on a quiet dashboard with a dismissible note; the briefing uses local rules
  until you add a key.
- **Local only** — one toggle in Settings, also in the topbar, blocks every outbound request,
  including DeepSeek, weather, RSS, Slack, CalDAV, Gmail, GitHub and Google. Vault and browser
  history keep syncing.
- **Apple and generic CalDAV** — read-only calendar events from iCloud or any CalDAV server, beside
  the Google calendar. Credentials stay encrypted and events reuse the normal calendar source.

## What's new in 1.14.0

- **Slack** — mentions and DMs from the last 24 hours become a `Slack: N mentions` attention item.
  Only channel names and counts reach the briefing; message text stays local.

## What's new in 1.13.0

- **Weather** — today's range, conditions and rain chance from Open-Meteo, with no API key.
- **RSS / News** — a few headlines from your feeds, with titles and short summaries.
- **Google Tasks** — due tasks join the briefing and "Start here" when the Google token has the
  `tasks.readonly` scope.

## What's new in 1.12.0

- **Reply triage that survives opening mail** — "awaiting your reply" now includes read messages and
  closes on a sent reply, using `References`/`In-Reply-To` with a subject fallback.
- **Attention is separate from activity** — browser visits and Drive changes no longer hijack
  "Start here"; they live on `/api/activity`.
- **FTS5 search** — Cyrillic is case-insensitive, with `source`/`from`/`to` filters and a `LIKE`
  fallback.
- **Per-point feedback** — each point has its own Useful/Miss; the next briefing sees the signal.
- **More calendar control** — multiple Google calendars per connection and configurable work hours
  for free windows.
- **Local data controls** — export a secret-free snapshot, delete indexed data, and set retention
  for mail bodies, browser visits and vault diffs.
- **Meeting prep** — a 30-minute heads-up, separate from the 15-minute "starting soon" alert.
- **Honest labels** — rules briefings say `rules`; a failed strict-grounding check says `unverified`.

## What it does

- **Start here** — one number and one sentence chosen from the actionable rules: mail awaiting your
  reply, unread mail, open tasks, GitHub review requests, Inbox backlog, stale projects or the next
  event. The backlog stays in your services; the dashboard never becomes a second inbox.
- **Source rail** — every connected service as a vertical rail, which is also the sync progress. Click
  a station to open that service; its tooltip says when it last synced or what failed.
- **Today** — the day's calendar events, free windows and conflicts beside the focus panel.
- **Activity** — browser visits and Drive changes are separate context (`/api/activity`), so a quiet
  day does not answer "Start here" with a visit count.
- **Daily briefing** — 2–5 points covering today's calendar, what moved in the notes, the week's
  trend and one suggestion for today. Runs at 08:00, on demand, or on the first start after a missed
  day. Each point cites its digest line, and a strict check drops what the digest cannot support.
  Without a DeepSeek key the fallback is a plain rules list, labelled `rules` rather than AI. A
  failed grounding check is labelled `unverified`. Each point can be marked Useful or Miss on its
  own, not only the whole briefing.
- **Search** — one command field over note text, mail, Drive file names and Google Docs content.
  FTS5 with the `unicode61` tokenizer keeps Cyrillic case-insensitive; source/date filters are in
  the API, suggestions stay in place and results open in a glass overlay.
- **Mail** — read-only Gmail over IMAP: senders, subjects and the last 90 days of message text.
  Attachments are indexed by name only and never downloaded.
- **Browser history** — Chrome, Edge or Helium history; full URLs stay local and only aggregate
  domain counts reach the briefing.
- **GitHub** — unread notifications and review requests.
- **Desktop shell** — a frameless Electron window on a slow aurora, with a custom title bar, tray,
  native notifications, optional autostart and remembered size and position.
- **Wallpapers** — 27 images ship with the app; pick one under **Settings → Appearance → App
  background** and it sits behind the glass. Aurora remains the default.
- **Settings** — connections with a hint per service, multiple Google calendars, work hours,
  meeting-prep and retention controls. Preferences save as you edit; each field shows its own
  `Saving…` / `Saved 09:14` receipt, and a failed write keeps your text with `Retry`.
  **Application** can export a secret-free JSON snapshot or delete indexed data.

## Install

### Windows installer (recommended)

1. Download the latest `Local-Dashboard-Setup-<version>.exe` from
   [Releases](https://github.com/bibitupa-b/Local-Dashboard/releases/latest).
2. Run it. The build is not code-signed, so SmartScreen may ask you to confirm the publisher.
3. Start the app. Nothing is required: connect a source when you want one, and add a DeepSeek key
   only if you want the written briefing instead of local rules.

The packaged app needs no Node.js installation. Data lives in
`%APPDATA%\Local Dashboard\data`.

### From source

```powershell
git clone git@github.com:bibitupa-b/Local-Dashboard.git
cd Local-Dashboard
npm install
npm run electron:dev   # desktop window
# or
npm run dev            # server + Vite at http://localhost:4317
```

Source builds need **Node.js 26+**; SQLite comes from `node:sqlite`, so there is no native build
step. `npm run dist` produces a Windows installer and portable exe in `release/`.

## Connect your sources

Everything is configured in **Settings → Connections**. Each service has a `?` hint with exact
steps. Multiple accounts per service are supported.

Every row is optional. The dashboard runs with none of them connected; add only what you want, and
remove them again without losing anything else.

| Source | What you get | What it needs |
| --- | --- | --- |
| Obsidian vault | Open tasks, stale projects, Inbox backlog (feeds Start here) | One or more vault folders |
| Google Drive, Calendar & Tasks | Drive changes, Docs text, events, due tasks | OAuth **Desktop app** client, published to Production; enable Drive, Calendar and Tasks APIs |
| CalDAV (Apple / other) | Calendar events, today and free windows | iCloud app-specific password, or any CalDAV URL with username and password |
| Microsoft 365 | Outlook Calendar events and Teams chat mentions | Azure app registration; Client ID, optional client secret, delegated scopes |
| Gmail | Unread mail, awaiting reply, search | Gmail address + app password (2-Step Verification) |
| IMAP IDLE | A sync and a notification as new mail arrives | A Gmail connection with **Watch for new mail (IMAP IDLE)** checked; off by default |
| Delivery (SMTP / Telegram) | Emails or messages the saved briefing | SMTP host, port and password, or a Telegram bot token and chat id; off until enabled |
| GitHub | Notifications and review requests | Personal access token with `notifications` |
| Slack | Mentions and DMs from the last 24 hours | User/bot token with read history scopes |
| Weather | Today's range, conditions and rain chance | Latitude + longitude; Open-Meteo needs no key |
| RSS / News | A few headlines for the briefing | One or more RSS/Atom URLs |
| Browser history | Domain aggregates | Auto-detected Chrome, Edge or Helium |
| DeepSeek | Daily briefing | API key from platform.deepseek.com |

For Google, add the redirect URI
`http://127.0.0.1:4317/api/oauth/google/callback` (change the port if you set `PORT`). Keep the
OAuth app in **Production**; while it stays in Testing, Google expires refresh tokens after seven
days.

For Microsoft 365, create an **Azure app registration** and add the redirect URI
`http://127.0.0.1:4317/api/oauth/microsoft/callback`. Under **API permissions**, add the delegated
scopes `offline_access User.Read Calendars.Read Chat.Read`; no admin consent is needed for chats,
because channels are not requested (if the tenant blocks user consent, an admin approves the four
scopes once). Paste the Client ID (a client secret is optional), keep the tenant at `common`, save,
then press **Connect**. Outlook Calendar works with personal and work accounts; Teams chats need a
work or school account. Outlook mail is not requested, so Gmail or another IMAP account still covers
mail.

**IMAP IDLE** is a checkbox on the Gmail connection, off by default. It opens one extra read-only
connection to `imap.gmail.com`, watches `INBOX` only, and runs the normal mail sync when a message
arrives. New mail and reply items that the attention rules already counted become a native
notification, once per message; the rest of the mail folders keep their 15-minute polling. If Gmail
drops the IDLE connection, the watcher reconnects after 1 s, 2 s, 4 s and so on, capped at five
minutes.

**Delivery** is a separate group in Settings → Connections, off by default. An SMTP connection needs
host, port, from and to plus a username and password; a Telegram connection needs a bot token from
@BotFather and the chat id. The briefing is sent only while that connection is enabled, and the
Delivery group repeats the warning: **the briefing leaves this machine and includes the same subjects
and snippets as the digest.** Each channel has a 20-second limit; one failing channel is logged and
does not stop the other or the briefing.

`.env` is optional and imported once on first start. See [`.env.example`](.env.example) for the
available keys: `PORT`, `VAULT_PATH`, `DEEPSEEK_API_KEY`, Google credentials, `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, `GITHUB_TOKEN`, `BROWSER_HISTORY_PATH`.

## The briefing and your privacy

1. The digest contains note paths with line counts and up to 200 characters from the changed part of
   the five most-changed notes, task titles, project names, Drive file names, today's calendar,
   due Google Tasks, weather values, RSS headlines/summaries, Slack mention counts and channel
   names, Teams mention counts and chat names, unread mail subjects/senders and the first ~200
   characters of unread mail.
2. It is sent to `https://api.deepseek.com` (`deepseek-flash`) only when a briefing is generated.
3. The reply is stored in the local database and shown on the page. Earlier briefings stay available.

**Never sent:** whole vault notes, full mail bodies, attachments, browser URLs, page titles, feed
URLs, Slack or Teams message text, OAuth tokens, passwords, CalDAV credentials. Weather coordinates
go only to Open-Meteo; RSS feeds are fetched directly from the addresses you configure. Browser
history reaches the model as domain counts only. There is no telemetry, no analytics and no cloud
account.

**Delivery is a second, explicit exit.** SMTP and Telegram are off by default, and nothing is sent
until you enable a channel. When enabled, the saved briefing — the same subjects and snippets the
digest already carries — is emailed through your SMTP server or posted to the Telegram Bot API
(`api.telegram.org`). That is the only case where the briefing text itself leaves the machine. A
delivery failure is logged by connection id and never prevents the next briefing or source sync.

**Local only** turns the machine into a closed box: every outbound request is blocked, including
DeepSeek, weather, RSS, Slack, Microsoft 365, CalDAV, Gmail, GitHub, Google, IMAP IDLE and delivery.
Vault and browser history still sync, and the briefing falls back to local rules. CalDAV passwords,
Microsoft tokens, SMTP credentials and Telegram bot tokens are encrypted with AES-256-GCM and are
used only against the servers you configured.

## Screens

| | |
| --- | --- |
| ![Dashboard](docs/screenshots/current/dashboard.jpeg) | ![Welcome](docs/screenshots/current/welcome.jpeg) |
| Focus, source rail, today and the briefing inside the glass stage | First run says what stays local |
| ![Search](docs/screenshots/current/search-suggestions.jpeg) | ![Settings](docs/screenshots/current/settings.jpeg) |
| Search in the command field, grouped suggestions | Connections, preferences and the wallpaper picker |

More screens: [`docs/screenshots/current/index.html`](docs/screenshots/current/index.html).

Release notes: [`docs/releases/1.17.0.md`](docs/releases/1.17.0.md).

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| SmartScreen warns about the publisher | Expected: the build is not code-signed. Choose **More info → Run anyway**. |
| `Port 4317 is already in use` | Another copy or a dev server is running. Quit it, or set `PORT` for a CLI run. |
| Google stops syncing after a week | The OAuth app is still in Testing. Publish it to Production and reconnect. |
| Mail says sign-in failed | Create a new Gmail app password and update the connection. |
| Microsoft 365 authorization failed | Check the Azure redirect URI `http://127.0.0.1:4317/api/oauth/microsoft/callback` and the delegated scopes, then press Connect again. |
| Briefing fails with 402 | The DeepSeek balance is empty. Top up and press **Briefing now**. |
| Closing the window seems to quit | It hides to the tray. Quit from the tray menu, `Ctrl+Q`, or Settings. |
| Something else | Open **Settings → Application** and use **Copy diagnostics**, then check `data/server.log`. |

Backups are taken daily into `data/backups/` and kept for seven days. Backups include the database
but **not** `data/secret.key`; copy that file separately if you want to restore encrypted
connection secrets on another machine.

## Development

```powershell
npm run dev          # Fastify + Vite with hot reload
npm run build        # typecheck and build the UI
npm run build:server # bundle the server for Electron
npm run electron:dev # build everything and open the desktop window
npm run dist         # Windows installer and portable exe
npm test             # vitest
npm start            # single process serving the built UI
```

The app is one Node process: Fastify on `127.0.0.1:4317`, SQLite through `node:sqlite`, sources
registered behind a small `configured / sync / digest` contract, React + Vite + plain CSS for the
interface. The Electron shell starts the same server in-process and owns the tray, notifications
and autostart. See [`AGENTS.md`](AGENTS.md) for the architecture and [`DESIGN.md`](DESIGN.md) for
the visual language.

Keyboard: `/` focuses search, `b` generates a briefing, `Esc` clears results.

## Security

The server binds to localhost, rejects foreign `Host` headers and cross-origin writes, and sets
CSP and security headers. Connection secrets are encrypted with AES-256-GCM using
`data/secret.key`. The app is read-only toward every service. Details:
[`SECURITY.md`](SECURITY.md).

## Non-goals

No cloud sync, no writing to your services, no mobile client, no multi-user accounts, no
telemetry. Dark interface only.

## License and credits

MIT — see [`LICENSE`](LICENSE). Typefaces: [Unbounded](https://fonts.google.com/specimen/Unbounded)
and [Onest](https://fonts.google.com/specimen/Onest), self-hosted under the SIL Open Font License.
