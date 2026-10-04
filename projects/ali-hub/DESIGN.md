# A L I · DESIGN.md ("Quiet Morning")

## Visual theme
Flat solid surfaces, no blur, grain or gradients. One accent. Dark by default on the phone at night (automatic Night palette 20:00–07:00), light by day. Density is comfortable, not cramped; rows are 44–56 px tall.

## Color
Tokens live in `src/app/globals.css` (`:root` dark, `[data-theme="light"]`, `[data-theme="night"]`). Never hard-code a colour in a component.

| Role | Dark | Light | Night |
|---|---|---|---|
| Background `--bg` | #0B0B10 | #F3F4F7 | #120E08 |
| Card `--bg-card` | #15161C | #FFFFFF | #1C1610 |
| Text `--ink` | #EDEDF2 | #15161D | #F2E4CE |
| Secondary `--ink-2` | #B3B6C3 | #4B4E5C | #C9B698 |
| Caption `--ink-3` | #8A8D9B | #6F7280 | #9C8C72 |
| Faint `--ink-4` (decoration, never body text) | #5C5F6E | #9A9DAB | #6B5F4C |
| Accent `--violet` | #8B7CF0 | #5B4BD6 | amber |
| Fills `--fill-1/2/3`, lines `--line/--line-hi/--line-strong` | layered neutrals | | |
| Semantic `--pos` `--warn` `--neg` | green · amber · red | | |

Use `--accent-soft` for a selected chip, `--on-accent` for text on the accent. Stage colours for sleep: `--stage-deep/core/rem/awake`.

## Typography
System font (`-apple-system, BlinkMacSystemFont, system-ui`), no web fonts. Body 17 px, card titles 15 / 600, captions 13–14 sentence case, page title 28 / 600. Mono (`ui-monospace`, `--f-mono`) only for clocks, counters and times. `tabular-nums` on any number that is compared. No all-caps tracked eyebrows; a section label is a 13.5 / 600 `--ink-3` caption or a card head.

## Components
- Card: `.cc-card` + `.cc-card-head` (title left, tail right) + `.cc-card-body`. A folding card uses a full-width `<button className="cc-card-head">` and `Fold`.
- Buttons: `.cc-btn` with `-primary` (accent), `-secondary`, `-ghost`, `-danger`; min height 44; `:focus-visible` ring in the accent.
- Pills: `.cc-pill` (+ `-warn`); chips select with `--accent-soft`.
- Inputs: `.cc-input`, 16 px on the phone, native pickers (date, time, select) opened through `openPicker`.
- Tick box: 24–28 px rounded square, `--pos` when done, pop + ring + strike + chime together (650–900 ms).
- Loading: `.cc-skeleton` or "—". Never a spinner.
- Sheets: `SheetFrame` pinned to the visual viewport above the iOS keyboard.
- Rows: 1 px `--line` separators, last row borderless.

## Layout
Single column on the phone with 16 px gutters; cards span the width. From 760 px some grids go two or four columns (`.h-grid`). Fixed widths never exceed `min(Npx, 100vw - 32px)`. Bottom tab bar on the phone, left rail on the laptop. Safe areas respected (`viewport-fit: cover`).

## Motion
Transforms and opacity only, 150–360 ms, `var(--easeOut)`. Cards may rise in once on a tab open (`Reveal`), numbers count up (`CountUp`), bars fill after mount (`useDrawn`). Everything off under `prefers-reduced-motion`. No bounce.

## Copy
Plain words, sentence case, no em dashes (use ·, comma or period), no emojis in labels, no sentence that explains a control. States and values, not prose.
