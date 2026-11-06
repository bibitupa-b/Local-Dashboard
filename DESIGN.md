# DESIGN — Local Dashboard

**Status:** implemented 2026-11-05. This document describes the current interface and supersedes the 0.8.0 "quiet instrument" visual language.
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
3. **Glass is structure.** Glass marks what carries content: the rail, the dashboard panels, the settings cards, the command field, overlays and dialogs. The window itself is not glass. Never nest blur inside blur.
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
--rail:          rgba(11, 16, 27, 0.46);
--panel:         rgba(10, 14, 24, 0.48);
--field:         rgba(10, 14, 24, 0.34);
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

The window is not a panel: there is no full-stage glass sheet. The wallpaper is visible across the whole window and only the elements that carry content sit on glass — the rail, the two dashboard panels, the briefing sheet, the settings cards, the command field, the search sheet and the dialogs.

Every glass surface is a **rectangle with no border, no gradient and no glow**: one flat translucent fill, a static grain and a soft shadow. Depth comes from the picture changing under the pane, not from decoration.

```css
--glass-base: 13 17 26;     /* the picture's hue, very dark */
--glass-alpha: 0.26;        /* set from the wallpaper */
--glass-dim: 0.9;           /* set from the wallpaper */
--glass:      rgb(var(--glass-base) / var(--glass-alpha));
--glass-soft: rgb(var(--glass-base) / calc(var(--glass-alpha) * 0.7));   /* search, sync */
--glass-menu: rgb(var(--glass-base) / calc(var(--glass-alpha) + 0.42));  /* menus, dialogs, tips */

.panel, .briefing, .card, .rail {
  background: var(--glass);
  backdrop-filter: blur(var(--blur-panel)) brightness(var(--glass-dim)) saturate(115%);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
}
```

The blur is deliberately short (14px) so shapes behind the glass stay recognisable. `brightness(var(--glass-dim))` dims only the pane's own backdrop, and `--glass-alpha`/`--glass-dim` are derived per wallpaper: dark pictures stay almost fully transparent (0.24 / 0.9), bright ones get a denser, dimmer pane so text still passes 4.5:1 at the picture's brightest area. `--glass-base` is the wallpaper's dominant hue at S ≤ 22% and L 3.8%, so the glass itself is a dark version of the picture (burgundy over a crimson image, deep teal over the sea) instead of a fixed navy. Menus and dialogs add 0.42 alpha over the same filter.

**Grain** is a static two-scale `feTurbulence` data URI on `::after`, `opacity: 0.12`, `mix-blend-mode: overlay`, `background-size: 120px` and `260px`. It is the same on every pane: matte glass, not a clean gradient.

The command field, ghost buttons and chips are controls, not panels: `--glass-soft`, the same blur, no border. Buttons that are solid mint stay solid. Never nest blur: fields inside a glass panel get the translucent tint only. Hovered rows are a soft patch of the same glass (`rgba(255,255,255,0.06)`), never an ice bar.

Glass entrances are **transitions**, never `animation`: an element with a filling animation keeps its own compositing group and the backdrop filter turns into a flat fill.

Tiles inside a panel: translucent white fill, no border, no `backdrop-filter` (never nest blur).

**Inset glass.** A small pane that belongs to a panel uses the same material, one step lighter and more transparent: `--inset: rgba(255,255,255,0.05)`, grain from the parent, a pressed-in top edge (`inset 0 1px 0 rgba(255,255,255,0.05)`), no border, no shadow of its own. Source rows under a briefing point, the `Why` panel, the settings rail, saved-list chips and the connection actions are all insets. They lift 1px on hover over 240ms and settle without motion on press. `--inset-hover` is `rgba(255,255,255,0.095)`.

### 3.4 Environment

Fixed aurora behind everything:

- Indigo ellipse at 18% −10%, 900 × 700, 26% opacity.
- Teal ellipse at 95% 8%, 700 × 600, 16% opacity.
- Amber source at 34% 22%, 900 × 620, 13% opacity, rotated −18°.
- Faint conic band at the top-left, 6% opacity.
- 2% monochrome grain overlay to prevent banding.

The layer is 140% oversized and drifts 3–5% over 48s, alternating. The orbs take their colour from the theme, so the room light matches the wallpaper.

A light pointer parallax moves the room, not the interface: the wallpaper follows the pointer by up to ±10px and the aurora counter-moves by up to ±16px, eased over 500ms. It is off under `prefers-reduced-motion` and on touch pointers, and it never touches content.

