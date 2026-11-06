# Changelog

## 1.12.0

The first pass over the gap-closure plan: reply triage, honest source visibility, and a quieter
start line.

- **Reading a message no longer closes the loop** — "awaiting your reply" now includes read mail and
  only a sent reply (matched by thread references, with a subject fallback) removes it.
- **Thread keys are stored** — `mail_messages` keeps `in_reply_to`, `references_json` and a
  normalized `thread_key`; old rows migrate in place.
- **Source toggles now mean something** — `/api/attention`, the briefing and search all use one
  visibility filter, so disabling mail, vault, Drive, calendar, browser or GitHub removes its items.
- **Attention and activity are separate** — browser visits and Drive changes moved to
  `/api/activity`; they no longer become "Start here" on a quiet day.
- **Daily catch-up ignores weekly/evening briefings** — `maybeBrief` looks at `kind = 'daily'`, and
  `status.briefingToday` is true only for a daily briefing. Weekly catch-up now runs on startup once
  a daily history exists.
- **Empty calendars report zero events** — the `No events today` line is no longer counted as one.
- **Briefing hour 0 survives a restart** — the stored hour is read without the `|| 8` fallback.
- **GitHub links and repo names are usable** — notifications show `owner/repo` and open the issue or
  pull request on github.com instead of the API URL.
- **Rules briefings are labelled** — the stamp says `rules` and a generated rules briefing explains
  that a DeepSeek key is needed for AI.
- **A failed strict-grounding check is visible** — the stamp says `unverified` instead of silently
  looking checked.
- **Connection health is real** — `/api/connections` reports configured/lastSync/error from the
  sources, and Settings shows the last sync time.
- **Opening a briefing is counted when it is viewed**, not when a source chip is clicked.
- **Mail folder exclusions** are editable in Preferences.
- **Multiple Google calendars** — a Google connection accepts `primary, work` and the calendar
  source reads each one; free windows follow the configured work hours.
- **Per-point feedback** — each briefing point has its own Useful/Miss, stored in
  `briefing_feedback`; the prompt receives the recent point signal.
- **Local data controls** — Application can export a secret-free JSON snapshot and delete indexed
  source data, briefings and preferences without removing the connections themselves. Retention
  now applies to mail bodies, browser visits and vault diffs on every sync.
- **FTS5 search** — notes, mail and Drive are indexed with the `unicode61` tokenizer, so Cyrillic
  case no longer matters; `/api/search` accepts `source`, `from` and `to`, and falls back to `LIKE`
  when the index is empty.
- **Meeting prep** — a 30-minute heads-up, separate from the 15-minute "starting soon" alert, with
  a Preferences toggle and a once-per-event guard.
- **CI** — `.github/workflows/ci.yml` runs typecheck, tests and the production build.

## 1.11.2

Google connect stays in the browser, and OAuth leaves a trail in `server.log`.

- **The dashboard no longer navigates away when you connect Google** — Connect and Reconnect open
  the consent screen in the system browser in a new window, so the app stays where it was.
- **OAuth start and callback are logged** — the redirect URI, whether Google came back and whether
  the state matched. Secrets are never written.

## 1.11.1

Reliability pass after the code review.

- **Wide widgets are no longer clipped** — the column is as wide as the widest card, ordinary and
  wider cards keep their own width, and the side columns no longer hide overflow. The header menu
  is not cut by the column any more, and dragging no longer selects text.
- **SQLite runs in WAL with a 5s busy timeout** — the watcher, scheduler and HTTP handlers no longer
  fail each other's writes with `database is locked`.
- **Briefing hour changes apply without a restart** — the fixed-hour cron is replaced by an hourly
  check of the configured hour; the 15-minute catch-up still covers a missed day.
- **A failed strict-grounding check keeps the draft** — the second model call is optional; a 4xx,
  network error or broken JSON marks the briefing `verified: false` instead of failing it.
