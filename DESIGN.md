# DESIGN — Local Dashboard

**Status:** design target. The current UI is light; this document replaces it. Implemented in `src/web/styles.css` and the existing components — no new features are introduced here.
**Scope:** the whole desktop app — dashboard, settings route, connection modal, search and suggestions, diffs, hints, banners.
**Character:** a quiet instrument in a dark room. One warm light, matte surfaces, precise labels, nothing that moves unless the state changed.

---

## 1. Intent

The screen answers two questions — what happened lately, what needs attention — and offers one action: read the briefing or ask for a new one. The design must feel local, private, and calm: closer to a well-made desk lamp than to a SaaS dashboard.

Three reference ideas carry over, the rest is discarded:

- the palette specimen — exact hues and names;
- the low-light desk photographs — warm light confined to one place, matte black around it;
- the dark glass modal — elevation through light and blur, never through colorful chrome.

Not carried over: photographic backgrounds, the macOS gradient wallpaper, 3D renders, neon.

---

## 2. Principles

1. **Light is the signal.** Warm light marks the briefing (the thing worth reading). Sage marks action and success. Nothing else glows.
2. **Borders, not shadows.** Cards are separated by a 1px line and one step of surface lightness. Shadow belongs only to layers that float above the page.
3. **One accent per meaning.** Sage = action/success, haze = information, sand = warm/time, clay = error. A screen never shows more than two semantic colors at once.
4. **Mono for metadata, sans for reading.** Paths, times, counts, labels, shortcuts are mono and small; sentences are sans.
5. **Motion reports state, it never performs.** A change gets 80–320ms; ambient light moves slower than the eye tracks. No bounce, no parallax.
6. **Quiet density.** Rows are compact but never cramped; whitespace separates sections instead of boxes inside boxes.
7. **Dark only.** No light theme, no toggle. `color-scheme: dark` is set so native controls, scrollbars and form widgets match.

---

## 3. Color

### 3.1 Palette (canon)

| # | Name | Hex | Role |
|---|------|-----|------|
| 01 | Obsidian | `#15191A` | Page background |
| 02 | Graphite | `#202627` | Cards, panels |
| 03 | Slate | `#2B3334` | Raised panels, hover rows, modals |
| 04 | Iron | `#394243` | Decorative borders, dividers |
| 05 | Porcelain | `#E9E7E0` | Primary text |
| 06 | Mist | `#A6ADA7` | Secondary text, labels |
| 07 | Sage | `#9BAF9E` | Primary accent: action, success, focus |
| 08 | Haze | `#879CB7` | Information, Drive source |
| 09 | Sand | `#BDA27A` | Warm highlight, time, briefing light |
| 10 | Clay | `#B67F76` | Warnings, errors, destructive |

Two derived colors are allowed and no others:

- **Lichen** `#7F8F88` — browser source dot only, never text.
- **Void** `#0C0F10` — modal backdrop and recessed input wells.

### 3.2 Tokens

```css
:root {
  color-scheme: dark;

  /* surfaces */
  --bg: #15191a;
  --surface: #202627;
  --raised: #2b3334;
  --sunken: #101415;
  --void: #0c0f10;

  /* lines */
  --line: #394243;
  --line-strong: #6e7b7b;
  --line-soft: rgba(57, 66, 67, 0.55);

  /* text */
  --ink: #e9e7e0;
  --muted: #a6ada7;

  /* semantic */
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

  /* sources */
  --source-vault: #9baf9e;
  --source-drive: #879cb7;
  --source-mail: #bda27a;
  --source-calendar: #a6ada7;
  --source-browser: #7f8f88;
  --source-github: #e9e7e0;

  /* shape */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;

  /* type */
  --font-sans: "Segoe UI Variable Text", "Segoe UI", "Segoe UI Emoji", system-ui, sans-serif;
  --font-mono: "Cascadia Mono", "Cascadia Code", Consolas, ui-monospace, monospace;

  /* elevation */
  --shadow-sm: 0 6px 18px rgba(6, 8, 9, 0.35);
  --shadow-lg: 0 24px 60px rgba(6, 8, 9, 0.55);

  /* motion */
  --dur-press: 80ms;
  --dur-hover: 120ms;
  --dur-reveal: 180ms;
  --dur-panel: 240ms;
  --dur-large: 320ms;
  --dur-ambient: 24s;
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

- Clay text is never placed on Slate. Error text lives on Graphite or Obsidian; inside a raised panel use Porcelain text plus a clay icon or a clay left border.
- Lichen is a dot color only (4.52 on Graphite); never text.
- Iron borders are decorative. Inputs always keep a visible label; focus adds the sage ring. If strict WCAG 1.4.11 is required, raise `--line-strong` to `#8E9999` (5.24 on Graphite).

