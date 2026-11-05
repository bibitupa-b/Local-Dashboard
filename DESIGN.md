# DESIGN — Local Dashboard

**Status:** direction approved 2026-11-04; implementation in progress. This document supersedes the 0.8.0 "quiet instrument" visual language.
**Full screen-by-screen design:** `C:\references\local dashboard\LOCAL-DASHBOARD-OPEN-DESIGN-BRIEF.md` (external to the repo; use this file as the binding summary once it lands).
**Scope:** the whole desktop app — window shell, dashboard, search overlay, settings, connection modal, confirm dialog, welcome dialog, splash.
**Character:** one glass instrument in a dark room, lit by a slow aurora. Editorial type, precise metadata, warm light only where attention lives.

---

## 1. Intent

The dashboard answers two questions — where do I start, what happened — and offers one action: read the briefing or ask for a new one.

The interface is now an **app shell**, not a page with a masthead:

1. **Top bar** — brand, date, command field, sync, window controls.
2. **Source rail** — the five connected services, always visible, with health and last sync.
3. **Stage** — the single floating glass surface holding the dashboard or settings.
4. **Dashboard** — Start here, Today, the briefing.
5. **Search** — a command overlay, not an inline section.
6. **Settings** — the same shell, with Connections, Application and Preferences.

Still deliberately absent: an activity feed, an attention queue, status pills as decoration, charts, kanban columns, a second inbox.

The visual world is **Aurora Glass**: dark, luminous, tactile. Light lives behind the glass; the interface itself stays quiet.

---

## 2. Principles

1. **One room, one instrument.** The window is a single floating object. The aurora is the room, never a graphic pasted inside a panel.
2. **Light is information.** Amber = attention, time, suggestion, reading line. Mint = health, action. Ice = information. Coral = failure. The aurora stays low-saturation and never competes.
3. **Glass is structure.** Glass marks the shell, rail, overlays and dialogs. Inside the stage, use flat tinted tiles. Never nest blur inside blur.
4. **Edges, not shadows.** A 1px light edge, an inner hairline, one large ambient shadow under the shell. Small elements do not get drop shadows.
5. **Motion is weather.** The aurora drifts slowly; interface transitions are short and functional. No bounce, particles, pointer tilt or scroll theatre.
6. **Quiet density.** The reading column is airy; metadata is compact. Whitespace separates; cards do not nest.
7. **Dark only.** No light theme, no toggle. `color-scheme: dark`.
8. **Real data only.** No invented charts, users, logos or numbers. Empty states are calm sentences, not illustrations.

---

## 3. Colour and material

### 3.1 Palette

| Token | Value | Role |
|---|---|---|
| `--void` | `#05070D` | Window background, area behind the aurora |
| `--ink` | `#F4F6FB` | Primary text |
| `--mist` | `#AEB6C8` | Secondary text, labels, metadata |
| `--dim` | `#7C8599` | Tertiary text, disabled, long meta |
| `--aurora-indigo` | `#5E6AD2` | Environment light only |
| `--aurora-teal` | `#3FBFB2` | Environment light only |
| `--aurora-amber` | `#F5B36B` | Environment warmth; same hue as semantic amber |
| `--amber` | `#F5B36B` | Attention, time, suggestion, reading line |
| `--mint` | `#7ED9B0` | Success, health, primary action |
| `--ice` | `#8DB8FF` | Information, links, focus |
| `--coral` | `#F08A8A` | Error, conflict, destructive |
| `--periwinkle` | `#9AA7FF` | Browser source only |

Derived fills and edges:

```css
--stage:         rgba(15, 21, 34, 0.58);
--rail:          rgba(11, 16, 27, 0.56);
--raised:        rgba(255, 255, 255, 0.06);
--raised-2:      rgba(255, 255, 255, 0.09);
--sunken:        rgba(0, 0, 0, 0.22);
--edge:          rgba(255, 255, 255, 0.13);
--edge-strong:   rgba(255, 255, 255, 0.24);
--edge-hairline: rgba(255, 255, 255, 0.07);
--backdrop:      rgba(3, 5, 10, 0.62);

--amber-wash:    rgba(245, 179, 107, 0.10);
--mint-wash:     rgba(126, 217, 176, 0.10);
--ice-wash:      rgba(141, 184, 255, 0.10);
--coral-wash:    rgba(240, 138, 138, 0.10);
```

