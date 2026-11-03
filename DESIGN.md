# DESIGN — Local Dashboard

**Status:** implemented. Tokens, components and motion live in `src/web/styles.css`; this document describes the current dark interface.
**Scope:** the whole desktop app — the dashboard route (masthead, services line, briefing, search), the settings route, the connection modal and dialogs.
**Character:** a quiet instrument in a dark room. One warm light, matte surfaces, precise labels, and motion only where something changed or where the eye is.

---

## 1. Intent

The dashboard answers two questions — where do I start, what happened — and offers one action: read the briefing or ask for a new one.

The screen is **a briefing page, not a dashboard of lists**. Everything else on it exists to prove the machine is in order and to get out of the way:

1. **Start here** — one sentence with one number, the single pile worth opening now.
2. **The services line** — every connected service as a station on one rail, with its last sync; the rail is also the sync progress.
3. **Today** — the next calendar events and the free windows left.
4. **The briefing** — the page's centre of gravity, set as a reading column with a marginal grid.
5. **Search** — a tool, not a section.
6. **Settings** — its own route.

Deliberately absent: the activity feed, the attention queue, status pills, the segmented sync bar, and cards on this route. The evidence affordance the feed owned (a vault diff in place) went with it; see §12.

Three reference ideas carry over: the palette specimen, the low-light desk photographs (warm light confined to one place, matte black around it), and the dark glass modal. Not carried over: photographic backgrounds, the macOS gradient wallpaper, 3D renders, neon.

---

## 2. Principles

1. **The briefing is the page.** No competing list shares its measure or its first viewport.
2. **Light is the signal.** Warm marks time, the suggestion, and the line being read. Sage marks action and health. Nothing else glows.
3. **Borders, not shadows.** Rules and one step of surface lightness separate things; shadow belongs only to layers that float above the page.
4. **One accent per meaning.** Sage = action/success, haze = information, sand = warm/time/attention, clay = error. A screen never shows more than two semantic colours at once.
5. **Mono for metadata, sans for reading.** Paths, times, counts, labels, station names are mono and small; sentences are sans.
6. **Motion reports state or position, it never performs.** A change gets 80–320ms; the reading rule is the only motion the eye follows; ambient loops are capped at two.
7. **Quiet density.** The reading column is airy; the top panel is compact. Whitespace separates sections instead of boxes inside boxes.
8. **Dark only.** No light theme, no toggle. `color-scheme: dark` is set so native controls, scrollbars and form widgets match.

---

## 3. Color

### 3.1 Palette (canon)

| # | Name | Hex | Role |
|---|------|-----|------|
| 01 | Obsidian | `#15191A` | Page background |
| 02 | Graphite | `#202627` | Settings cards, popovers' base |
| 03 | Slate | `#2B3334` | Raised panels, hover rows, modals |
| 04 | Iron | `#394243` | Decorative borders, dividers, the services rail at rest |
| 05 | Porcelain | `#E9E7E0` | Primary text |
| 06 | Mist | `#A6ADA7` | Secondary text, labels, station names |
| 07 | Sage | `#9BAF9E` | Primary accent: action, success, sync progress |
| 08 | Haze | `#879CB7` | Information, Drive source |
| 09 | Sand | `#BDA27A` | Warm highlight, time, the reading rule |
| 10 | Clay | `#B67F76` | Warnings, errors, destructive |

Two derived colours are allowed and no others: **Lichen** `#7F8F88` (browser station and dot only, never text) and **Void** `#0C0F10` (modal backdrop, recessed inputs).

### 3.2 Tokens