- **Deleted or archived mail is reconciled** — INBOX and Important are compared against the current
  UID set for the 30-day window, so unread and awaiting-reply counts stop drifting. A UIDVALIDITY
  reset now fetches the new list before deleting the old rows.
- **One briefing at a time** — the scheduler and the HTTP route share a single claim, so a startup
  catch-up and a manual click cannot both spend a model call.
- **Sync sources time out after 120s** and shutdown waits briefly for an in-flight sync, so one hung
  mailbox no longer keeps the dashboard unready.
- **Smaller fixes** — full-text search ignores an older response, origin checks include the port,
  unchanged notes no longer rewrite their tasks every 15 minutes, the stale-note scan skips notes
  without a status line, and the Now/Next widget ticks every 30 seconds.

## 1.11.0

Widgets in the empty gutters, a briefing that checks itself, and glass that takes the room's colour.

- **Glass follows the wallpaper** — every pane is now tinted from the picture's dominant hue
  (`--glass-base`): burgundy over a crimson image, deep teal over the sea. Contrast is still solved
  per wallpaper and per density.
- **Widgets** — Now / Next, Open loops and DeepSeek this week. On windows ≥1900px they sit in the
  gutters left and right; narrower, they fold inline above the briefing (or hide, per widget).
  Drag by the header with a spring-follow ghost and a return on an invalid drop; collapse, widen,
  expand, hide and reorder are also in a header menu and in **Settings → Widgets**.
- **DeepSeek this week** shows briefings, opens, useful/miss, tokens and an estimated cost at Flash
  rates; older briefings without usage are counted as unknown.
- **Briefing content** — today's calendar first, notes grouped by project with up to five
  200-character excerpts of what actually changed, a seven-day trend line, and authoritative counts
  at the top (the same numbers the page uses).
- **Model** — `deepseek-flash` (V4.1 Flash), thinking off, JSON output.
- **Strict grounding** — every bullet needs a real digest line, every number must appear on that
  line or in the facts, and a second pass drops what the digest cannot support. On by default, with
  a dismissible note about the extra tokens and a toggle in Preferences.
- **Search results close on a click outside**, like the suggestion menu.
- **Widget settings** are its own section; no second source of truth for placement.

## 1.10.1

Readability and control polish.

- **No underlines under sources or `Why`** — the inset row and the toggle stay clickable without
  looking like plain hyperlinks.
- **Search suggestions are readable** — menus and the suggestion sheet are denser (alpha +0.42) and
  dim their own backdrop, so the text behind them no longer reads through the labels.
- **Useful / Miss** are green and red at fixed colours, independent of the wallpaper theme.
- **Bottom panels animate** — `Ask about this`, `Earlier briefings` and `What it read` grow open
  over 360ms and close in 200ms; each carries a one-line hint about what it is for, and Ask says
  what to write.
- **Sync chip** grew to 52px and 232px wide with 13/12px text, so both lines are readable at a glance.
- **No doubled `(optional)`** in the Connect Browser history dialog.
- **Slider defaults** are a tick on the track, with a reset button next to every value.

## 1.10.0

New wallpapers, and a page for making the interface yours.

- **27 new wallpapers** replace the old set; Aurora stays the default. Human-readable ids
  (`lily-pond`, `night-clouds`), poetic names, 3200px JPEG so a 2K screen sees no upscaling,
  480px thumbnails so the picker stays light. Credits list every wallhaven origin.
- **Wallpapers moved** out of Preferences into their own scrollable grid under **Appearance**.
- **Appearance page** with live controls: blur 0–30px for every glass surface, glass density
  60–150%, grain 0–20%, panel shadow 0–100%, wallpaper brightness 70–100%.
- **Accent** — `Auto` keeps three hues from the picture; the swatches show them, and a hue slider
  picks one by hand. Secondary and tertiary rotate around it, contrast is re-solved, and the pick
  survives wallpaper changes.