### 3.4 Color rules

- Backgrounds are never pure black in content areas. `--void` appears only behind modals.
- No large sage fills. Sage fill is reserved for the single primary button in a view and for small success marks.
- Semantic washes (`*-wash`) replace colored fills for banners, chips and badges; text on a wash stays Porcelain or the matching semantic hue where contrast allows.
- Never convey state by hue alone: a dot always sits next to a label; a status pill always has words.
- User content (paths, subjects, note names) is never tinted by the interface; only dots and metadata carry source color.

### 3.5 Source dots

| Source | Token | Hex | Graphite contrast |
|---|---|---|---|
| Vault | `--source-vault` | `#9BAF9E` | 6.59 |
| Drive | `--source-drive` | `#879CB7` | 5.46 |
| Mail | `--source-mail` | `#BDA27A` | 6.30 |
| Calendar | `--source-calendar` | `#A6ADA7` | 6.69 |
| Browser | `--source-browser` | `#7F8F88` | 4.52 |
| GitHub | `--source-github` | `#E9E7E0` | 12.41 |

Dot: 7px, fully round, `flex: none`, vertically aligned to the first line of text. All six must be defined — the current CSS only styles vault, drive and mail.

### 3.6 Semantic states

| State | Color | Treatment |
|---|---|---|
| Connected / success | Sage | text or dot; `--accent-wash` background |
| Syncing / in progress | Sage | animated bar and dot |
| Information / neutral accent | Haze | icons, links to external services |
| Time / today / warm | Sand | times, briefing glow, current event |
| Warning / not connected | Mist | pill text, no wash |
| Error / conflict | Clay | text, 1px border or left rule, `--danger-wash` |

---

## 4. Typography

No web fonts: the app is local and must render offline and instantly. Windows-first stack; Cyrillic comes from Segoe UI, emoji from Segoe UI Emoji.

| Token | Size / line | Weight | Case / tracking | Use |
|---|---|---|---|---|
| Display | 24 / 1.25 | 600 | sentence, -0.015em | Page title `Local Dashboard` |
| Section | 11 / 1.4 | 500 | UPPERCASE mono, 0.14em | Card headings, `TODAY`, group labels |
| Card title | 14 / 1.4 | 600 | sentence | Connection group names, `Earlier briefings` |
| Body | 15 / 1.6 | 400 | sentence | Lists, settings, search results |
| Briefing | 16 / 1.7 | 400 | sentence | Briefing markdown only |
| Small | 12 / 1.45 | 400 | sentence | Metadata, hints, test results |
| Micro | 11 / 1.4 | 500 | mono, 0.06em | Timestamps, counts, shortcuts, kinds |
| Button | 13 / 1 | 500 | sentence | All buttons |

Rules:

- Only these sizes. No 10px or 17px one-offs.
- `font-variant-numeric: tabular-nums` on times, dates, counts and sync numbers.
- Section labels are the only uppercase text; never uppercase user content (paths, subjects, note names).
- Body measure: briefing capped at 72ch; settings descriptions at 62ch.
- Links use Porcelain → Sage on hover, with an underline. They never rely on color alone at rest if they appear inside a paragraph.
- Inputs and buttons inherit `--font-sans`; never set a smaller font inside a control to make it fit.

---

## 5. Space, radius, elevation

**Spacing** — 4px base: 4, 8, 12, 16, 20, 24, 32, 48.

- Page padding: 32px; 24px below 900px.
- Card padding: 20px; 16px below 700px.
- Gap between cards: 16px; between sections inside a card: 16px.
- List row: 6px vertical, 8px horizontal on hover surfaces.
- Header to first card: 24px.

**Radius** — `--radius-sm` 6px (inputs, chips, tags), `--radius-md` 10px (buttons, notes, diffs, suggestion rows), `--radius-lg` 14px (cards, popovers, modals). Pills are 999px.

**Elevation**