### 3.5 Wallpaper

A wallpaper is optional and lives in the same environment layer, below the aurora: `background-size: cover`, `brightness(var(--photo-brightness))` (94% by default), with a 0.30 → 0.52 vertical scrim. Each image carries its own **focal point and zoom** (`focus`, `zoom` in `wallpapers.ts`) because the subject of many of them sits off-centre or low in the frame; the room anchors the crop on that point and scales around it (1.0–1.12), so the composition is visible instead of its empty sky. The image is meant to be seen: the glass surfaces above it do the dimming in their own area, so the wallpaper is never a background pasted inside a panel. Choosing an image does not replace the aurora; the aurora drops to a low-opacity light on top. `Aurora` is the default and means no image.

**27 images** ship in `assets/wallpapers/` next to 480px thumbnails in `thumbs/`; `credits.json` lists each title and its wallhaven origin. Full images are capped at 3200px wide, JPEG q88 (native width kept when smaller), so a 2K screen gets no upscaling; thumbnails are q70 and keep the picker under a megabyte. The picker lives at **Settings → Appearance → App background** and shows each image itself as the preview; the choice is stored through `/api/settings` and survives restarts. IDs are human-readable slugs (`lily-pond`); the shared `src/shared/wallpaper-ids.ts` is the one list the server and the client agree on, and an unknown or removed id falls back to Aurora. Images never enter a panel, never sit inside the stage, and are never used as content backgrounds.

### 3.6 Theme from the wallpaper

The interface takes its colours from the picture. On every change, `theme.ts` samples the image into a 32 × 20 canvas (`src/web/theme.ts`):

1. Pixels become HSL; near-grey, near-black and near-white ones are dropped.
2. A 24-bin hue histogram weighted by `saturation × mid-tone` picks three hues at least 40° apart; missing tones are synthesised. A picture with under 2% chromatic pixels is **monochrome** and gets a neutral silver palette instead of an invented amber.
3. Accent, secondary and tertiary are normalised into a light band (L 70–82%, S 45–72%) and lightened further until each clears 4.5:1 against the glass composite. A manual accent hue replaces the dominant one and rotates the other two around it (+38° / −46°).
4. `--ink`, `--mist`, `--dim` keep a 10–16% tint of the dominant hue.
5. `--coral` stays a pastel red (hue within 20° of 0, S ≤ 55%, L ≥ 74%) so errors still read as errors.
6. `--glass-alpha` and `--glass-dim` are solved from the picture's 97th-percentile brightness and the **glass density** knob (60–150%), and every colour is checked against the **inset composite** — the panel plus the 5% white of an inset — not just the panel, so secondary text and coral keep 4.5:1 on both surfaces at every density.
7. `--glass-base` is the same dominant hue at very low lightness, so every pane carries the room's colour.

The tokens are registered with `@property` and `:root` transitions them over 700ms, so clicking a wallpaper **cross-fades** the whole interface instead of swapping. `Aurora` has a fixed palette and only follows the density knob. `prefers-reduced-motion` switches instantly.

### 3.7 Appearance knobs

Five CSS variables carry the Appearance page, written by `appearance.ts` and read by every glass rule:

| Variable | Range | Effect |
|---|---|---|
| `--blur-panel` | 0–30px | every panel, card, field, rail, chip and ghost button |
| `--blur-menu` | +4px (cap 30) | menus, tooltips, dialogs, toast, search sheet |
| `--grain-opacity` | 0–0.20 | the two-scale grain on all glass |
| `--shadow-scale` | 0–1 | multiplies every glass shadow alpha |
| `--photo-brightness` | 0.70–1.00 | the wallpaper filter; never brighter than 1.0 |

`data-motion` on `<html>` picks `calm / balanced / lively`: calm removes the shine, parallax, hover lift and stagger and slows the rest (×1.3); lively speeds them up (×0.8) and lifts 2px. The system reduced-motion preference always wins.

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

**Spacing:** 4 base; 4, 8, 12, 16, 20, 24, 28, 32, 40, 48. Window gutter 12px. Page padding 20–28px. Panel gap 16–20px. Rail 104px. Top bar 68px.

**Radius:** 0 everywhere — panels, cards, fields, buttons, chips, dialogs, menus and the rail are rectangles. Only data dots, the status spinner, the aurora orbs and the hero arrow's neighbour dot stay circular. The OS window corners are the only rounding left.