- **Animation presets** — Calm (no shine, parallax, hover lift or stagger; everything 1.3× slower),
  Balanced, Lively (0.8×, 2px lift). System reduced motion still wins.
- **Monochrome wallpapers** get a neutral silver palette instead of an invented amber.
- **Readability** — the palette is solved against the inset surface and re-solved for every density
  and manual accent, so secondary text and coral keep 4.5:1 on both panels and insets.

## 1.9.0

Inset glass, a slower reading rhythm, and a Settings screen that is pleasant to use.

- **Inset glass** — sources under a briefing point are now glass insets into the briefing sheet:
  one row each, with space between them, lighter and more transparent than the panel, a slow
  hover lift, and a quiet press. The `Why` panel is the same material.
- **Why unfolds** — clicking `Why` grows the panel open over 320ms and the lines arrive one after
  another instead of the whole block appearing at once. The `+` turns into `×`.
- **Reading rhythm** — a briefing arrives line by line, 90ms apart, 620ms each; the loading state
  is the same rhythm: calm bars with a slow sweep, matched to the size of the text they replace.
- **The brand is a button** — bigger name (20px) and mark, a shine you can actually see, a hover
  lift. It opens **About**: version, data folder with `Open folder`, how many sources are connected
  and when they last synced, the DeepSeek key state, `Copy diagnostics` and the README.
- **Connections** — `Test / Edit / Disconnect` are three equal glass insets, 30px tall, with slow
  hover and press states; `+ Add account` became a quiet inset too.
- **Settings** — the rail is a glass inset whose active pane slides to the section you are reading;
  clicking a section scrolls there smoothly instead of teleporting. The `Settings` crumb is gone
  from the top bar.
- **Filters as chips** — the muted-senders, hidden-folders and ignored-domains lists are edited one
  entry at a time: add with Enter, remove with `×`. Trims, ignores blanks, never adds a duplicate.
  Same storage format as before.
- **Preferences** — a calmer grid, square inset fields, no clipped textarea scrollbars.

## 1.8.2

The interface takes its colour from the wallpaper, and the glass becomes real matte glass.

- **Themes from the picture** — on every wallpaper change the app samples the image, picks three
  hues, and derives accent, secondary, tertiary, ink and the aurora light from them; errors stay a
  pastel red. Colours cross-fade over 700ms, so clicking a wallpaper repaints the whole interface
  instead of swapping it. Readability is solved per picture: glass density and dimming are computed
  so secondary text still clears 4.5:1 at the image's bright end.
- **Flat frosted panels** — every gradient, glow and border is gone from the panels, the rail, the
  cards, the search field, the sync chip, the menus, the dialogs and the tooltips. One flat
  translucent fill, a static two-scale grain (matte glass) and a soft shadow.
- **Less blur** — 30px → 14px, so the wallpaper behind a panel stays recognisable instead of
  turning into a smear.
- **Search and hints** — the suggestion sheet sits flush against the field and grows out of it;
  rows and hints are the same frosted material as the panels, with a soft hover patch instead of
  the ice bar.
- **Sources in the briefing** and the wallpaper picker keep their layout, now in the new material.

## 1.8.1

A square, frosted pass over the whole interface: the glass loses its borders and corners, search
gains its transitions, and every wallpaper now shows its subject instead of empty sky.

- **Square glass** — panels, cards, the rail, buttons, fields, menus and dialogs are rectangles with
  no border; `brightness` in the backdrop filter dims the wallpaper under the glass, so the frost
  reads on both dark and bright images while the room stays visible around it.
- **Search** — native scrollbars are gone from the suggestion list and the results sheet; both
  animate in and out (the layer stays mounted for the exit); focusing the field draws an inner ice
  hairline instead of a blue halo around it.
- **Wallpapers** — each image carries its own focal point and zoom, so Dusk Ridge, Amber Dunes,
  Pine Hollow and Heather Moor show their landscape rather than their sky. The picker shows real
  previews again.