| Level | Surface | Border | Shadow |
|---|---|---|---|
| Page | `--bg` | none | none |
| Card | `--surface` | 1px `--line` | none |
| Popover, tooltip, suggestions | `--raised` | 1px `--line` | `--shadow-sm` |
| Modal | `--raised` | 1px `--line` | `--shadow-lg` |
| Backdrop | `--void` at 72% + `blur(10px)` | none | none |

The briefing card is the only element with ambient light: a static radial gradient of `--warm` at 5–7% in its top-left corner, plus the optional breathing described in §8.

---

## 6. Layout

### 6.1 Page shell

```css
.page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 32px 80px;
}
body {
  background:
    radial-gradient(1100px 520px at 12% -8%, rgba(189, 162, 122, 0.05), transparent 62%),
    var(--bg);
}
```

One warm gradient, static, top-left. No second glow, no noise texture.

### 6.2 Dashboard order

1. **Header** — title + weekday/date on the left; status pills, `Sync`, `Settings` on the right. Wraps below 900px; actions stay together.
2. **Sync bar** — only while `status.sync.running`. Full width, 3px segments, 4px gaps. Disappears when idle.
3. **Note banner** — inline, full width, when present.
4. **Today strip** — mono label `TODAY` + event chips. Hidden when there are no events.
5. **Search** — input + `Search` button; `Clear` appears after a search. Suggestions float below the input.
6. **Results card** — only after a submitted search; full width.
7. **Briefing hero** — full width, the visual center. Heading row: section label + `Briefing now` (the only primary button on the screen). Timestamp in micro. Markdown body. `Earlier briefings` as a native disclosure.
8. **Two columns** — Activity `minmax(0, 1.15fr)` and Needs attention `minmax(0, 1fr)`, 16px gap, aligned to the top. Single column below 900px, Activity first.

### 6.3 Settings route

Same `.page` shell, no sidebar. Header: `Settings` + ghost `Back to dashboard`.

1. Connections card — group per service, divider between groups, hint icon beside each group name, rows for saved accounts, `Connect` / `+ Add account` on the right.
2. Preferences card — numeric fields, three textareas, source checkboxes, `Save preferences`.
3. Connection modal — 460px, opens over the settings route, keeps scroll position underneath.
4. Confirm dialog — 380px, replaces `window.confirm` for disconnect.

### 6.4 Responsive

| Width | Behavior |
|---|---|
| > 1100 | Full 1180px layout |
| 900–1100 | Columns stay, gap 12px, page padding 24px |
| 700–900 | One column; header stacks with actions on their own row |
| < 700 | Page padding 16px; status pills wrap; modal becomes 100% wide with 16px margins; search button moves below the input |

No layout depends on a fixed pixel height for text. At 200% zoom the page must reflow without horizontal scrolling.

---

## 7. Components

### 7.1 Card

`background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 20px;`
No hover state — cards are not clickable. Section heading inside uses the mono `Section` style in Mist.

### 7.2 Status pill

Height 26px, `padding: 3px 10px`, radius pill, `font: 11px mono`, 1px border, Graphite background.
States: connected (Sage text, `--accent-wash`, Sage border at 35%), not connected (Mist text, `--line`), error (Clay text, `--danger-wash`, Clay border at 35%). Hover: border-color Sage/Mist at 55%, 120ms; no lift, no shadow. Focus: sage ring.

### 7.3 Event chip

Height 28px, radius pill, 12px text, Graphite, 1px line. Time in Sand, mono, tabular. Conflict variant: `--danger-wash`, Clay border, Clay text. Free-window variant: `--accent-wash`, Sage border, Sage text. The `TODAY` label is mono 11px Mist with `margin-right: 8px`.

### 7.4 Buttons

- **Primary:** Sage `#9BAF9E` fill, Obsidian text, radius 10px, height 34px, padding 0 14px. Hover lightens to `#A9BCAC`; active moves down 1px and darkens to `#8FA592`. Disabled: 40% opacity, no transform. One primary per view.
- **Ghost:** transparent, 1px `--line`, Porcelain text. Hover: `--raised` background, border `--line-strong`. Active: 1px down. Used for `Sync`, `Settings`, `Search`, `Clear`, `Back to dashboard`, `Cancel`.
- **Mini:** height 26px, `padding: 2px 9px`, 12px text, ghost styling. Used for connection actions.
- **Danger ghost:** ghost with Clay text and Clay border at 35%; hover background `--danger-wash`. No solid red buttons; destructive actions always sit second and require the confirm dialog.
- Icons, when added later, are 16px and inherit the text color.