**Elevation:** void + wallpaper; rail; panels and cards; overlay/dialog (dense frost + blur 32px + `0 32px 80px rgba(0,0,0,.55)`); toast. No nested blur.

---

## 6. Window and shell

- Frameless `frame: false`, opaque `#05070D`; no `transparent: true` (breaks Windows snap/shadow).
- Default 1280 × 860, minimum 960 × 640, resizable. Remember size, position and maximized state; restore onto a visible display.
- Custom 68px title bar: drag region, double-click to maximize. Controls right: minimize, maximize/restore, close (46 × 32, keyboard reachable, labelled).
- Close hides to tray; one-time notification. `Ctrl+Q` quits. Tray, autostart, notifications unchanged.
- Splash: 320px glass card, mark, `Reading your sources…`, one pulsing amber dot; minimum 900ms.
- Top bar: brand mark 32px + `Local Dashboard` 16px Unbounded with a slow shine sweep + date in 12px mono, over a narrow vertical scrim so a bright wallpaper cannot wash the wordmark out; the command field centred in the window at `clamp(240px, 100vw − 700px, 620px)`; sync chip; window controls.
- The wordmark shine is one 7s loop with a pause, text-clipped highlight only, off under reduced motion.
- Sync chip is a button, 52px and at least 232px wide, two mono lines (13px over 12px) over a 3px bar: idle `Synced 15:00` / `5 sources up to date` with a full mint bar at 30% opacity; running `Syncing…` / `mail · 2 of 5` with the amber→mint bar filling by progress, disabled; failed `Sync failed` / `N sources need attention` with a coral dot. Hover lifts the fill.
- Rail: 104px floating strip; five 86 × 68 stations with a 22px glyph, the service name and its state (`15:00` / `waiting` / `off` / `error`) in 11px mono, plus tooltips; hover lifts the tile and lights the glyph in its source colour; settings at the bottom; `<nav aria-label="Sources and settings">`.
- Stage: the scroll region only — no surface, no edge, no blur. Max content 1180px; thin scrollbars; reserved gutter.
- Route changes crossfade and scale 0.995 → 1 over 220ms; no slide.
- Narrow: ≥1200 full; 1000–1199 the sync chip and window controls tighten so the centred field keeps its clearance; 900–999 rail 76 with 60px stations, hero/today stack, settings nav horizontal; <720 rail becomes a horizontal source strip without captions, command field moves to a second top-bar row, sync becomes an icon. No horizontal scroll at 200% zoom.

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

Full page width, 28px radius, 32px padding. Header: `BRIEFING` + stamp (`4 Nov, 09:14 · auto · 24 h`; `Week`/`Evening` when relevant; `· N opens` when opened) and primary `Briefing now` / `Thinking…`. Missing today: `none for today yet` in amber. Failure: coral `Briefing failed at 09:14: <cause>` on the sheet.

Body: 64ch, 17/1.75; headline 30px; each point keeps a 2px amber tick at 50% height and 22% opacity, and hovering the point (or focusing a link inside it) draws it to full height with a 12px glow over 180ms. The digest now opens with **Authoritative numbers** (exact counts from the same source the page uses), today's calendar, notes grouped by project with up to five 200-character excerpts of what changed, a seven-day trend line, then attention, tasks, mail and Drive. Bullets must cite a digest line; numbers must be on that line or in the facts. A strict-grounding second pass (on by default) drops bullets the digest cannot support, and the first new briefing shows a dismissible glass note saying the check is on and uses extra tokens, with `Turn off` and `Got it`. Sources are inset rows, one per line with 8px between them (max 3), with no underline — the row itself is the link. `Why` is a plain toggle (no underline) whose `+` turns to `×`, and its panel is the same inset, unfolding over 320ms while its lines arrive 60ms apart. Suggestion: amber wash, 2px left rule, 12px right radius, `SUGGESTION` label. Verdict: segmented `Useful` / `Miss`, `aria-pressed`, group label; pressed Useful is always green (`#7ED9B0`) and pressed Miss always red (`#F08A8A`), independent of the wallpaper theme. `Ask about this`, `Earlier briefings` and `What it read` are animated disclosures: each opens with the body growing over 360ms, carries a one-line mono hint about what it is for (and, for Ask, what to write), and closes in 200ms. Ask has a square inset input and answer; digest in 12px mono, `pre-wrap`, max 40vh. Headline, points and suggestion arrive line by line, 90ms apart, 620ms each, once per briefing. Generating: five bars matched to the text they replace, a slow 2.8s sweep, no pulse; arrival warms the edge for 900ms. Empty: one calm sentence.