Source colours: Vault `--mint`, Drive `--ice`, Mail `--amber`, GitHub `--ink`, Browser `--periwinkle`, Calendar `--amber` (time), DeepSeek `--ink` with a spark glyph. Source colour appears on dots, monograms and rail icons only; never on user content.

### 3.2 Contrast

Text must meet 4.5:1 against the **rendered glass composite** over the brightest aurora area. `--dim` is for 11–12px metadata only. Amber is allowed for the large start number, times and the suggestion label; long prose uses ink. Never convey state by colour alone. Focus ring: 2px ice, 2px offset.

### 3.3 Material

```css
.glass {
  background: var(--stage);
  backdrop-filter: blur(28px) saturate(135%);
  -webkit-backdrop-filter: blur(28px) saturate(135%);
  border: 1px solid var(--edge);
  box-shadow:
    0 40px 120px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 var(--edge-strong);
}
```

The top-left highlight is a pseudo-element, not a fill:

```css
.glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(255,255,255,0.14), transparent 34%);
  mix-blend-mode: screen;
}
```

Tiles inside the stage: `--raised`, 1px `--edge-hairline`, no `backdrop-filter`.

### 3.4 Environment

Fixed aurora behind everything:

- Indigo ellipse at 18% −10%, 900 × 700, 26% opacity.
- Teal ellipse at 95% 8%, 700 × 600, 16% opacity.
- Amber source at 34% 22%, 900 × 620, 13% opacity, rotated −18°, behind the hero.
- Faint conic band at the top-left, 6% opacity.
- 2% monochrome grain overlay to prevent banding.

The layer is 140% oversized and drifts 3–5% over 48s, alternating. The amber light reads through the hero as a ≤16% bloom behind the number; it is one source, not a second glow.

---

## 4. Typography

Onest and Unbounded are self-hosted in `src/web/fonts` (OFL). Mono is the Windows system stack (`Cascadia Mono`, `Cascadia Code`, `Consolas`) and is not bundled. Cyrillic and emoji are required.

| Token | Face | Size / line | Weight | Use |
|---|---|---|---|---|
| Hero number | Unbounded | 76 / 0.9 | 500 | The one start count |
| Hero sentence | Onest | 40 / 1.12 | 400 | Start clause; 36px when no count |
| Page title | Onest | 32 / 1.15 | 500 | Settings, route titles |
| Briefing headline | Onest | 30 / 1.22 | 500 | The answer |
| Display small | Onest | 24 / 1.3 | 500 | Modal titles, empty states |
| Body | Onest | 17 / 1.75 | 400 | Briefing, prose |
| UI | Onest | 15 / 1.5 | 400/500 | Buttons, fields, rows |
| Small | Onest | 13 / 1.5 | 400 | Event summaries, descriptions |
| Micro | Mono | 11 / 1.4 | 400 | Section labels, stamps, source names, key hints |
| Meta | Mono | 12 / 1.5 | 400 | Times, counts, details |
| Button | Onest | 14 / 1 | 500 | All buttons |

Rules: 64ch briefing measure, 70ch settings prose; only micro labels are uppercase (0.14em); user content is never uppercased or tinted; tabular numerals; links are underlined or drawn as chips; nothing below 11px; the hero is the largest thing on the dashboard and the wordmark stays 13px.

---

## 5. Space, radius, elevation

**Spacing:** 4 base; 4, 8, 12, 16, 20, 24, 28, 32, 40, 48. Window gutter 12px. Stage padding 28–32px. Panel gap 16–20px. Rail 72px. Top bar 48px.

**Radius:** window 18–22px (OS); stage 28px; hero/today 24px; briefing 28px; settings cards 20px; controls 12–14px; overlay 20px; dialogs 24px; pills 999px.

**Elevation:** page/void; rail; stage; overlay/dialog (78% stage + blur 32px + `0 32px 80px rgba(0,0,0,.6)`); toast. No nested blur.

---

## 6. Window and shell