### 7.5 Search and suggestions

Input: height 40px, `--sunken` background, 1px `--line`, radius 10px, 15px text, padding 0 12px. Placeholder Mist at 65% opacity. Focus: sage ring, border `--line-strong`. The search row gap is 8px; the input takes the remaining width.

Suggestions: absolute below the input, 4px offset, `--raised`, radius 14px, `--shadow-sm`, max-height 320px, scroll. Group labels mono 10px uppercase Mist, padding 8px 12px 4px. Each row 34px, 13px text, hover/active `--surface` or `--slate`; keyboard-active also gets a 2px Sage inset bar on the left. Source dot at the start, label truncates with ellipsis, detail on the right in 12px Mist. No animation beyond a 120ms fade + 2px rise.

Results card: rows reuse `.result`; hover `--raised`; source dot, label, 12px Mist detail. Empty result: one line, Mist.

### 7.6 Lists and rows

Rows use `border-bottom: 1px solid var(--line-soft)` and no zebra stripes. Last row has no border. Padding 6px 0. Source dot, label (Porcelain, `overflow-wrap: anywhere`), detail right-aligned (12px Mist, `white-space: nowrap` only when it cannot overflow on narrow screens).

Clickable rows (vault diff, results) get a 6px horizontal negative margin and 8px padding so the hover surface (`--raised`, radius 6px) has room. Hover 120ms; no underline on the row, underline the label only.

Attention rows: mono kind tag (10px uppercase, 1px line, radius 4px, Mist) → label → count badge (`--accent-wash`, Sage text, 11px) → detail below on narrow widths.

Day headings: 11px mono uppercase Mist, 12px top margin.

### 7.7 Diff

`<pre>` in `--sunken`, 1px `--line`, radius 10px, 12px mono, 1.55 line height, padding 10px 12px, `white-space: pre-wrap; overflow-wrap: anywhere`. Opens under the row at full width. Animate the wrapper with the 0fr → 1fr grid technique, 180ms `--ease`; reduced motion opens instantly. The trigger is the row label itself, with `aria-expanded`.

### 7.8 Briefing

The hero card gets `background-image: radial-gradient(420px 260px at 6% 0%, rgba(189,162,122,.07), transparent 70%)` on top of `--surface`.

Header row: section label left, `Briefing now` right. Timestamp 11px mono Mist, tabular. Body 16px/1.7 Porcelain, max 72ch, `white-space: pre-wrap`. Bullets in the markdown keep their own markers — do not restyle markdown into cards.

Empty state: one sentence, Mist, no illustration, no icon. When generating, the button reads `Thinking…` and three skeleton lines replace the body (see §8). `Earlier briefings` uses the native `<details>` with a `summary` in 13px Mist; open state is instant (no height animation), chevron rotates 150ms.

### 7.9 Note banner

Full width, padding 10px 12px, radius 10px, 13px text, Porcelain text, 1px border. Default/info: Haze wash and border. Success: Sage wash and border. Error: Clay wash, Clay border at 35%, clay icon or left rule. It appears inline in the flow, never as a floating toast; the page must not jump — reserve the space or insert above cards. `role="status"` / `aria-live="polite"`.

### 7.10 Forms (settings)

- Field: label 12px Mist, block, 6px below to the control; helper text 12px Mist; error 12px Clay on Graphite only.
- Input/textarea: `--sunken` background, 1px `--line`, radius 6px, 15px text, padding 8px 10px; textarea min 3 rows, `resize: vertical`.
- Focus: 2px Sage ring, offset 2px, plus `--line-strong` border.
- Placeholder: Mist at 60%; never the only label.
- Autofill: override Chrome's yellow with an inset `--sunken` box-shadow and Porcelain text (`-webkit-autofill`).
- Checkbox: native control, 16px, `accent-color: var(--accent)`; label 13px Porcelain, 6px gap, clickable over the whole label.
- Fieldset (`Sources in the briefing`): 1px `--line`, radius 10px, padding 8px 12px; legend 11px mono Mist, padding 0 4px.
- Number inputs: keep native spinners; dark color-scheme handles them.
- Settings card headings use the mono Section style; group headings 14px/600.

### 7.11 Hint

