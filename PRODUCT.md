# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Any technical self-hoster: a developer or power user on Windows who keeps notes in an Obsidian
vault and has Gmail, Google Drive and GitHub. They install from the GitHub Releases NSIS installer
(or build from source with Node 26) and connect every source themselves — no one sets the app up
for them. The README, the per-service `?` hints in Settings → Connections and the troubleshooting
table are the only support channel. Single user per machine; no accounts, no roles.

## Product Purpose

One quiet screen that answers two questions — where do I start today, and what happened — plus a
2–5 bullet briefing for today written by DeepSeek, grounded in cited digest lines. The briefing owns the page; a single "start here"
count, the connected services and today's calendar sit above it. Read-only toward every source and
local by default; only a compact digest leaves the machine, and only when a briefing is generated.

Every connection is optional. The app is complete with zero connections and no DeepSeek key: the
dashboard loads, a zero-state card explains what can be added, and the briefing runs on local rules.
Local only mode blocks all outbound network while the vault and browser history keep syncing.

Success, on a normal morning: the user opens it once, reads one number and one briefing, and knows
the machine is in order. No clicking through tabs, and no backlog to scroll. The activity feed and
the attention queue are gone from the screen by the user's own decision (2026-11-03): the backlog
lives in the sources, not in a second inbox.

## Positioning

Attention, not capture. It never becomes another inbox: it reads what the user already has (vault,
Gmail over IMAP, Drive, Calendar, GitHub notifications, browser history) and shows only the delta
with its evidence — real line diffs — and the backlog. One local Node process, SQLite on disk, no
cloud account behind it.

## Operating Context

- Windows desktop first, used at the start of the workday: 08:00 briefing with catch-up on start,
  plus ad hoc glances when something feels unfiled.
- Electron window with tray, native notifications and optional autostart. The Aurora Glass shell is
  frameless with a custom title bar and remembers its size, position and maximized state. 27
  wallpapers can sit behind the glass; Aurora is the default. Closing the window hides to the tray.
  Packaged data lives in `%APPDATA%\Local Dashboard\data`; `.env` is optional and imported once, then
  connections are managed in the settings screen.
- Sources are real, user-owned accounts: an Obsidian vault with non-ASCII folder names, Gmail over
  IMAP with an app password, a self-created Google Cloud OAuth desktop client kept in Production
  (one or more calendars and optional Google Tasks), a GitHub token with `notifications`, a local
  Chrome/Edge/Helium history database, Open-Meteo coordinates, optional RSS/Atom feeds, and an
  optional CalDAV account (iCloud or custom) for Apple Calendar.
- Keyboard: `/` focuses search, `b` generates a briefing, `Esc` clears results.
- Recovery tools the user is expected to use: **Copy diagnostics**, `data/server.log`, daily
  backups in `data/backups/`.

## Capabilities and Constraints

Approved decisions; do not re-litigate without asking.

- Read-only everywhere. Never write to notes, the vault, Drive or mail.
- Single user, local-only surface: binds `127.0.0.1`, rejects foreign `Host` headers and
  cross-origin writes, sets CSP and security headers.
- **Every source is optional, and none is required for a first run.** No vault, connection or
  DeepSeek key; the briefing degrades to local rules. **Local only** is a first-class setting that
  blocks all outbound calls, not a hint.
- Dark interface only.
- Never sent to DeepSeek: vault note bodies, whole files, mail bodies, attachments, browser URLs or
  page titles, tokens, passwords. Mail keeps bodies for 90 days, then headers and subject only;
  attachments are indexed by name and never downloaded.
- **Windows only, permanently.** Path handling, tray, autostart and the NSIS/portable build are part
  of the product, not packaging details. No cross-platform ambition.
- Non-goals: cloud sync, writing to services, mobile client, multi-user accounts, telemetry,
  analytics, a cloud account.
- The app is installable by a non-developer from Releases: no Node.js, no native build step, no
  code signing (SmartScreen warning is expected and documented).
- Briefing budget is roughly a few thousand tokens; long notes truncate to a sentence or two.

Open: browser history is Chromium-based only; Google Docs content is exported to a 20 KB cap; IMAP
IDLE and vault write-back are roadmap items. Weekly review is implemented as a `weekly` briefing
kind; a failed strict-grounding check is surfaced as `unverified`.

## Brand Commitments

- Name: **Local Dashboard** (product name, appId `com.bibitupa.localdashboard`), MIT.
- Visual language is pinned in `DESIGN.md`: **Aurora Glass** - dark only, glass shell, an aurora
  environment, amber/mint/ice/coral semantics, motion that reports state, and an optional wallpaper
  behind the glass. Implemented on 2026-11-05; treat it as binding for refinements.
- Typography: Unbounded for display, Onest for body, both self-hosted in `src/web/fonts` under the
  SIL Open Font License. Cyrillic coverage is required.
- Voice in the interface is plain and factual — statuses, counts, timestamps, no marketing tone.

## Evidence on Hand

- `README.md` — product claims, install paths, source table, privacy section, troubleshooting table.
- `docs/screenshots/current/` - real captures of the dashboard, search, settings and the welcome
  dialog, with `index.html` as the gallery.
- `DESIGN.md` (visual language), `SECURITY.md`, `CHANGELOG.md`, `AGENTS.md`, `LICENSE`.
- `docs/superpowers/plans/` — the build plan and the 0.8.0 redesign plan.
- Public repo `bibitupa-b/Local-Dashboard` with tagged releases.

Absent, and not to be invented: testimonials, user counts, benchmarks, press, pricing, partner or
customer logos, uptime or performance claims.

## Product Principles

1. Sources are the truth. The model sees a digest, never the source.
2. Show the delta and the backlog; never build a second inbox.
3. Keep the main screen quiet: the briefing owns the page, with one start count, the source rail
   and today around it — configuration lives in the same shell on its own route.
4. A self-hoster must be able to diagnose and fix it from the README and the diagnostics alone.
5. Read-only, one machine, one person. Any feature that needs a server in the middle is out of scope.