- Frameless `frame: false`, opaque `#05070D`; no `transparent: true` (breaks Windows snap/shadow).
- Default 1280 × 860, minimum 960 × 640, resizable. Remember size, position and maximized state; restore onto a visible display.
- Custom 48px title bar: drag region, double-click to maximize. Controls right: minimize, maximize/restore, close (46 × 32, keyboard reachable, labelled).
- Close hides to tray; one-time notification. `Ctrl+Q` quits. Tray, autostart, notifications unchanged.
- Splash: 320px glass card, mark, `Reading your sources…`, one pulsing amber dot; minimum 900ms.
- Top bar: brand mark + `Local Dashboard` + date; centered 520px command field; sync button; window controls.
- Sync chip is a button: idle `Synced 10:30` / hover `Sync now`; running `Syncing mail…` disabled; failed `Sync failed` retries.
- Rail: 72px floating strip; five 44px source buttons with status dots and tooltips; settings at the bottom; `<nav aria-label="Sources and settings">`.
- Stage: the only scroll region; max content 1180px; thin scrollbars; reserved gutter.
- Route changes crossfade and scale 0.995 → 1 over 220ms; no slide.
- Narrow: ≥1200 full; 900–1199 rail 64, date hidden; 720–899 rail 56, hero/today stack, settings nav horizontal; <720 rail becomes a horizontal source strip, command field moves to a second top-bar row, sync becomes an icon. No horizontal scroll at 200% zoom.

---

## 7. Dashboard

Order: hero + today row, setup strip (until complete), banner (when present), briefing sheet.

### 7.1 Hero — Start here

Large glass panel, 2fr of a 2:1 row. Top corners: `FOCUS / Tuesday, 4 November` and `Synced 10:30` in 11px mono. Big number 76px Unbounded amber, conditional; when the item has no count, the sentence takes the display position at 36–40px and no fake number appears. Sentence 40px Onest, max 24ch, examples `awaiting your reply`, `unread mail`, `open tasks in #vitamins`. Meta 12px mono with links. Bottom-left 48px circular arrow that deep-links to the exact item; bottom-right 24px asterisk at 35% opacity. Empty: `Nothing needs attention.` at 36px mist, no number, no arrow.

### 7.2 Today

1fr glass panel. `TODAY` + date in 11px mono; event rows with 12px mono amber time and 13px title; free windows as mint pills; conflicts coral; max 6 rows + `+N more today`; `No events` / `Calendar not connected`; all-day reads `All day`.

### 7.3 Setup strip

Only while incomplete. `GET STARTED` in mint, three dot steps, ghost mini `Open settings`. Disappears entirely when done. No card.

### 7.4 Banner

Inline under the top bar, max 900px, glass + tinted wash; info ice, success mint, error coral; error ends with `Try again` and stays; success self-dismisses after 6s.

### 7.5 Briefing sheet

Full stage width, 28px radius, 32px padding. Header: `BRIEFING` + stamp (`4 Nov, 09:14 · auto · 24 h`; `Week`/`Evening` when relevant; `· N opens` when opened) and primary `Briefing now` / `Thinking…`. Missing today: `none for today yet` in amber. Failure: coral `Briefing failed at 09:14: <cause>` on the sheet.

Body: 64ch, 17/1.75; headline 30px; each point has a 2px amber tick, the mid-viewport point brightens to a full-height 2px amber bar with a 12px glow, 200ms. Source chips max 3; `Why` disclosure shows 1–3 digest lines. Suggestion: amber wash, 2px left rule, 12px right radius, `SUGGESTION` label. Verdict: segmented `Useful` / `Miss`, amber pressed, `aria-pressed`, group label. `Ask about this`: disclosure with input and answer inset. `Earlier briefings` and `What it read`: native disclosures; digest in 12px mono, `pre-wrap`, max 40vh. Generating: 3 skeleton lines, 1.6s pulse; arrival warms the edge for 900ms. Empty: one calm sentence.

### 7.6 Search overlay

Command field opens a 680px glass sheet beneath it, max 520px tall. Groups Notes/Mail/Drive; rows 52px with source dot, label, mono detail; active row `--raised-2` + 2px ice bar; ↑/↓, Enter opens, Esc closes, `/` focuses, outside click closes, focus returns. Last row always `Search all for “…”`; Enter on it or Ctrl/Cmd+Enter runs the full search. Results state: `RESULTS FOR “…”`, count, `Clear`; long paths wrap. No results: `Nothing found.`

### 7.7 Welcome

560px glass sheet; title 24px; one privacy paragraph; primary `Set up sources`, ghost `Explore first`; backdrop blur 12px; no illustration.

---

## 8. Settings

Same window, rail and aurora. Command field replaced by breadcrumb `Settings`. Page header: `Settings` 32px, privacy line 13px mono, `Back to dashboard` ghost pill.