- **Sources in the briefing** — checkbox rows became a grid of 44px tiles with a mint check, a
  brighter checked label and a count in the legend.

## 1.8.0

The window stops being a panel. The wallpaper is the room now, the glass sits only where content
lives, and the controls that carry state are louder and say more.

- **No stage sheet** — the full-window glass rectangle is gone; the wallpaper runs edge to edge and
  only the rail, hero, today, briefing, settings cards and search field blur it in their own area.
- **Wallpapers** — shown at full strength behind the glass with a light scrim; the aurora drops to a
  low light on top. A subtle pointer parallax moves the room (±10px wallpaper, ±16px aurora), off
  under reduced motion.
- **Brand** — 32px mark, 16px Unbounded wordmark with a slow shine sweep, date at 12px.
- **Source rail** — wider (104px) stations that name the service and its state (`15:45`, `waiting`,
  `off`, `error`); hover lifts the tile and lights the glyph in its source colour.
- **Search** — centred in the window, 52px tall, glass like the rest of the surface; the layout
  keeps it clear of the sync chip and the window controls at every width.
- **Sync chip** — two lines over a 3px progress bar: `Synced 15:45` with the source count, the
  service and `2 of 5` while running, and how many sources need attention after a failure.
- **Briefing** — the reading rule follows the pointer instead of the scroll position; hovering a
  point (or focusing a link in it) draws its amber tick to full height.

## 1.7.0

A pass over the details: search now reaches every result from the keyboard, content in Russian is
read as Russian, and the small interactive pieces stop getting in the way.

- **Search** — a final `Search all for “…”` row sits in the suggestion list and is reachable with
  the arrow keys; `Ctrl`/`Cmd`+`Enter` runs the full search from anywhere in the field, `Enter` on
  the row opens the results, and typing again resets the selection.
- **Language** — text that comes from your notes, mail, calendar, Drive, briefings and connections
  declares its own `lang`, so Russian content is no longer announced with English phonetics. The
  interface itself stays English.
- **Accessibility** — one `h1` per route, section labels are `h2`s, the invisible search submit is
  out of the tab order, the focus ring appears only for keyboard navigation, and the settings
  navigation marks the current section with `aria-current`.
- **Settings** — connection dialogs share the standard modal body and action footer, fields are
  tied to their labels, and the saved-secret hint is announced with its field. Moving between
  dashboard and settings returns the page to the top.
- **Compact layout** — the sync button keeps an icon that turns amber while running and coral after
  a failure, and drops the progress bar it cannot fit.
- The dashboard brand is no longer a button that does nothing when it is already the current page.

## 1.6.0

The interface becomes an Aurora Glass shell: one frameless window on a slow aurora, a source rail
instead of a services line, a command field that owns search, and a wallpaper picker behind the
glass. Briefing data, sources and privacy are unchanged.

- **Aurora Glass** — dark indigo/teal/amber light behind a glass stage, a top bar with brand, date,
  command field, sync and window controls, a vertical source rail with health dots, and settings in
  the same shell.
- **Frameless window** — custom title bar, remembered size, position and maximized state. Closing
  still hides to the tray.
- **Wallpapers** — nine images (Blue Hour, Cinnabar Shore, Still Sea, Dusk Ridge, Alpine Dawn,
  Salt Mirror, Pine Hollow, Amber Dunes, Heather Moor) ship with the app. Pick one under
  **Settings → Preferences → App background**; Aurora stays the default. The choice is stored in the
  local database through `/api/settings`.
- **Search** — the command field keeps grouped suggestions in place; full results open in a glass
  overlay instead of a page section.
- **Settings** — section navigation with scrollspy, quiet service hints that no longer push the
  rows, and the same autosaving receipts.
- **Splash and tray** — the splash follows the new palette and the tray keeps its briefing and sync
  actions.
- The design documents (`DESIGN.md`, `PRODUCT.md`, `AGENTS.md`) now describe Aurora Glass; the old
  0.8.0 surface brief is marked superseded.

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