```css
:root {
  color-scheme: dark;

  --bg: #15191a;
  --surface: #202627;
  --raised: #2b3334;
  --sunken: #101415;
  --void: #0c0f10;

  --line: #394243;
  --line-strong: #6e7b7b;
  --line-soft: rgba(57, 66, 67, 0.55);

  --ink: #e9e7e0;
  --muted: #a6ada7;

  --accent: #9baf9e;
  --info: #879cb7;
  --warm: #bda27a;
  --danger: #b67f76;
  --accent-wash: rgba(155, 175, 158, 0.1);
  --info-wash: rgba(135, 156, 183, 0.1);
  --warm-wash: rgba(189, 162, 122, 0.1);
  --danger-wash: rgba(182, 127, 118, 0.12);

  --focus: #9baf9e;
  --selection: rgba(155, 175, 158, 0.25);

  --source-vault: #9baf9e;
  --source-drive: #879cb7;
  --source-mail: #bda27a;
  --source-calendar: #a6ada7;
  --source-browser: #7f8f88;
  --source-github: #e9e7e0;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;

  --font-sans: "Onest", "Segoe UI Variable Text", "Segoe UI", "Segoe UI Emoji", system-ui, sans-serif;
  --font-display: "Unbounded", "Onest", "Segoe UI Variable Display", "Segoe UI", sans-serif;
  --font-mono: "Cascadia Mono", "Cascadia Code", Consolas, ui-monospace, monospace;

  --shadow-sm: 0 6px 18px rgba(6, 8, 9, 0.35);
  --shadow-lg: 0 24px 60px rgba(6, 8, 9, 0.55);

  --dur-press: 80ms;
  --dur-hover: 120ms;
  --dur-reveal: 180ms;
  --dur-panel: 240ms;
  --dur-large: 320ms;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-out: cubic-bezier(0.4, 0, 1, 1);
}
```

### 3.3 Measured contrast

Text against surfaces (WCAG AA needs 4.5:1 for normal text):

| Foreground | on Obsidian | on Graphite | on Slate |
|---|---|---|---|
| Porcelain | 14.31 | 12.41 | 10.44 |
| Mist | 7.72 | 6.69 | 5.63 |
| Sage | 7.61 | 6.59 | 5.55 |
| Haze | 6.30 | 5.46 | 4.59 |
| Sand | 7.26 | 6.30 | 5.30 |
| Clay | 5.30 | 4.60 | **3.87 ✗** |

Non-text: Iron on Obsidian 1.72 — decorative only. `--line-strong` on Graphite 2.72 — paired with a persistent label, never the sole cue. Primary sage button with Obsidian text: 7.61.

**Consequences:**

- Clay text is never placed on Slate. Error text lives on Graphite or Obsidian; inside a raised panel use Porcelain text plus a clay mark or a 1px clay left rule.
- Lichen is a dot colour only (4.52 on Graphite); never text.
- Iron is decorative. Inputs always keep a visible label; focus adds the sage ring.
- The services rail and the line ticks are the only sub-3:1 marks; both always sit next to their own mono label or text, so neither is the sole cue.

### 3.4 Colour rules

- Backgrounds are never pure black in content areas. `--void` appears only behind modals.
- No large sage fills. Sage fill is reserved for the primary button and small success marks.
- Semantic washes replace coloured fills for banners and the suggestion block.
- Never convey state by hue alone: a station has its name and last sync; a status has words.
- User content (paths, subjects, note names) is never tinted, never uppercased. Only dots, station marks and metadata carry source colour.

### 3.5 Source colour

| Source | Token | Hex | Where it appears |
|---|---|---|---|
| Vault | `--source-vault` | `#9BAF9E` | Station mark, result dot |
| Drive | `--source-drive` | `#879CB7` | Station mark, result dot |
| Mail | `--source-mail` | `#BDA27A` | Station mark, result dot |
| Calendar | `--source-calendar` | `#A6ADA7` | Dots only (calendar has no station; it feeds the Today column) |
| Browser | `--source-browser` | `#7F8F88` | Station mark, result dot |
| GitHub | `--source-github` | `#E9E7E0` | Station mark, result dot |

Station marks are 10px round, `flex: none`, sitting on the rail with a 4px `--bg` ring that breaks the line under them. An unconfigured service is the same mark drawn hollow (`--line-strong` 1px ring); an errored one is Clay.

### 3.6 Semantic states

| State | Colour | Treatment |
|---|---|---|
| Connected / success | Sage | Rail fill, sync outcome glow, primary button |
| Syncing / in progress | Sage | The rail fills; the active station pulses |
| Information / neutral accent | Haze | Banners, links to external services |
| Time / today / warm | Sand | Event times, the suggestion rule, the reading tick |
| Warning / not connected | Mist | Hollow station, `—` in place of the time |
| Error / conflict | Clay | Station mark, conflict line, banner border |

---

## 4. Typography