18px circle, 1px `--line`, Mist `?`, `cursor: help`, `tabIndex={0}` and `aria-describedby` pointing at the tip. Tooltip: 320px wide, `--raised`, 1px `--line`, `--shadow-sm`, radius 10px, padding 10px 12px, 12px text, `white-space: pre-line`, opens below-left of the icon. Fade 120ms, no delay on keyboard, closes on Escape and blur. Must not be clipped by a scrolling card — use `position: fixed` when needed.

### 7.12 Modal

Backdrop: `--void` at 72% opacity, `backdrop-filter: blur(10px)`, 16px padding, centered. Dialog: 460px, max-height 90vh, `--raised`, 1px `--line`, radius 14px, `--shadow-lg`, padding 20px, scrolls internally.

Decorative ambient: two 480px circles, 1px Iron at 30%, one upper-right and one lower-left behind the dialog, clipped by the backdrop. Static; they may drift only when the modal is open (§8).

Behaviour: focus moves to the first field (`autoFocus` already exists), Escape closes, backdrop click closes, focus is trapped while open and returned to the trigger on close. Title is the dialog's accessible name; `role="dialog"`, `aria-modal="true"`.

### 7.13 Confirm dialog

380px, same surface as the modal. Message 14px Porcelain; question names the account. Actions right-aligned: `Cancel` ghost, then destructive ghost (`Disconnect`). No `window.confirm`. On confirm, the dialog closes, the row disappears and the banner confirms; on failure, the banner carries the error.

### 7.14 Connection row

Dot (8px, semantic), label 13px Porcelain, detail 12px Mist, actions right-aligned in a wrapping row. `Test` shows `testing…` in 12px Mist with a 14px spinner; the result replaces it in Sage or Clay, `aria-live="polite"`. Divider 1px `--line-soft` between groups, none before the first.

### 7.15 Empty, loading, error

- Empty: one sentence in Mist, 13px, no icon, no illustration.
- Loading (briefing only): three skeleton lines, `--raised`, heights 12px, widths 100/92/64%, 8px gap, radius 6px, opacity pulse 1.6s.
- Error: banner with the actual cause and the next step (existing copy is good). Never a modal for a recoverable error.
- Disabled: 40% opacity; no motion; `cursor: default`.

---

## 8. Motion

### 8.1 Principles

- Motion exists to explain what changed: something arrived, something is working, something failed.
- Fast and short. Everything interactive finishes under 320ms. Only ambient light is slower.
- Ease out, never bounce. Motion decelerates into place; nothing overshoots.
- One moving thing at a time. Two ambient loops maximum on a screen; everything else is a response.
- Refresh is not an event. Background polling (every 60s) must not re-run entrance animations or flash rows.

### 8.2 Tokens

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 80ms | Press displacement |
| `--dur-hover` | 120ms | Hover/color feedback |
| `--dur-reveal` | 180ms | Rows, diff, small popovers |
| `--dur-panel` | 240ms | Modal, sync bar entry |
| `--dur-large` | 320ms | Rare large surfaces |
| `--dur-ambient` | 24s | Background drift |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | Standard/enter |
| `--ease-out` | `cubic-bezier(.4,0,1,1)` | Exit |
| progress | `linear` | Progress bars, spinners |

### 8.3 Catalog

