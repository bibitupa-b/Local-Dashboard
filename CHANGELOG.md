# Changelog

## 1.5.0

The briefing closes the day as well as opening it, reads a meeting's mail before you walk into it,
and can be questioned. Every point now carries its own evidence, and a missing key leaves a plain
list of what is waiting instead of an empty column.

This is the first published build since 1.2.0; 1.3.0 and 1.4.0 are included and listed below.

- An opt-in evening pass at 18:00 closes the day: what got closed, what carries over, and the first
  action tomorrow. Sunday is skipped, because the weekly review already runs at that hour.
- `Meetings` in the digest: for the next three events within 24 hours, the last mail from one of the
  attendees within 30 days, named by sender and subject. Attendees are stored per event.
- `Ask about this` under the briefing answers one question (up to 200 characters) from the digest
  only; if the digest does not hold the answer, it says so.
- Every point with a source can open `Why` — the exact digest lines it was drawn from, three at
  most, without unrolling the whole digest.
- A point's link counts as an open: earlier briefings name how many times their sources were opened.
- Without a DeepSeek key the briefing is built from the attention queue alone: a headline, up to
  five points and a first action, marked `rules` in its metadata. Provider errors are still shown as
  failures, never replaced by this fallback.
- The weekly review adds `Notes untouched 3+ weeks` and `Tasks open 3+ weeks`, and the prompt asks
  for the stagnation once instead of repeating the counters.
- `Briefing context` now means what matters and what not to show; the prompt is told to leave
  requested things out entirely.
- A resurfaced note waits 30 days before it comes back, even on a quiet week.
- `Browser: N visits today` counts every visit, not only the top three domains.
- Mail, GitHub and browser digest sections name their evidence without restating the counts the
  attention queue already owns.

## 1.4.0

The briefing gets a rhythm, a memory of its reader and a visible price. A failed request no longer
costs a whole day, and the Sunday review answers the question a single day cannot: "am I moving?"

- When DeepSeek answers 429 or 5xx, or the request times out, the briefing retries instead of
  waiting for the next scheduled run. A bad key still fails at once.
- Every briefing records the model, the prompt and completion tokens, and whether the answer was
  cut off by the token limit, so a short briefing can be told apart from a truncated one.
- `What it read` under the briefing opens the exact digest that was sent to DeepSeek, line for
  line, without leaving the page.
