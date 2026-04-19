# Handoff: Flox Redesign (Notion / Claude Code style)

## Overview
A visual + interaction redesign of the **Flox** Chrome extension — a tab planner that auto-groups tabs into tasks, flags stale ones, and supports stash/restore. This handoff covers **both** surfaces:
- **Popup** (`src/popup/main.tsx`) — 380×560, opens from toolbar
- **Dashboard** (`src/dashboard/main.tsx`) — full page, three-pane

The brief was to drop the current "dense dashboard" feel and move to a quiet editorial Notion / Claude Code style: warm paper palette, Instrument Serif headings, generous whitespace, one accent color. No feature additions — just fewer, clearer moves.

## About the Design Files
The `Flox Redesign.html` file in this bundle is a **design reference**, not production code. It's a single-file HTML prototype using vanilla templates + inline styles so the look and information hierarchy are unambiguous.

Your job is to **recreate this design inside the existing Flox codebase** (Vite + React + TypeScript + Tailwind + CRXJS). Keep the current file layout — just change the JSX structure, Tailwind classes, and tokens in `src/styles.css`. Do not ship the HTML prototype itself.

## Fidelity
**High-fidelity.** Colors, type scale, spacing and component structure are final. Copy exactly unless you have a strong reason. Tweaks panel + light/dark are supported.

---

## Design Tokens

Add these to `src/styles.css` as CSS variables (they replace the ad-hoc zinc/amber palette). Tailwind can continue to work alongside — just reference `var(--ink)` / `var(--paper)` etc. in class-based utilities where needed, or extend `tailwind.config.js` with these as named colors.

```css
:root {
  /* warm paper */
  --paper:        #FAF9F6;
  --paper-2:      #F4F2EC;
  --paper-3:      #EDEAE1;
  --line:         #E4E0D4;
  --line-strong:  #D4CFBF;
  --ink:          #26231E;
  --ink-2:        #3E3A33;
  --muted:        #7A7469;
  --muted-2:      #A59E90;

  /* accent (user-switchable via Tweaks — default olive) */
  --accent-h:     90;
  --accent:       oklch(0.58 0.09 var(--accent-h));
  --accent-soft:  oklch(0.92 0.04 var(--accent-h));
  --accent-ink:   oklch(0.32 0.06 var(--accent-h));

  /* signal (stale) */
  --signal:       oklch(0.64 0.09 30);
  --signal-soft:  oklch(0.94 0.03 30);

  --radius:       6px;
  --radius-lg:    10px;
  --shadow-sm:    0 1px 0 rgba(0,0,0,0.02), 0 1px 2px rgba(38,35,30,0.04);
  --shadow-md:    0 2px 4px rgba(38,35,30,0.04), 0 8px 24px rgba(38,35,30,0.06);
}
.dark {
  --paper: #1A1815;  --paper-2: #211E1A;  --paper-3: #272420;
  --line:  #34302A;  --line-strong: #433E37;
  --ink:   #EDE8DD;  --ink-2: #C9C2B4;
  --muted: #8A8374;  --muted-2: #64604F;
  --accent:       oklch(0.72 0.09 var(--accent-h));
  --accent-soft:  oklch(0.28 0.05 var(--accent-h));
  --accent-ink:   oklch(0.82 0.06 var(--accent-h));
  --signal:       oklch(0.72 0.09 30);
  --signal-soft:  oklch(0.28 0.04 30);
}
```

### Accent hues (for the theme swatch swatches)
- olive `90`, clay `45`, rose `20`, slate `250`, moss `140`

### Typography

Load from Google Fonts in `index.html` / `popup.html` / `dashboard.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
```

**Three faces, used with strict discipline:**
| Role | Family | Notes |
|---|---|---|
| UI body / buttons / lists | Inter Tight 400/500/600 | default body font |
| Display headings & quotes | Instrument Serif 400 (+ italic) | `.serif` — page titles, the wordmark, note bodies |
| Meta / timestamps / rules / URLs | JetBrains Mono 400/500 | `.mono`, tabular |
| **All numeric stats** | Inter Tight 500 | `.num` class: `font-variant-numeric: tabular-nums lining-nums; letter-spacing: -0.02em` — **not** serif |