Layout: 200px anchor nav + content max 820px. All sections mounted on one scrolling page; sticky nav with scrollspy, 2px ice active bar. Below 1100px: horizontal sticky tabs that scroll to sections, not unmount them. Cards: `--raised`, hairline, 20px radius, 24px padding.

### 8.1 Connections

Six service groups separated by hairlines. Monogram tile (source colour), name + `?` glass tooltip, description, status chip (`Connected` / `Needs attention` / `Not connected`), `Connect` or `+ Add account`. Saved accounts as inset 52px rows: dot, label, mono detail, actions `Test` / `Edit` / `Reconnect` / `Disconnect` (coral text/edge, no solid red). Test result inline: spinner + `testing…`, `works` mint, cause coral.

### 8.2 Application

Data directory in 12px mono. Ghost actions `Open data folder`, `Copy diagnostics`, `Check for updates`; `Quit application` coral. One line about tray/quit behaviour.

### 8.3 Preferences

Header with autosave state at right: `Changes save as you edit`, `Saving…`, `All changes saved 09:14`, `N changes not saved` coral. No Save button.

Fields: briefing hour (0–23), digest window (≥1), language (Auto/Русский/English), evening toggle, briefing context (500 chars, no counter), excluded senders, vault prefixes, browser domains, source toggle chips (at least one stays). Two-column 720px grid, single column below 1100. Each field: 13px label, 40px `--sunken` control, ice focus ring, 11px mono receipt at the label line. Failed write keeps text + cause + `Retry`; returning to stored value drops the receipt.

### 8.4 Dialogs

Connection modal 520px, 24px radius, fields + secret note + enabled toggle + error banner; primary `Add connection` / `Save changes`, ghost `Cancel`. Confirm 400px, `Cancel` + coral `Disconnect`. Focus moves in, Tab stays, Escape/backdrop close, focus returns. Enter 240ms, exit 140ms. Welcome follows the same pattern.

---

## 9. Component states

Primary (mint fill, void text, 40px), ghost (1px edge), mini (28–30px), icon (44px), window control (46 × 32), command field (40px), input/select/textarea, toggle (36 × 20), source button (ok/off/error/active sync), status chip, chip, accordion, verdict segment, tooltip (320px), banner, skeleton, spinner, toast, modal, empty state.

Every interactive element: hover, focus-visible, active, disabled. Every state has words, not just hue. Coarse pointer: 44px buttons, 48px fields/rows.

---

## 10. States

- **Loading:** shell + rail + aurora immediately; no fake data. Briefing skeleton only while generating. No entrance animation on the 60s refresh.
- **Empty:** one calm sentence in mist; no icon or illustration.
- **Partial:** what arrived renders; banner names what is missing; missing pile shows nothing, never a false `Nothing needs attention.`
- **Error:** cause + next step where it happened; retry when possible.
- **Sync:** active rail source pulses with an amber ring; top chip names the service; outcome flash 1.6s; one live announcement.
- **Disabled:** 40% opacity, no motion, reason in tooltip.
- **Offline:** shell stays; top chip `Offline`; banner explains the local server is not responding.

---

## 11. Motion

| Element | Motion | Duration |
|---|---|---|
| Aurora | 3–5% drift | 48s linear |
| Shell / route | Fade + 0.995 → 1 | 220ms |
| Panels | Fade + 8px rise, 40ms stagger | 320ms |
| Buttons | Colour; 1px press | 120 / 80ms |
| Search overlay | Fade + 4px rise | 160ms |
| Search row | Background + 2px ice bar | 80ms |
| Reading tick | 2px amber bar + 12px glow | 200ms |
| Sync source | Amber ring + pulse | 1.2s loop |
| Sync outcome | Mint/coral flash | 1.6s once |
| Briefing arrival | Edge warms + body fades | 900 / 240ms |
| Skeleton | Opacity pulse | 1.6s |
| Verdict | Amber edge/text | 120ms |
| Disclosure | Chevron 90° | 150ms |
| Modal | Fade + 6px rise / fade | 240 / 140ms |
| Receipt | Fade; mint settles to mist | 180ms / 2.4s |
| Banner | Fade + 4px rise | 200ms |

Animate transform/opacity only; width only on the 2px sync rail. Never animate `backdrop-filter` or `blur`. Exits shorter than entrances. Loops pause when hidden. Reduced motion: static aurora, fades only, no rise/pulse/drift.