| # | Element | Trigger | Motion | Duration / easing | Reduced motion |
|---|---|---|---|---|---|
| 1 | Page content | First mount only | Fade 0→1 + 4px rise; header, then cards with 40ms stagger | 240ms `--ease` | Fade only, no stagger |
| 2 | Cards | — | No entrance on refresh, no hover lift | — | — |
| 3 | Buttons | Hover / press | Background and border 120ms; active `translateY(1px)` | 120 / 80ms `--ease` | Color only |
| 4 | Status pill | Hover / state change | Border and background 120ms; changing state cross-fades background 240ms | 120 / 240ms | Color only |
| 5 | Sync bar | Sync starts | Bar fades in 200ms; segment fill width 350ms linear; active segment breathes opacity .55↔.85 | 2.4s loop, `ease-in-out` | Static bar, no breathing |
| 6 | Status dot (degraded/error) | Persistent | Opacity breath 1→.55→1 | 2.4s loop | Static |
| 7 | Briefing generating | Click `Briefing now` | Label → `Thinking…`; body → 3 skeletons pulsing opacity .45↔.75; on arrival skeletons fade out 120ms and one Sand glow pulse | 1.6s loop; glow 600ms once | Skeletons static; no glow |
| 8 | Suggestion panel | Typing ≥2 chars | Fade + 2px rise | 120ms `--ease` | Fade only |
| 9 | Active suggestion | Arrow keys / hover | Background 80ms; 2px Sage bar appears instantly | 80ms | Instant |
| 10 | Diff | Toggle row | Wrapper `grid-template-rows: 0fr → 1fr` + opacity | 180ms `--ease` | Instant open |
| 11 | Earlier briefings chevron | `<details>` toggle | Rotate 90→180deg; content opens instantly | 150ms | Instant |
| 12 | Settings route | Open/close | Cross-fade content, no horizontal slide | 160ms | Instant |
| 13 | Modal | Open / close | Backdrop fades 200ms; dialog fades + 6px rise; exit 140ms | 240 / 140ms `--ease` | Instant |
| 14 | Ambient rings (modal) | Modal open | Two circles drift ≤12px and rotate ≤2deg | 24s `linear`, alternate | Static |
| 15 | Briefing glow | Always while visible | Opacity .05↔.08 | 12s `ease-in-out`, alternate | Static |
| 16 | Hint tooltip | Hover / focus | Fade | 120ms | Instant |
| 17 | Connection test | Click `Test` | 14px spinner rotates; result color fades in | 900ms linear; 240ms | Static `testing…`, no spinner |
| 18 | Banner | Appears | Fade + 4px rise; exit 120ms | 200ms | Fade only |
| 19 | Result rows | Hover | Background 120ms | 120ms | Color only |

Rules that apply to every row:

- Animate `transform`, `opacity`, and `filter` only. The sync segment may animate `width` (3px bar, cheap); the diff may animate its wrapper rows. Nothing else animates layout.
- No animation of `backdrop-filter` or `blur` — set the blur statically and fade the layer.
- Exit is always shorter than enter.
- Entrance animations run once per mount, never on the 60-second refresh. Track first paint with a ref, not a timer.
- No motion may block input or delay a response to a click.
- Infinite motion is capped at two elements per screen (status dot + sync segment, or briefing glow + modal rings — never all four).
- Loops pause when `document.hidden`; resume on visibility. CSS `animation-play-state: paused` is enough.
- No bounce, spring, parallax, particles, neon pulsing, or scroll-triggered effects.

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

With reduced motion: all transforms are removed (no 4px rise, no 1px press, no ring drift), opacity fades stay at ≤120ms, ambient loops stop, spinners become static text, and the diff/settings/modal open instantly. Nothing essential is lost — every state is still readable.

### 8.5 Performance budget

- 60fps on integrated graphics at 1180px.
- No animation on lists longer than 100 rows; staggering stops after the first six items.
- No animation library; CSS transitions and keyframes only.
- Blur only on the modal backdrop, ≤10px, one layer.
- Verify with the browser performance panel that a sync + 60s refresh causes no layout shift (CLS) in the feed.

---

## 9. Accessibility

- Text meets 4.5:1 (3:1 for ≥18.66px bold or ≥24px). See §3.3 for the measured pairs; clay never on slate.
- Focus: 2px `--focus` ring, 2px offset, `:focus-visible` only. Never remove the outline without replacing it.
- Keyboard: Tab order follows visual order; modal traps focus and returns it; Escape closes modal, suggestions and hint; search keeps ArrowUp/Down/Enter/Escape; `<details>` stays native.
- Targets: ≥32px for primary/ghost buttons, ≥24px for mini buttons (WCAG 2.2 minimum); 6px gap between adjacent targets.
- State is never color-only: dots have labels, pills have words, test results have text, the sync bar has `role="progressbar"` with an accessible name.
- Live regions: banner (`role="status"`), test result and briefing completion (`aria-live="polite"`). Do not announce the 60-second poll.
- Form controls keep persistent labels; placeholders are hints, not names. Errors are text, attached with `aria-describedby`.
- 200% zoom: no horizontal scroll, no clipped controls, no fixed-height text boxes. 125%/150% Windows scaling is the expected default.
- Scrollbars: thin, `--line` thumb on `--surface`, via `scrollbar-color`; `color-scheme: dark` covers native widgets.
- Selection: `--selection`.
- Cyrillic and emoji in vault paths must render in the sans stack at full size; no `text-transform` on user content; `overflow-wrap: anywhere` instead of truncating paths in rows.
- Images: none. If a decorative image is ever added, it is `aria-hidden` and has no motion.

---

## 10. Content and tone