Self-hosted web fonts: Unbounded for display and Onest for body, both under the SIL Open Font License in `src/web/fonts`. They load from disk, never a CDN. Cyrillic and emoji coverage is required; the fallback stack starts with Segoe UI.

| Token | Size / line | Weight | Case / tracking | Use |
|---|---|---|---|---|
| Masthead | 20 / 1.25 | 500 | sentence, -0.01em | `Local Dashboard` (Unbounded) |
| Start figure | 44 / 1 | 500 | sentence, -0.02em | The one count that says where to start (Unbounded) |
| Start sentence | 21 / 1.45 | 400 | sentence | The clause around the figure |
| Section | 11 / 1.4 | 500 | UPPERCASE mono, 0.14em | `BRIEFING`, `TODAY`, `GET STARTED`, `RESULTS FOR…`, suggestion label |
| Briefing | 17 / 1.75 | 400 | sentence | The briefing markdown only |
| Body | 15 / 1.6 | 400 | sentence | Settings, search rows |
| Small | 14 / 1.5 | 400 | sentence | Today events, result rows |
| Meta | 13 / 1.5 | 400 | mono 0.02em | Timestamps, start detail, connection detail |
| Micro | 12 / 1.4 | 400 | mono 0.06em | Station names, station times, stamps |
| Button | 14 / 1 | 500 | sentence | All buttons (mini: 13) |

Rules:

- Only these sizes. No 10px or 17px one-offs.
- `font-variant-numeric: tabular-nums` on times, dates, counts and sync numbers.
- Section labels and the suggestion label are the only uppercase text; never uppercase user content.
- Reading measure: 64ch for the briefing, 40ch for the start sentence, 70ch for settings descriptions.
- Links are Porcelain → Sage on hover with an underline; inside paragraphs they never rely on colour alone.
- Scale contrast carries the hierarchy: the start figure is the largest type on the page, the masthead is deliberately small. Nothing sits between them except the section label.

---

## 5. Space, radius, elevation

**Spacing** — 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 44.

- Page padding: 40px top, 32px sides, 96px bottom; 32/24 below 1100px; 20/16 below 700px.
- Top panel gap: 24px row, 56px column. Panel to services line: 40px. Line to search: 28px. Search to briefing: 40px.
- Briefing: margin column 176px (152 below 1100px), 40px gap, 22px above the top rule.
- Reading line gap: 15px. Inside the suggestion: 16px padding.
- Settings card padding: 22px; 16px below 700px.

**Radius** — `--radius-sm` 6px (inputs, chips), `--radius-md` 10px (buttons, search), `--radius-lg` 14px (settings cards, popovers, modals), pills 999px. The dashboard's top-level blocks are square; radius belongs to controls and to the settings route.

**Elevation**

| Level | Surface | Border | Shadow |
|---|---|---|---|
| Page / dashboard blocks | `--bg` | 1px `--line` rule only | none |
| Settings card | `--surface` | 1px `--line` | none |
| Popover, tooltip, suggestions | `--raised` | 1px `--line` | `--shadow-sm` |
| Modal | `--raised` | 1px `--line` | `--shadow-lg` |
| Backdrop | `--void` at 72% + `blur(10px)` | none | none |

The only ambient light: one static warm radial on the body (`1100px 520px at 12% -8%`, `--warm` at 5%). No second glow, no glow on cards.

---

## 6. Layout

### 6.1 Page shell

```css
.page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 32px 96px;
}
body {
  background:
    radial-gradient(1100px 520px at 12% -8%, rgba(189, 162, 122, 0.05), transparent 62%),
    var(--bg);
}
```

### 6.2 Dashboard order

1. **Masthead** — brand mark, `Local Dashboard`, weekday date on the left; `Sync`, `Settings` on the right.
2. **Top panel** — two columns. Left: the start sentence (`Start here: 88 awaiting your reply`) with the biggest type on the page, and its sender detail in mono. Right (360px): the `TODAY` column — event times in sand, free windows in sage, conflicts in clay.
3. **Services line** — one full-width row: vault, drive, mail, github, browser as stations on a 2px rail; name above, last sync below. During sync the rail fills and the active station pulses; the row is the `progressbar`.
4. **Search** — one row, full width, with `Search` and, after a search, `Clear`.
5. **Results** — only after a submitted search: a ruled list above the briefing.
6. **Briefing** — full-width 1px rule, then a two-column grid: the margin (label, stamp, `Briefing now`) and the reading column at 64ch. Per-line ticks in the margin of the text; the closing line is the suggestion. `Earlier briefings` is a native disclosure under the measure.
7. **Get started** — only while setup is incomplete; a single inline row above the search, no card.
8. **Note banner** — inline, above the panel, when present.