Performance is a second pass: keep blur static, avoid layout animation, cap ambient loops at two. Tune after visual review.

---

## 12. Accessibility

4.5:1 against the rendered glass; 3:1 large. One `<main>` per route; rail is labelled nav. Keyboard: `/`, `b`, `Esc`, arrows, Enter, Tab; shortcuts inert in dialogs. Dialog focus trap/return. Window controls labelled. 2px ice focus ring everywhere. Live regions: banner, sync outcome, briefing ready, search count, verdict. Persistent labels; placeholders are hints. 200% zoom reflows, no horizontal scroll. Cyrillic/emoji wrap anywhere. Coarse pointer targets 44px.

---

## 13. Content and tone

Sentence case; plain and factual. Buttons say what happens. Times 24-hour, dates `4 Nov`, masthead full weekday. Errors name cause and next step, no apologies. Privacy is stated in the welcome dialog and in `What it read`. No emoji, no decorative icons, no marketing voice. Mockups use realistic data only.

---

## 14. Mapping from the previous design

| Previous | Now |
|---|---|
| Masthead inside the page | Top bar with brand, command field, sync, window controls |
| Horizontal services rail | Vertical source rail with tooltips and active sync |
| Page padding as the shell | Floating glass stage inside a frameless window |
| Inline search row | Command overlay under the top bar |
| Dashboard blocks on `--bg` | Hero/Today glass panels + briefing sheet |
| Settings route with stacked cards | Same shell + anchor nav + glass cards |
| `--bg`, `--surface`, `--raised` sage world | Void/aurora, glass, amber/mint/ice/coral |
| Unbounded for all display | Unbounded for wordmark + start number; Onest for display/reading |
| No cards on dashboard | Structured glass panels; no nested cards |

---

## 15. Non-goals

Light theme, theme toggle, photographic backgrounds, 3D renders, neon, particles, pointer-tracked tilt, charts, kanban, fake navigation, new sources, new data, mobile layout, anything that writes to a source. No activity feed or attention queue.

---

## 16. Implementation checklist

- [ ] Tokens in `:root`; `color-scheme: dark`; no raw hex outside the token block.
- [ ] Aurora + grain are CSS/SVG, static layer, drift only with motion allowed.
- [ ] Glass recipe shared; inner tiles flat; no nested blur; blur never animated.
- [ ] Frameless window with custom title bar, drag, double-click maximize, labelled controls, persisted bounds.
- [ ] Rail with five sources + settings; accessible names include state and destination.
- [ ] Top bar with command field and sync button; `Synced` / `Syncing` / `Failed` / `Offline`.
- [ ] Hero supports count and text-only starts; arrow deep-links to the exact item.
- [ ] Today, setup strip, banner, briefing sheet with headline, chips, `Why`, suggestion, verdict, ask, earlier, digest.
- [ ] Search overlay with groups, keyboard, `Search all for…`, results, clear, empty.
- [ ] Settings anchor nav + Connections / Application / Preferences; autosave receipts; connection modal; confirm.
- [ ] Welcome dialog and splash in the new material.
- [ ] 1280 × 860 and 960 × 640; 200% zoom; no horizontal scroll; long Cyrillic paths wrap.
- [ ] Reduced motion; focus rings; live regions; 44px coarse targets.
- [ ] `npm run build`, `tsc --noEmit`, `npm test` pass.
- [ ] README screenshots and visual line updated after implementation.

---

## 17. Decisions settled in review

1. Full search via `Search all for “…”` footer row or Ctrl/Cmd+Enter.
2. Narrow/zoom behaviour per §6; no clipping at 200%.
3. Hero supports text-only starts; no fake zero.
4. Mono is the system stack, not bundled.
5. One amber light behind the hero; no second glow.
6. Sync chip is a button; tray sync stays.
7. Calendar amber, DeepSeek ink; no new hue.
8. Settings is one scrolling page with scrollspy anchors.
9. `Why`, `opens` and `Evening` are preserved.
10. Hero arrow deep-links to the exact item.
11. Performance is a second pass after visual fidelity.

---

*Source references: five images in `C:\references\local dashboard` — dark glass card on aurora, periwinkle workspace, layered search bars, frosted workspace shell, minimal dashed data panel. This document is the binding summary; the brief carries the full screen anatomy.*