Type scale used:
- Wordmark: serif 20–22px
- Page title (dashboard): serif 40px / line-height 1.05
- Section heading: serif 20px
- Body: 13px sans
- Row title: 12–13px sans
- Meta / kbd / mono: 9–11px
- Numeric stat: 22–28px sans, `.num`

### Spacing
6px base. Common steps: 4, 6, 8, 10, 14, 18, 28, 40.
Radius: buttons/inputs `6px`, cards `8–10px`, popup/dash frame `14px`.

---

## Screens

### A. Popup (380 × 560)

**Purpose:** Glance at all tasks, jump to a task page, handle stale tabs in one click. Opens on toolbar click.

**Layout (top → bottom):**
1. **Header** (padding 14/10) — Flox wordmark (Instrument Serif 20px) + `N tabs · M tasks` in mono. Right: theme toggle, settings (24×24 ghost buttons).
2. **Stale banner** — only rendered when `staleCount > 0`. Background `--signal-soft`, 14px padding. Clock icon (stroke `--signal`), "**N tabs** idle for more than a day", below it in mono the task names. Right: "review" button (secondary).
3. **Search bar** — padded 10/14. `--paper-2` fill, border `--line`, rounded 8px. 13px placeholder "Search tabs or jump to task…", trailing `⌘K` kbds.
4. **Task list** — vertical, each row 8px padding, 8px radius, hover `--paper-2`:
   - `▸` chevron (10px, muted)
   - 6px colored dot (task color)
   - Task name (13px 500)
   - If `stale > 0`: mono small `N stale` in `--signal`
   - Mono count (right-aligned)
   - **Favicon preview strip** below the row (24px left indent): up to 5 favicon chips 12×12 with letter, then `+N` in mono.
5. **Footer commands** (sticky bottom, border-top, `--paper-2` bg):
   - Primary: "+ Assign current tab" (flex-1, left-aligned, bordered not filled)
   - Ghost: "Open" + `⌘ ⇧ F` kbds (opens dashboard)

**Empty state** (when nothing idle, no tabs): centered column, 48px circle with check, Instrument Serif "You're clear." 24px, muted subcopy, single primary button "+ Assign current tab".

### B. Dashboard (1240 × 780, three-pane)

#### Left nav (220px, `--paper-2`, border-right `--line`)
- Top: wordmark + `v2.0` mono tag, border-bottom
- **Overview** section: mono uppercase label `OVERVIEW`, then 4 rows: Today (active), Stale (N count mono), Unassigned, Stashed, Pinned. Each row: 14px icon + 13px label + mono count, hover bg `--paper-3`, active same bg.
- **Tasks** section: mono label `TASKS` with a `+` ghost button. Each task row: 6px colored dot + name + count. Active row has `--paper-3` bg.
- Bottom: user row 22px avatar circle (bg `--accent-soft`, `--accent-ink` initials), name 11px, mono "free plan", settings ghost icon.

#### Center (flex, min-width 0)
- **Breadcrumb bar** (12px v-padding, 28px h-padding, border-bottom): mono `today / Redesign v2` on left; on right: "↦ Open all", "Stash", overflow ⋯ buttons.
- **Page body** (padding 32/40):
  - Colored dot + mono `TASK`
  - **H1** — Instrument Serif 40px, task name
  - Description paragraph (13px muted, max-width 520px)
  - **Status line** (border-top + border-bottom, 14/18px padding, 28px bottom margin): mono `STATUS` label then a single sentence — "**N** tabs open, **M** idle over a day. Last worked *t* ago." Numerals use `.num` class; stale count color `--signal`. *This replaces the 4-tile stat grid.*
  - **Rules row**: mono `RULES` label, then chip for each URL pattern (1px border, mono text, colored dot), then ghost "+ add rule".
  - **Open section**: Instrument Serif 20px heading "Open", right-aligned mono "sorted by recency". Then list of tab rows:
    - 16px favicon square + title (13px) + optional pinned/stale chip + mono domain + mono relative time (right) + close ghost icon.
    - Stale tabs get a chip with `--signal` text and `--signal-soft` bg.
  - **Pinned section** (28px top margin): Instrument Serif 20px "Pinned" + mono count. 3-column grid of pin cards: 12px padding, `--paper-2` bg, 1px border, 8px radius. Each card = favicon + mono domain on top row, title 13px 500 below.