### 6.3 Settings route

Same `.page` shell, no sidebar. Header: `Settings` + ghost `Back to dashboard`. Then cards: Connections (group per service, divider between groups, hint beside each group name, rows for saved accounts), Application (data directory, `Copy diagnostics`, `Check for updates`), Preferences (numeric fields, textareas, source checkboxes, `Save preferences`). Connection modal 460px, confirm dialog 380px.

The settings route keeps cards; the dashboard keeps none. That difference is the hierarchy: reading surface vs configuration surface, not an inconsistency to smooth over.

### 6.4 Responsive

| Width | Behavior |
|---|---|
| > 1100 | Full 1180px layout, 176px margin column |
| 900–1100 | Page padding 24px, margin column 152px, briefing gap 32px |
| 700–900 | One column everywhere: panel stacks (start above today), briefing margin becomes one row above the measure, masthead may wrap |
| < 700 | Page padding 16px, start sentence 18px / figure 36px, search button on its own row, masthead actions on their own row |

No layout depends on a fixed pixel height for text. At 200% zoom the page must reflow without horizontal scrolling.

---

## 7. Components

### 7.1 Masthead

40px mark (image 36px) with a 9s orbit ring and a 4px sage node, title 20px Unbounded, date 13px mono Mist under it, actions right-aligned as ghost buttons. The orbit is the only decorative loop on the page.

### 7.2 Start

`Start here:` in Mist at 21px, the count in Unbounded 44px Porcelain, the clause in Porcelain at 21px, then a 13px mono detail line (Mist, links Mist → Sage with a 3px underline offset). No card, no label above, no supporting stats block — one sentence and one number.

When nothing needs attention: `Nothing needs attention.` in Mist at the sentence size, nothing else.

### 7.3 Services line

Full-width flex, stations evenly spaced, `space-between`. The rail is a 2px `--line` track at 28px from the top, rounded, with an `i` fill in `--accent` whose width is the sync progress (350ms linear). Stations: three rows of 17px / 12px / 17px with 6px gaps — name (12px mono Mist), 10px mark, time (12px mono Mist, tabular). First station aligns its children left, the last right, so the rail runs edge to edge.

States: `ok` mark in its source colour, `off` hollow, `bad` clay, `active` pulses 1.2s while running. Sync outcome flashes the rail's fill (sage glow on success, clay on error) for 1.6s. Never connected and never synced shows `—` rather than a time.

### 7.4 Today

A small stacked column, not chips: `TODAY` section label, then one line per event with the time in 13px mono Sand and the summary in 14px Porcelain; free windows in 13px Sage; conflicts in 13px Clay. `No events` or `Calendar not connected` in Mist when empty.

### 7.5 Search and suggestions

Input 42px, `--sunken`, 1px `--line`, radius 10px, 16px text, padding 0 12px, `aria-label` and a persistent placeholder. Focus: sage ring (2px, offset 2) and `--line-strong` border; no glow. `Search` is a ghost button; `Clear` appears after a result.

Suggestions: absolute below the input, 4px offset, `--raised`, radius 14px, `--shadow-sm`, `min(100%, 560px)`, max-height 320px. Group labels 11px mono uppercase Mist. Rows 36px, 14px text, hover/active `--surface`, keyboard-active adds a 2px sage inset bar. Fade + 2px rise, 120ms. Combobox semantics: `role="combobox"`, `aria-controls`, `aria-activedescendant`, option ids.

Results: a ruled list (no card) under a `RESULTS FOR “…”` label; rows 14px, padding 7px 8px, hover `--raised`, source dot, label wraps anywhere, detail right-aligned in mono.

### 7.6 Briefing

