# Shape Colors & Pause Resume Button

## Goal

Fix two quality-of-life issues in the Tetris game:

1. **Unique per-shape colors.** Every tetromino currently renders in the
   cyan color of the I-piece. Each shape should use its own classic
   Tetris color (I cyan, J blue, L orange, O yellow, S green, T purple,
   Z red) on the board, the ghost piece, and the next/hold previews.
2. **Resume button on the pause modal.** Pausing the game shows a
   `Paused` panel with no way to dismiss it from the screen. Add a
   `Resume` button inside that panel that unpauses the game on click.

## Background

### Why every piece looks the same

`script.js` defines the seven tetrominoes in `SHAPES` (lines 35–71)
using `1` for every filled cell. Rendering uses `drawMatrix`, which
looks up the fill color via `COLORS[value]`:

```js
// script.js
context.fillStyle = COLORS[value];
```

Because every filled cell in every shape is `1`, every shape renders
as `COLORS[1]` — the cyan of the I-piece. The same is true of the
ghost piece (`drawGhost` at lines 218–232) and the next/hold previews
(`drawPieceInCanvas` at lines 162–189, which delegates to
`drawMatrix`).

`COLORS` is a 1-indexed palette (index 0 is `null`):
- 1 → `#00f0f0` I cyan
- 2 → `#0000f0` J blue
- 3 → `#f0a000` L orange
- 4 → `#f0f000` O yellow
- 5 → `#00f000` S green
- 6 → `#a000f0` T purple
- 7 → `#f00000` Z red

The palette is already correct and indexed in shape order; the bug is
purely in the shape matrices. Tagging each filled cell with its
shape's index (1–7) makes `COLORS[value]` resolve to the right color
everywhere, without changing the renderer.

### Why the pause modal is a dead end

`index.html` defines the pause modal at lines 61–63:

```html
<div id="paused" hidden>
    <div id="paused-panel">Paused</div>
</div>
```

The only way to resume is `togglePause()` (script.js lines 433–437),
which is wired to the `P` key (line 489) and the mobile pause button
(line 542). There is no in-panel control, so a user on a touch device
with no keyboard cannot unpause without first minimising and
re-opening, and even on desktop a screen reader or first-time player
has no discoverable affordance. The `game-over` panel right below it
already follows a `panel + label + button` pattern, so the fix is to
mirror that pattern on the pause panel.

## Scope

- Tag every filled cell in `SHAPES` with its tetromino's index
  (1 = I, 2 = J, 3 = L, 4 = O, 5 = S, 6 = T, 7 = Z) so the existing
  `COLORS` lookup returns the right color for every shape and every
  context (board, ghost, next preview, hold preview).
- Add a `Resume` button inside the paused panel and wire its click to
  `togglePause()`.
- Style the new button so it matches the existing `Restart` button on
  the game-over panel.
- Do not change gameplay, scoring, drop timing, controls, layout,
  pause behaviour, or the public ids/classes referenced from
  `script.js`.

## Out of Scope

- Replacing the classic palette with a custom one.
- Color-blind / accessibility mode (e.g. shape glyphs on each block).
- Switching the pause toggle to ESC, or removing the `P` keyboard
  shortcut.
- Keyboard focus / `autoFocus` on the Resume button.
- Changes to the game-over panel or its Restart button.
- Anything in `Dockerfile`, `nginx.conf`, or `.servyn/`.

## Files To Modify

### `script.js`

- `SHAPES` (lines 35–71): replace each `1` inside the seven shape
  matrices with the matching tetromino index (1–7), in the same order
  the shapes appear. Leave the surrounding `0` padding cells alone.
  The change is mechanical and limited to the constants block; the
  renderer, the bag, the queue, the hold feature, the ghost, the
  rotation logic, and `isValidMove` are untouched and continue to
  work because they only treat `0` as "empty" and otherwise carry
  the value through.

### `index.html`

- Inside `#paused-panel` (line 62), add an `<h2>Paused</h2>` heading
  and a `<button id="resume-btn" type="button">Resume</button>`
  below it. Keep the `hidden` attribute and the `#paused` /
  `#paused-panel` ids intact — `script.js` toggles `#paused.hidden`
  on pause/resume.

### `style.css`

- Add a `#paused-panel` rule (or extend the existing one at lines
  398–406) so the panel uses a vertical layout, has a heading, and
  visually mirrors `#game-over-panel` (lines 408–417): same dark
  background, same border, similar padding, centred text.
- Add a `#paused-panel button` rule that matches
  `#game-over-panel button` (lines 429–443): same green background,
  same padding, same border-radius, same hover treatment, and
  `touch-action: manipulation` so mobile taps register cleanly.

## Constraints

- No new runtime dependencies. Static HTML/CSS/JS only.
- Do not change gameplay, scoring, drop speed, hold rules, ghost
  rendering, or pause semantics.
- Do not change the public ids used by `script.js`
  (`game-canvas`, `next-canvas`, `hold-canvas`, `score`, `lines`,
  `level`, `high-score`, `start-btn`, `game-over`, `paused`,
  `restart-btn`).
- The Docker / Nginx / Servyn deploy config is unchanged.
- The fix is a one-character-per-cell change inside the constants
  block; the rest of the renderer stays as-is.

## Verification

- Open `index.html` in a browser and start a game.
- Watch the live piece and the `Next` preview. Confirm each of the
  seven tetrominoes renders in its own color (I cyan, J blue,
  L orange, O yellow, S green, T purple, Z red) — on the board, the
  ghost piece (translucent version of the same color), the `Next`
  preview, and the `Hold` preview.
- Hold several different pieces (press `C` or tap `Hold`) and confirm
  the held piece shows in its own color.
- Clear at least one line and confirm the locked cells keep the
  color of the piece that landed (they should, because `merge` writes
  the shape's value to the grid).
- Pause the game (press `P` or tap the mobile pause button) and
  confirm the pause modal shows a `Paused` heading and a `Resume`
  button. Tap `Resume` and confirm the game resumes — the piece
  keeps falling, the modal disappears, and `P` / the mobile pause
  button still toggle the same way as before.
- Confirm the game-over panel's `Restart` button still works and
  visually matches the new `Resume` button.
- Resize the window (including a rotate on mobile) and confirm the
  pause modal still centres and the `Resume` button stays tappable
  at the new size.
- Confirm the `feature/tetris-quality-of-life` regressions guards
  still hold: the sidebar score updates on hard drop and after line
  clears, the ghost piece is visible, and the hold / next previews
  keep updating.