#### Right rail (280px, border-left `--line`, `--paper`)
Three sections, top to bottom, each with border-bottom except last:

1. **Stale** — mono `STALE` + `--signal` count. List of idle tabs: favicon + title + `task · Nh idle`, dashed border between. Bottom: "Review all N" wide button.
2. **Notes** — mono `NOTES` + `+` button. Each note card:
   - 10/12px padding, `--line` border, 8px radius, `--paper-2` bg
   - Header row: link icon (9px) + either a colored dot + "on <Task Name>" OR a favicon + truncated URL (all mono 10px)
   - Body: Instrument Serif **italic** 14–15px
   - Timestamp: mono 9px bottom
   - **Notes anchor to either a Task (colored dot) or a URL (favicon + url).** This is new — don't just show loose quotes.

*(The old "This week 5h 48m" bar chart was removed. Do not reintroduce.)*

---

## Components to build (suggested)

| Component | Where | Notes |
|---|---|---|
| `<Wordmark />` | shared | serif 20/22 Flox |
| `<Favicon letter domain size />` | shared | hashed pastel bg from domain, letter inside |
| `<Chip dot? children />` | shared | 1px border, mono, optional dot |
| `<Kbd>` | shared | mono 10px, 1px border |
| `<Btn variant="primary|ghost|default" />` | shared | already mostly exists — restyle |
| `<TaskRow />` | popup | collapsible, with favicon preview strip |
| `<StaleBanner />` | popup | shows only when `staleCount > 0` |
| `<NavItem icon label count active />` | dashboard | left rail |
| `<TabRow />` | dashboard | row with chips, time, close |
| `<PinCard />` | dashboard | 3-col grid card |
| `<NoteCard anchor={task|url} />` | dashboard | new — supports two anchor types |

## Interactions

- **Popup tasks**: click row → in-popup slide to a focused view (back chevron in header). Do **not** ship a separate "detail popup" — it was cut as redundant.
- **Stale chip in popup**: click review → dashboard with Stale view filtered.
- **Notes**: `+` opens inline input; while editing, ask which anchor (task picker or "attach to current tab URL"). Persist on blur.
- **Rules chip**: click to edit inline; `+ add rule` opens inline text input.
- **Theme toggle** and **accent swatch** persisted in `chrome.storage.local` (already wired).
- **Search (⌘K)**: opens a command palette over the popup (scope: titles, URLs, task names, pinned names). Keep it simple — list of results, enter to open, no AI.

## State / Data
No new data model required. Existing `PopupSnapshot` / `DashboardSnapshot` cover everything. The only new field is `Note.anchor = { kind: 'task', id } | { kind: 'url', url, favIconUrl, title }`. Add to `src/types` and persist via `chrome.storage.local`.

## Things intentionally removed / avoided
- 4-tile stat grid (replaced with a sentence)
- "This week" bar chart in right rail (no real info, decorative)
- "Task detail" popup frame (the overview already has detail)
- Orange amber accent (felt loud — replaced with olive/user-choice)
- Stacked multi-color bars (flat bars if you ever need a chart)
- Emoji and gradients

## Files in this bundle
- `Flox Redesign.html` — the full prototype. Open it and use the in-page Tweaks panel to toggle light/dark, accent hue, and popup states.