### 7.6 Search overlay

The command field is 52px tall, glass in `--glass-soft` with grain, 16px text, square, centred in the window and never overlapped by the sync chip or the window controls. Focus is an inner 2px ice hairline and a slightly brighter fill — no outer ring, no blue halo on click. The suggestion sheet sits flush against the field's bottom edge (0px gap, same material, `transform-origin: top center`) so it reads as one pane growing out of the field; it enters with `scale(0.995, 0.94) → 1` over 140ms and leaves over 120ms, staying mounted for the exit. Menus and the suggestion sheet are denser than panels (alpha +0.42) and dim their own backdrop to 0.88× the glass dim, so labels stay readable even over a bright wallpaper or a headline behind them. Rows are 52px with source dot, label, mono detail; the hovered or active row is a soft patch of the same glass (no ice bar); ↑/↓, Enter opens, Esc closes, `/` focuses, outside click closes, focus returns. The footer row `Search all for “…”` is the last row of the list, not a sticky bar. Scrollbars are hidden on the sheet and the menu; the list scrolls by wheel and arrows. Enter on the footer or Ctrl/Cmd+Enter runs the full search. Results state: `RESULTS FOR “…”`, count, `Clear`; long paths wrap. No results: `Nothing found.`

### 7.7 Welcome

560px glass sheet; title 24px; one privacy paragraph; primary `Set up sources`, ghost `Explore first`; backdrop blur 12px; no illustration.

### 7.8 Widgets