- Sentence case everywhere except mono micro-labels.
- Buttons say what happens: `Briefing now`, `Sync`, `Save preferences`, `Test`, `Disconnect`. Keep the existing copy.
- Errors name the cause and the next step: `Add DEEPSEEK_API_KEY to .env and restart the server.` No apologies, no exclamation marks, no `Oops`.
- Empty states are one calm sentence: `Nothing needs attention.`
- Time: locale-formatted, tabular; `09:37` and `3 Nov`. Dates in the header use the full weekday.
- Counts: `×3` in the sage badge; source totals in pills as `mail · 2`.
- No emoji in the interface. No decorative icons; the hint `?` is the only glyph.

---

## 11. Mapping from the current CSS

| Current | New |
|---|---|
| `--bg #f6f5f2` | `--bg #15191A` |
| `--card #ffffff` | `--surface #202627` |
| `--ink #1f1f1d` | `--ink #E9E7E0` |
| `--muted #77736a` | `--muted #A6ADA7` |
| `--line #e4e1d9` | `--line #394243` (+ `--line-strong` for controls) |
| `--accent #2f6f52` | `--accent #9BAF9E` |
| `.pill.ok` / `.bad` | Sage / Clay pill variants; add `.off` (Mist) |
| `.dot.vault/.drive/.mail` | Six source tokens from §3.5 |
| `.dot.ok/.bad` | Sage / Clay |
| `.note` | Banner with info/success/error variants |
| `button` (black fill) | Ghost by default; Sage primary only for `Briefing now` |
| `.card` radius 12 / padding 18 | radius 14 / padding 20 |
| `box-shadow` on pills, suggestions, hints | Only popovers and modal keep shadows |
| hover `translateY(-1px)` on pills | Removed — border/color only |
| `window.confirm` (disconnect) | Confirm dialog §7.13 |
| `.hint .tip { display: none/block }` | Fade 120ms + `aria-describedby` |
| `font: 15px "Segoe UI"` | `--font-sans` stack; `--font-mono` for meta |

Keep class names where possible (`page`, `card`, `pill`, `today`, `event`, `suggest`, `result`, `diff`, `note`, `modal`, `conn-row`) — this is a restyle, not a rewrite.

---

## 12. Non-goals

- Light theme, theme toggle, per-user themes.
- Photographic backgrounds, textures, grain overlays, external fonts, 3D or glass cards (blur is modal-only).
- Neon glow, animated gradients on cards, particles, parallax, scroll-jacking, JS animation libraries.
- A command palette, new keyboard shortcuts, or a navigation sidebar. Search stays inline; settings stays a route.
- Changes to information architecture, copy, features or data. This document styles what exists.
- Mobile-specific layouts below 700px beyond the single-column reflow.

If a future feature needs a new component, it reuses these tokens; a new color or duration must be added here first.

---

## 13. Implementation checklist

- [ ] Tokens in `:root`; `color-scheme: dark` on `html`.
- [ ] All ten palette colors used only in their roles; no unlisted hex in CSS.
- [ ] Six source dots defined and used in feed, results and suggestions.
- [ ] Cards: Graphite, Iron border, radius 14, padding 20, no shadow.
- [ ] Sage primary button used exactly once per view (`Briefing now`).
- [ ] Clay text never on Slate; measured pairs from §3.3 respected.
- [ ] `--line-strong` on inputs; persistent labels; sage focus ring visible.
- [ ] `window.confirm` replaced by the confirm dialog; focus trap and return.
- [ ] Modal backdrop blur 10px, ambient rings static or paused; Escape and backdrop click close.
- [ ] Briefing skeleton only while generating; first-paint stagger only on mount; no animation on the 60s refresh.
- [ ] Reduced-motion block present; loops paused when hidden; ≤2 infinite motions.
- [ ] Test spinner has a static reduced-motion equivalent; live regions announce results.
- [ ] Thin dark scrollbars, dark selection, autofill override.
- [ ] Cyrillic/emoji paths render; no uppercase transform on user content.
- [ ] 200% zoom, 125%/150% Windows scaling, and 760px width checked without clipping.
- [ ] Empty/loading/error/disabled states styled for every component in §7.
- [ ] `npm run build` and `npm test` pass; visual pass at 1180px and 760px.

---

*Source references: palette specimen (canon), “Quiet Intelligence” workspace sheet, low-light desk photography, matte-black interior, dark glass task modal, command-menu panel. The palette is authoritative; the photographs guide light and material, not literal imagery.*