- `Briefing context` in Preferences: a few facts about the reader ("I work on graphics tools, don't
  suggest sport"), at most 500 characters, added to the prompt and kept across restarts.
- The prompt now asks for the sender's name when mail is waiting for an answer, not just a count.
- A weekly review is generated on Sunday at 18:00 for the last seven days, compared with the seven
  before it: notes touched, tasks closed, mail arrived and events passed. It sits next to the daily
  briefings in the history and is marked `Week`.

## 1.3.0

The briefing becomes something you can check. Every point can open the note, mail, file or pull
request it came from, and the top line now says what kind of day it was before listing evidence.

- The briefing is stored as a structured body — a headline, numbered points with their sources,
  and one suggestion — instead of a block of text the model invented. DeepSeek is asked for JSON;
  a plain answer still falls back to the old lines rather than an empty column.
- Points carry links: a note opens in Obsidian, a file in Drive, a pull request on GitHub, a
  message in Gmail. Points about an event or browsing stay plain text.
- `Useful` and `Miss` under the briefing record a verdict in the database, so prompt changes can
  be judged instead of guessed.
- The stamp names the trigger and the window: `4 Nov, 08:00 · auto · 24 h`.
- The briefing language is a setting (`Auto / Русский / English`) instead of a guess made from
  the notes' alphabets.
- One note saved five times is one line with the summed diff; each digest section is capped, so a
  busy day no longer crowds out what needs attention.
- Subjects, senders, file names and paths are flattened and cut before they reach the digest: a
  subject cannot open a section of its own or hide behind zero-width characters.
- Today's digest opens with yesterday's headline, so a stuck item is named as still stuck.
- On a quiet day with nothing to report, the digest offers one genuinely old note worth revisiting
  instead of inviting the model to invent five generalities.
- Generating a briefing right after another one no longer posts feedback to a made-up id.

## 1.2.0

- The browser launch overlay is gone: the desktop shell already shows its own splash, so the page
  now appears at once instead of after a 1.5-second emblem animation.
- Earlier briefings read like today's: one list without stray `-` markers, and a closing line that
  keeps its `Suggestion` label whichever way the model formatted it.
- Pointer tilt is gone from the dashboard and the settings cards: surfaces stay still under the
  pointer, and the reading tick is the only motion while reading.
- The warm accent now carries attention: the start figure, `TODAY`, the briefing ticks and a
  missing-briefing stamp are Sand (the tick brightens at the line under the eye), and `GET STARTED`
  is Sage.
- A held `b` no longer starts a second paid briefing request while one is already running.
- Every service station is named for a screen reader — service, account count, last sync or the
  cause of the error, and where the link goes; the browser station, which has no destination, is
  read as a named row rather than an unlabeled one.
- When the local server dies mid-session the banner says so and offers `Try again`, instead of
  printing the browser's `Failed to fetch`.
- Search results keep the query's own case, and a wrapped path keeps its source dot on the first
  line.
- Preferences save as you edit: the `Save preferences` button is gone. Each field shows its own
  `Saving…` / `Saved 09:14` receipt, the card head counts what is unsaved, and a failed write keeps
  your text with a `Retry` link instead of discarding it.
- A hidden window no longer polls the server; status is fetched every three seconds only while a
  sync is running, and nothing at all at rest.
- One failing endpoint no longer blanks the page: the rest of the dashboard renders and the banner
  names what is missing, with `Try again`.

## 1.1.0

The dashboard becomes one page: the briefing owns it, with a single **Start here** count, the
connected services as one line that doubles as sync progress, today's calendar and search.
The activity feed, the attention queue and the inline diff left the screen by the user's decision
on 2026-11-03; `/api/attention` and `/api/feed` remain as data sources.

- **Start here** picks one pile by a fixed priority and shows its count, sentence and source link.
- **Services line** shows each service as a station on a rail; the fill is sync progress and the
  tooltip carries the last sync time or the error.
- **Briefing** is a 64ch reading column with a Sand reading tick that follows the line under the
  eye; the closing suggestion keeps its label and warm rule.
- First paint is gated on the first payload, so no empty state flashes before data arrives.
- Setup checklist uses drawn dots; user content is no longer uppercased by a global label rule.
- Lighthouse accessibility 1.0 (was 0.92); axe failures removed.
- README, screenshots, DESIGN.md, PRODUCT.md and AGENTS.md updated to the one-page model.

## 1.0.3

- Needs attention: tasks from one note collapse into a row with a count, and the list shows five
  rows with **Show all** / **Show less**.
- Briefing bullets render as a spaced list; a closing suggestion gets a `Suggestion` label and a
  Sand rule instead of being buried in the last line.
- Search is a proper combobox (`aria-activedescendant`, labelled input) and its panel is capped at
  560px, no longer covering the primary action.
- Activity reveals 50 rows per click instead of the whole backlog, and can collapse again.
- Today no longer shows free windows when Calendar is not connected.
- One ambient loop removed: the brand mark no longer breathes; the orbit and briefing glow remain.
- DESIGN.md now matches the shipped fonts, Today state, card tilt and two-loop motion budget.
- Search says when a query is shorter than two characters; hint tooltips stay inside the viewport.

## 1.0.2

- Attention links use the palette (Porcelain, Sage on hover) instead of the browser-default blue.
- Calendar event times use the same 24-hour clock as the rest of the screen.
- `npm run dev` works again: the Vite proxy forwards `/api/` only, so `/api.ts` loads as a module.
- The dashboard content sits in a `main` landmark for screen readers.

## 1.0.1

- Tilt-shift now applies to cards and the Today strip only. Buttons, links, fields, pills and
  connection action rows keep a plain hover state and never move the page.
- Tilt starts only after the pointer rests for 150 ms, so quick passes across the window do nothing.
- Removed the `backdrop-filter` layer that produced a vertical band inside the briefing card and
  blurred card content; one subtle pointer sheen remains.

## 1.0.0

First stable release. The daily loop — history, attention, briefing — plus the desktop shell is
now usable without reading the source: a first-run welcome, a setup checklist, clickable attention
rows, errors that say what to do next, and a product README.

- First-run welcome explains what stays local and what is sent to DeepSeek.
- **Get started** checklist on the dashboard until a vault, a key and a first briefing exist.
- Settings → Application: data folder path, Open data folder, Copy diagnostics, Check for updates.
- Empty briefing states point at the missing step instead of a generic message.
- README rewritten as a product page: install first, source table, privacy, troubleshooting.
- All 0.9.5 fixes are included: linked attention items, search snippets around the match,
  human-readable errors, en-GB dates, always-visible Today strip, 90-day browser retention.

## 0.9.5

- Search shows the matching line instead of the first characters of the note.
- Attention items link to the note, mail, GitHub item or Drive file they describe.
- Source and briefing errors are translated into a next step (balance, reconnect, app password, network) instead of raw provider codes.
- Failed Sync, Search, Test and diff requests now report an error instead of hanging or failing silently.
- Dates and times always use `en-GB`, so the English interface no longer mixes in the system locale.
- The Today strip is always visible: “No events today” or “Calendar not connected”.
- Browsing history is pruned after 90 days.
- At least one briefing source stays enabled.
- Fixed a corrupted console message and a malformed function in the desktop shell.
- Keyboard: `/` focuses search, `b` generates a briefing, `Esc` clears search results.

## 0.9.4

- Quit no longer waits for the first sync: scheduler, watcher and server stop immediately, with a 3-second hard exit fallback. The port is released right away.
- Tray: brighter dedicated icon, `Quit Local Dashboard` menu item, status tooltip (`syncing`, `ready`, `sync error`, `offline`) and a one-time “still running in the tray” notification when the window is closed.
- Quit routes: tray menu, `Ctrl+Q`, and a `Quit application` button in Settings (Electron only, via a context-isolated preload bridge).

## 0.9.3

- App icon now has a dark glass tile for the taskbar/dock and installer, while the in-app header and splash keep the transparent emblem.
- Header emblem animates continuously: breathing tilt plus an orbiting dot ring.
- Sets an explicit AppUserModelID so Windows groups the window under the app icon.

## 0.9.2

- Mouse glow is livelier: sage plus warm halo, smoothed pointer following, and a hard reset when the pointer leaves the window (fixes the centre flash).
- Search suggestions now paint above cards; `index.html` is served with `no-store` so stale bundles cannot linger.
- Sync completion animates: sage bar and glow on success, clay on failure, then fades.
- Dashboard ↔ Settings uses the View Transitions API with a short fade and rise.
- Briefing lines appear in a staggered cascade and do not replay on the 60-second refresh.
- App icon has a transparent background; the Glassy Orbit mark now sits in the header with a slow breathing animation and the same art is used by the splash and installer.

## 0.9.1

- Tilt-shift is stronger and applies to links, inputs, summaries, chips, rows and cards: up to 4°, specular sheen, 3.5 px edge blur and lift shadow.
- Launch animation: frameless Electron splash with the Glassy Orbit emblem, orbit ring and progress sweep; browser builds get an in-app boot overlay.
- Window waits for first paint before showing, so there is no black flash; the title no longer wraps on wide screens.

## 0.9.0

- Typography: Unbounded for display headings, Onest for body; both OFL, self-hosted under `src/web/fonts`.
- New Glassy Orbit application icon (PNG + multi-size ICO) for window, tray and installer.
- Global tilt-shift hover replaces the previous glitch and click fade: pointer tilt plus blurred top and bottom bands; disabled for reduced motion.
- Headings reveal with a short blur-and-tracking entrance.

## 0.8.4

- Comfort pass: larger body (16 px), titles, buttons, pills, inputs and dialog labels.
- Connection checkboxes stay inline in Preferences.
- Screenshot set refreshed and moved to `docs/screenshots/0.8/`.

## 0.8.3

- Disabled buttons no longer play hover or press animations.

## 0.8.2

- Added/removed line counts are colored: additions sage, removals clay.
- Buttons: brief chromatic glitch on hover, radial fade-out on press (ease-out), disabled under reduced motion.
- Sync bar gains a shimmer sweep while active; clicking a link row adds a soft sage glow; search focus glows.

## 0.8.1

- Activity feed shows six rows per day with a “Show N more” control instead of the full history.
- Screenshot set published in `docs/screenshots/0.8/` with an HTML contact sheet.

## 0.8.0

Global redesign.

- Dark-only interface from `DESIGN.md`: canonical palette, mono metadata, flat cards, six source colors.
- Restrained motion: press/hover/reveal timings, sync breathing, skeleton loading, one-time briefing glow, animated diff and dialogs; loops pause when hidden; full reduced-motion support.
- New confirm dialog replaces `window.confirm`; connection modal traps focus and returns it.
- Accessible hints with `aria-describedby`, Escape and blur handling.
- Briefing skeletons while generating; search suggestions animated with keyboard-active state.
- Electron window background matches the palette; no light flash on launch.

## 0.7.0

Security and release preparation.

- Reject foreign `Host` headers and cross-origin write requests (`Origin` guard) to stop CSRF and DNS rebinding against the local API.
- Send CSP, `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy` headers.
- Electron blocks in-app navigation and opens external links through the system browser (http, https, obsidian, mailto only).
- `npm audit` is clean: `glob` and `minimatch` pinned to patched versions via overrides.
- Removed the obsolete `.vbs` autostart script and old installers; logs, backups and temp copies documented.
- README, SECURITY and package metadata prepared for 1.0.

## 0.6.4

- The desktop app reuses a dashboard already running on the port instead of quitting silently; other startup failures show a dialog.

## 0.6.3

- Services without connections show a Connect button.

## 0.6.2

- Localized Gmail folders no longer leave duplicate rows after normalization.

## 0.6.1

- DeepSeek API key can be added in Settings and overrides `.env`.
- Gmail special folders (Important, Sent, Drafts, Spam, Trash) are mapped by special-use, so Russian labels work.
- Empty secret fields no longer overwrite saved values; IMAP test has a timeout; disconnect asks for confirmation.

## 0.6.0

- Universal connections: multiple accounts per service, encrypted secrets, settings rework with hints, per-connection OAuth and data.

## 0.5.0

- Electron desktop app with tray, native notifications, autostart, installer and portable build.

## 0.4.x

- Browser history, GitHub, Google Docs content, interactive search, per-source sync progress, deep links.

## 0.1.0 - 0.3.0

- Vault indexing and diffs, Drive sync, daily DeepSeek briefing, Gmail IMAP, Google Calendar, attention queue, notifications, search, backups and sync health.