Three live cards: **Now / Next** (today's event, free window), **Open loops** (three waiting items) and **DeepSeek this week** (briefings, tokens, an estimated cost at Flash rates). On a window ≥1920px they live in the empty gutters left and right of the 1180px measure (`position: fixed` columns, 240px, 280px when wider); below that they fold inline above the briefing unless the widget is set to hide. Inline cards are one line and expand on click; side cards show three rows, or up to eight when expanded. Each header is a drag handle on a wide window: the ghost follows the pointer on a spring and returns on an invalid drop; the menu on the header moves a widget, changes width, expands rows or hides it. Layout is stored in `settings.widget_layout`.

---

## 8. Settings

Same window, rail and aurora. The top bar carries no breadcrumb: the page title says where you are. Page header: `Settings` 32px, privacy line 13px mono, `Back to dashboard` ghost pill.

Layout: 200px anchor nav + content max 880px. All sections mounted on one scrolling page. The nav is a glass inset and the active pane is one `settings-nav__thumb` that slides to the current section over 420ms (scroll-spy keeps it honest); on narrow windows it becomes a horizontal inset whose pane slides sideways. Clicking a section scrolls the stage smoothly instead of jumping. Sections: Connections, Application, Preferences, Appearance. Cards: `--panel` glass, 20px radius, 24px padding.

### 8.1 Connections

Six service groups separated by hairlines. Monogram tile (source colour), name + `?` glass tooltip, description, status chip (`Connected` / `Needs attention` / `Not connected`), `Connect` or `+ Add account` as a quiet inset. Saved accounts as inset 52px rows: dot, label, mono detail, actions `Test` / `Edit` / `Reconnect` / `Disconnect` — three equal 30px insets, min 84px wide, slow hover lift, `Disconnect` in pastel coral text. Test result inline: spinner + `testing…`, `works` mint, cause coral.

### 8.2 Application

Data directory in 12px mono. Ghost actions `Open data folder`, `Copy diagnostics`, `Check for updates`; `Quit application` coral. One line about tray/quit behaviour.

### 8.3 Preferences

Header with autosave state at right: `Changes save as you edit`, `Saving…`, `All changes saved 09:14`, `N changes not saved` coral. No Save button.

Fields: briefing hour (0–23), digest window (≥1), language (Auto/Русский/English), evening toggle, briefing context (500 chars, no counter), muted senders, hidden vault prefixes, ignored browser domains, source tiles (at least one stays). `repeat(auto-fit, minmax(300px, 1fr))`, single column below 1100. Each field: 13px label, square inset control, inner ice focus hairline, 11px mono receipt at the label line, 11px dim hint under lists. Failed write keeps the value + cause + `Retry`; returning to stored value drops the receipt.

The three filter lists are chip editors, not textareas: each saved entry is an inset chip with `×` (`Remove <value>`), a square input adds one value on Enter or `Add`, values are trimmed, blanks ignored and duplicates never added. Storage stays a string list.

**Sources in the briefing** is a wrapping grid of 44px tiles (`repeat(auto-fit, minmax(132px, 1fr))`): a 16px square checkbox, the source name, `checked` in mint with an ink label, unchecked in mist, hover lightens, the last remaining source is disabled at 45%, and the legend carries the count (`Sources in the briefing · 4 of 6`).

### 8.4 Appearance

App background first: 27 images plus Aurora in a scrollable 5-column grid (360px tall) with 480px thumbnails, names under each, active tile on a lighter inset with an inner ice line.

Then five sliders, each a square track with the value in mono at the label line, a 2px tick at the default value and a small reset button beside it (disabled while the value is already the default): `Blur` 0–30 px, `Glass density` 60–150%, `Grain` 0–20%, `Panel shadow` 0–100%, `Wallpaper brightness` 70–100%. Blur, grain, shadow and brightness preview instantly; density and accent land when the debounced write returns (~500ms) because the whole palette is re-solved.

`Accent` shows `Auto` plus the three hues the picture gave (as swatches) and a 0–359° hue slider; a picked hue drives the primary and rotates secondary/tertiary around it, and the value survives wallpaper changes. `Animation` is three presets — `Calm / Balanced / Lively`. Every change uses the same autosave receipts as Preferences.

### 8.5 Widgets

A list of the three widgets. Each row: name, placement (`Left column / Right column / Inline / Hidden`), `Open`, `Wider`, `Inline when narrow`, and up/down order. Position and order persist through `/api/settings`; the same layout is what drag-and-drop edits on the dashboard, so the two never disagree. Reset is manual: set placement back to `Hidden` or `Inline`.

### 8.6 Dialogs

Connection modal 520px, fields + secret note + enabled toggle + error banner; primary `Add connection` / `Save changes`, ghost `Cancel`. Confirm 400px, `Cancel` + coral `Disconnect`. `About` 560px: name + version, one privacy line, `Data` (path + `Open folder`), `Sources` (connected, failing, last sync), `DeepSeek` key state, then `Copy diagnostics`, `README`, `Close`. Focus moves in, Tab stays, Escape/backdrop close, focus returns. Enter 240ms, exit 140ms. Welcome follows the same pattern.

---

## 9. Component states

Primary (mint fill, void text, 40px), ghost (1px edge), mini (28–30px), icon (44px), window control (46 × 32), command field (52px), input/select/textarea, toggle (36 × 20), source station (86 × 68), sync chip (46px, two lines + progress bar), status chip, chip, accordion, verdict segment, tooltip (320px), banner, skeleton, spinner, toast, modal, empty state.

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
| Room parallax | Wallpaper ±10px, aurora ±16px against the pointer | 500ms ease-out |
| Wordmark shine | Highlight sweep across the clipped text | 9s loop |
| Theme | Colours cross-fade when the wallpaper changes | 700ms |
| Wallpaper | Fade-in of the new picture | 260ms |
| Brand button | Hover: 1px lift, mark tilts 4° | 240 / 320ms |
| Route | Fade | 300ms |
| Panels | Fade + 8px rise (transition, no stagger) | 300ms |
| Inset hover | Background + 1px lift | 240ms |
| Buttons | Colour; 1px press | 240 / 80ms |
| Search menu | Fade + 6px drop in; fade + 4px on the way out | 140 / 120ms |
| Search results sheet | Fade + 6px in; stays mounted for the exit | 140 / 120ms |
| Search row | Background patch only | 150ms |
| Reading tick | Hover/focus draws 2px amber bar to full height + glow | 180ms |
| Rail station | Hover lift 1px, tint, glyph glow | 160ms |
| Sync source | Amber ring + pulse | 1.2s loop |
| Sync outcome | Mint/coral flash | 1.6s once |
| Briefing reveal | Lines rise 8px and fade, 90ms apart (once per briefing) | 620ms each |
| Briefing arrival | Edge warms + body fades | 900 / 240ms |
| Why unfold | Height, padding and fade; lines 60ms apart; `+` turns 45° | 320 / 180ms |
| Bottom disclosures | Body grows from 0fr, hint and content fade; closes sooner | 360 / 200ms |
| Skeleton | Slow sweep across bars the text will fill | 2.8s loop |
| Settings pane | Active pane slides to the section | 420ms |
| Section scroll | Stage scrolls, no teleport | native smooth |
| Widget drag | Ghost follows the pointer on a spring, tilts with velocity; invalid drops spring home | 60fps rAF |
| Widget menu | Fade + 4px drop | 160ms |
| Motion preset | Calm: ×1.3, no shine/parallax/lift/stagger; Lively: ×0.8, 2px lift | — |
| Appearance knobs | Blur, grain, shadow, brightness instantly; density/accent after the save | 500ms |
| Verdict | Amber edge/text | 120ms |
| Disclosure | Chevron 90° | 150ms |
| Modal | Fade + 6px rise / fade | 240 / 140ms |
| Receipt | Fade; mint settles to mist | 180ms / 2.4s |
| Banner | Fade + 4px rise | 200ms |

Animate transform, opacity and colour; height/width only where it reports content (the `Why` panel's max-height, the settings pane, the 2px sync rail and the sync chip bar). Never animate `backdrop-filter` or `blur`. Glass surfaces enter with a transition (`@starting-style`), never with a filling animation. Exits shorter than entrances. Loops pause when hidden. Reduced motion: static aurora, no parallax, no shine, fades only, no rise/stagger/pulse/drift, the `Why` panel opens instantly, and search layers close immediately.

Performance is a second pass: keep blur static, avoid layout animation, cap ambient loops at three (aurora drift, wordmark shine, parallax). Tune after visual review.

---

## 12. Accessibility

4.5:1 against the rendered glass; 3:1 large. The theme guarantees mist and accent at 4.5:1 for the picture's 97th-percentile brightness at every glass density (60–150%) and with a manual accent, by solving the palette against the inset composite. Inset surfaces stay below the panel's density so text on them keeps the same ratio. One `<main>` per route; rail is labelled nav. Keyboard: `/`, `b`, `Esc`, arrows, Enter, Tab; shortcuts inert in dialogs. Dialog focus trap/return. Window controls labelled. Buttons and links keep the 2px ice outline; text fields and the command field show a 2px inner ice hairline so a mouse click never draws a blue halo around a field. `Why` is a real button with `aria-expanded`; the brand button is labelled `About Local Dashboard`; each list chip's `×` is labelled `Remove <value>`. Widget headers are drag handles for the pointer only: the same moves are buttons in the header menu and in Settings → Widgets; every control is labelled. The strict-grounding note is a `role="status"` with `Turn off` and `Got it`. Live regions: banner, sync outcome, briefing ready, search count, verdict. Persistent labels; placeholders are hints. 200% zoom reflows, no horizontal scroll. Cyrillic/emoji wrap anywhere. Coarse pointer targets 44px.

---

## 13. Content and tone

Sentence case; plain and factual. Buttons say what happens. Times 24-hour, dates `4 Nov`, masthead full weekday. Errors name cause and next step, no apologies. Privacy is stated in the welcome dialog and in `What it read`. No emoji, no decorative icons, no marketing voice. Mockups use realistic data only.

---

## 14. Mapping from the previous design

| Previous | Now |
|---|---|
| Masthead inside the page | Top bar with brand, command field, sync, window controls |
| Horizontal services rail | Vertical source rail with named stations and live state |
| Page padding as the shell | Wallpaper visible around content glass inside a frameless window |
| Inline search row | Command overlay under the top bar |
| Dashboard blocks on `--bg` | Hero/Today glass panels + briefing sheet |
| Settings route with stacked cards | Same shell + anchor nav + glass cards |
| `--bg`, `--surface`, `--raised` sage world | Void/aurora, glass, amber/mint/ice/coral |
| Unbounded for all display | Unbounded for wordmark + start number; Onest for display/reading |
| No cards on dashboard | Structured glass panels; no nested cards |

---

## 15. Non-goals

Light theme, theme toggle, photographic backgrounds inside panels, 3D renders, neon, particles, pointer-tracked tilt, charts, kanban, fake navigation, new sources, new data, mobile layout, anything that writes to a source. No activity feed or attention queue. A wallpaper is allowed only as the environment layer (§3.5).

---

## 16. Implementation checklist

- [ ] Tokens in `:root`; `color-scheme: dark`; no raw hex outside the token block.
- [ ] Aurora + grain are CSS/SVG, static layer, drift only with motion allowed.
- [ ] Wallpaper is optional, sits below the aurora, is dimmed behind the glass and falls back to Aurora.
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