```css
.briefing {
  display: grid;
  grid-template-columns: 176px minmax(0, 64ch);
  column-gap: 40px;
  border-top: 1px solid var(--line);
  padding-top: 22px;
}
```

Margin: `BRIEFING` section label in Porcelain, the stamp in 12px mono Mist, then the single primary button. When today has no briefing yet, a second stamp reads `none for today yet`.

Reading column: 17px/1.75 Onest, `text-wrap: pretty`, 15px between entries. Every entry (bullet or paragraph) carries a 1px tick in the margin at `left: 2px`, `--line-strong` at 55%; the tick at the middle of the viewport turns Sand and grows to the line's full height (180ms). That tick is the page's signature motion: it reports where the eye is, and it is the only thing that moves while reading.

The closing entry is always the suggestion: `--warm-wash`, a 1px Sand left rule, 16px 18px padding, radius 0 6 6 0, and a `Suggestion` micro-label in Sand.

Generating: the button reads `Thinking…` and three skeleton lines (12px, 100/92/64%, `--raised`, 1.6s opacity pulse) replace the body. On arrival the top rule warms for 900ms and the body fades in.

`Earlier briefings`: native `<details>`, summary 14px Mist with a rotating `▸`, instant open, 150ms chevron.

### 7.7 Get started

One inline row: `GET STARTED` label, then the steps with 6px dot marks (filled Sage when done, hollow `--line-strong` when not), then a mini ghost `Open settings`. No card, no list borders. Disappears entirely once all three steps are done.

### 7.8 Note banner

Full width, padding 10px 12px, radius 10px, 13px Porcelain text, 1px border: info = haze wash/border, success = sage, error = clay. Inline in the flow above the panel, never a floating toast; `role="status"` / `aria-live="polite"`.

### 7.9 Buttons

- **Primary:** Sage fill, Obsidian text, radius 10px, height 36px, padding 0 16px. Hover `#A9BCAC`, active `#8FA592` and 1px down. One primary per view (`Briefing now`).
- **Ghost:** transparent, 1px `--line`, Porcelain. Hover `--raised` + `--line-strong`. Used for `Sync`, `Settings`, `Search`, `Clear`, `Back to dashboard`, `Cancel`.
- **Mini:** 28px, 13px text, ghost styling. Connection actions and `Open settings`.
- **Danger ghost:** ghost with Clay text and a 35% clay border; no solid red; destructive actions sit second and require the confirm dialog.

### 7.10 Forms and dialogs (settings route)

Unchanged from the incumbent system: fields with persistent 12px Mist labels, `--sunken` controls with radius 6px, 2px sage focus ring offset 2, Mist placeholders at 60%, native checkboxes with `accent-color`, autofill override, modal 460px on `--raised` with `--shadow-lg`, confirm dialog 380px, focus trapped and returned, Escape and backdrop click close.

### 7.11 Empty, loading, error

- Empty: one calm sentence in Mist; never an icon or an illustration.
- Loading: nothing renders before the first payload arrives — no false empty states, no placeholder lists. The briefing shows its skeleton only while generating.
- Error: banner with the cause and the next step; test results inline in sage or clay.
- Disabled: 40% opacity, no motion, `cursor: default`.

---

## 8. Motion

### 8.1 Principles

