# Changelog

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