- Motion exists to explain what changed or where you are: something arrived, something is working, something failed, this line is being read.
- Fast and short. Everything interactive finishes under 320ms; only ambient loops are slower.
- Ease out, never bounce.
- One authored moment per state. Two infinite loops maximum on a screen; the dashboard runs one (the masthead orbit), and a second only while syncing (the active station's pulse).
- Refresh is not an event. The 60-second poll must not re-run entrance animations, flash rows or move the reading tick.

### 8.2 Tokens

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 80ms | Press displacement |
| `--dur-hover` | 120ms | Hover/colour feedback |
| `--dur-reveal` | 180ms | Rows, tick, small popovers |
| `--dur-panel` | 240ms | Modal, entrance |
| `--dur-large` | 320ms | Rare large surfaces |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | Standard/enter |
| `--ease-out` | `cubic-bezier(.4,0,1,1)` | Exit |
| progress | `linear` | Rail fill, spinners |

### 8.3 Catalog

| # | Element | Trigger | Motion | Duration / easing | Reduced motion |
|---|---|---|---|---|---|
| 1 | Page content | First mount only | Fade 0→1 + 4px rise; masthead, panel, line, search, briefing with 40ms stagger | 240ms `--ease` | Fade only |
| 2 | Start figure and sentence | Data arrives | Nothing beyond the mount fade — the number must not count up | — | — |
| 3 | Buttons | Hover / press | Colour 120ms; active 1px down | 120 / 80ms | Colour only |
| 4 | Rail fill | Sync running | Width 350ms linear to the real progress; outcome segment glows 1.6s | 350ms / 1.6s | Fills instantly |
| 5 | Active station | Sync running | Scale 1→1.35 and 12px sage glow, opacity breathing | 1.2s `ease-in-out` loop | Static |
| 6 | Reading tick | Scroll | The tick of the entry at mid-viewport turns Sand and spans the entry | 180ms `--ease` | Colour only, instant |
| 7 | Briefing generating | Click `Briefing now` | Label → `Thinking…`; 3 skeletons pulse; on arrival the top rule warms 900ms and the body fades in | 1.6s loop; 900ms / 240ms once | Skeletons static, no warm rule |
| 8 | Suggestion panel | Typing ≥2 chars | Fade + 2px rise | 120ms | Fade only |
| 9 | Active suggestion | Arrow keys / hover | Background 80ms; 2px sage bar appears instantly | 80ms | Instant |
| 10 | Earlier briefings chevron | `<details>` toggle | Rotate 90→180°; content opens instantly | 150ms | Instant |
| 11 | Settings route | Open/close | View transition cross-fade, no horizontal slide | 160 / 240ms | Instant |
| 12 | Modal | Open / close | Backdrop fades 200ms; dialog fades + 6px rise; exit 140ms | 240 / 140ms | Instant |
| 13 | Ambient rings (modal) | Modal open | Two circles drift ≤12px and rotate ≤2° | 24s linear alternate | Static |
| 14 | Masthead orbit | Always | 9s rotation; the node is the only lit point | 9s linear loop | Static |
| 15 | Hint tooltip | Hover / focus | Fade | 120ms | Instant |
| 16 | Connection test | Click `Test` | 14px spinner rotates; result colour fades in | 900ms linear; 240ms | Static `testing…` |
| 17 | Banner | Appears | Fade + 4px rise; exit 120ms | 200ms | Fade only |

Rules that apply to every row:

- Animate `transform`, `opacity` and `filter`; the rail may animate `width` (2px bar, cheap). Nothing else animates layout.
- No animation of `backdrop-filter` or `blur` — set the blur statically and fade the layer.
- Exit is always shorter than enter.
- Entrance animations run once per mount, never on the 60-second refresh.
- No motion may block input or delay a response to a click.
- Infinite motion is capped at two elements per screen.
- Loops pause when `document.hidden` (`body.motion-paused`); resume on visibility.
- No bounce, spring, parallax, particles, neon pulsing, scroll-triggered reveals, or counting numbers.

### 8.4 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 120ms !important;
    scroll-behavior: auto !important;
  }
}
```

With reduced motion: transforms are removed (no rise, no press, no ring drift), the station pulse stops, the skeleton stays static, the rail snaps, and the reading tick changes colour without easing. Nothing essential is lost — every state stays readable.

### 8.5 Performance budget

- 60fps on integrated graphics at 1180px.
- One IntersectionObserver for the reading tick, over the briefing entries only, re-created when the briefing changes.
- No animation library; CSS transitions and keyframes only.
- Blur only on the modal backdrop, ≤10px, one layer.
- A sync plus a 60-second refresh must cause no layout shift in the briefing.

---

## 9. Accessibility

- Text meets 4.5:1 (3:1 for ≥18.66px bold or ≥24px); see §3.3. Clay is never used on Slate.
- Focus: 2px `--focus` ring, 2px offset, `:focus-visible` only.
- Landmarks: one `<main>`; the services line is a labelled region; the rail is a `progressbar` with an accessible name only while syncing.
- Keyboard: Tab follows visual order; modals trap and return focus; Escape closes modal, suggestions and results; search keeps ArrowUp/Down/Enter/Escape; `/` focuses search, `b` generates, `<details>` stays native.
- Targets ≥32px for primary/ghost buttons, ≥24px for mini; 6px between adjacent targets.
- State is never colour-only: stations have names and times, errors have text, the suggestion has a label.
- Live regions: banner, test result, briefing completion. The 60-second poll is never announced.
- Inputs keep persistent labels (the search field uses `aria-label`); placeholders are hints.
- 200% zoom: no horizontal scroll, no clipped controls. Verified at 390px and 1294px.
- Scrollbars thin and dark; selection `--selection`; Cyrillic and emoji paths render untransformed with `overflow-wrap: anywhere`.

---

## 10. Content and tone

- Sentence case everywhere except mono micro-labels.
- Buttons say what happens: `Briefing now`, `Sync`, `Save preferences`, `Test`, `Disconnect`, `Open settings`.
- The start sentence is plain: `Start here:` + the count + the pile's own words (`awaiting your reply`, `unread mail`, `GitHub items`), then the senders in mono. Empty: `Nothing needs attention.`
- Errors name the cause and the next step: `Add a DeepSeek key in Settings -> Connections.` No apologies, no exclamation marks.
- Time: 24-hour, tabular, `09:37`; dates `3 Nov`, the masthead uses the full weekday.
- No emoji in the interface. No decorative icons; the hint `?` is the only glyph.

---

## 11. Mapping from the previous dashboard

| Previous | Now |
|---|---|
| Header + five status pills | Masthead with `Sync`/`Settings`, services moved to the line |
| Segmented sync bar above the cards | The services rail itself is the progress |
| `Today` chips | A `TODAY` column in the top panel |
| Two columns: Activity and Needs attention | Removed from the route; one start sentence replaces the queue |
| Vault row expanding into a diff | Removed with the feed (see §12) |
| Briefing as a card in the middle | The page: rule, margin, 64ch measure |
| `.pill`, `.syncbar`, `.today`, `.event`, `.attention`, `.diff` | Deleted; `.station`, `.network`, `.panel`, `.line` replace them |
| Search input with a glow on focus | Ring only, no glow |
| `li` styled globally as feed rows | List styling scoped to each component |

---

## 12. Non-goals and accepted losses

- Light theme, theme toggle, per-user themes.
- Photographic backgrounds, textures, grain, external font CDNs, 3D scenes, glass cards, neon, particles, parallax.
- A command palette, a navigation sidebar, or a second route on the dashboard.
- An activity feed, an attention queue, or any unbounded list on the dashboard. Accepted loss: the vault diff is no longer reachable from the UI, and the backlog beyond the single start item is only visible in mail, GitHub or the vault itself. If diffs return, they return inside the briefing's evidence, capped, never as a feed.
- Mobile-specific layouts below 700px beyond the single-column reflow.
- Anything that writes to a source.

If a future feature needs a new component, it reuses these tokens; a new colour or duration must be added here first.

---

## 13. Implementation checklist

- [x] Tokens in `:root`; `color-scheme: dark`.
- [x] Ten palette colours in their roles; no unlisted hex in the dashboard CSS.
- [x] Source colours on station marks and result dots; calendar has no station.
- [x] No cards on the dashboard; settings keeps `--surface` cards.
- [x] One sage primary per view (`Briefing now`).
- [x] Clay never on Slate.
- [x] `--line-strong` on inputs; persistent labels; sage focus ring.
- [x] The services line is the sync progressbar, labelled only while running.
- [x] Briefing skeleton only while generating; no entrance on the 60s refresh.
- [x] Reading tick is 1px, Sand, the only motion while reading; ≤2 infinite loops.
- [x] Reduced-motion block present; loops paused when hidden.
- [x] Thin dark scrollbars, dark selection, autofill override.
- [x] Cyrillic/emoji paths render; user content never uppercased.
- [x] 390px and 1294px without clipping or horizontal scroll; 200% zoom reflows.
- [x] Empty/loading/error/disabled states defined for every component.
- [x] `npm run build`, `tsc --noEmit` and `npm test` pass; Lighthouse accessibility 1.0.

---

*Source references: palette specimen (canon), “Quiet Intelligence” workspace sheet, low-light desk photography, matte-black interior, dark glass task modal, transit-line scheduling diagrams. The palette is authoritative; the photographs guide light and material, not literal imagery.*
