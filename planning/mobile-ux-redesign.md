# Mobile UX Redesign

## Goal

Make Tetris playable on a phone in portrait orientation without scrolling, and
keep it fully usable in landscape, by replacing the current desktop-first
flowing layout with a viewport-locked, mobile-first layout.

## Background

The current mobile layout was assembled incrementally. On a typical phone in
portrait the document flow is:

```
<h1>                  <- ~44px
#game-container       <- canvas (20 × block) + sidebar stacked below
#mobile-controls      <- 3 rows of buttons
```

Problems observed in the field and from reading the code:

1. **The page scrolls.** `body` is `min-height: 100vh` with `overflow-x: hidden`
   only; `overflow-y` is the browser default, so content that exceeds the
   viewport scrolls. On an iPhone-SE-class screen (667px tall) with a 240×400
   canvas and the sidebar + controls below, the controls fall off-screen and
   the user has to scroll to reach them.
2. **The sidebar is stacked under the canvas in portrait.** The
   `#game-container` is `flex-direction: column` below 600px, which puts the
   96×96 next/hold canvases, score lines, and Start button underneath the
   board. The board ends up tiny, the previews are oversized, and the button
   ends up halfway down the page.
3. **Canvas sizing is based on a fiction.** `calculateBlockSize()` subtracts
   hard-coded heights for the header (`80px`), sidebar (`120px`), and mobile
   controls (`180px`) from the window height. Real measurements: the header is
   ~44px, the sidebar with two 96×96 canvases plus text is ~260px, the
   controls are ~210px — so the board is shrunken by an extra ~210px and ends
   up much smaller than the viewport allows.
4. **No landscape story.** The only breakpoint is `min-width: 600px`. On a
   phone in landscape the screen is wide and short (e.g. 812×375), the
   240×400 board is too tall, and the layout produces a horizontal scrollbar
   because the desktop sidebar sits next to the board.
5. **Touch targets are uneven.** Left/right/rotate are 70×60px; hold/pause are
   the same. Apple HIG and Material both recommend ≥44px. With the press
   scaling (`transform: scale(0.95)`) the visual target is even smaller.

## Scope

- Replace the mobile-only layout (`< 600px`) with a viewport-locked, mobile-
  first layout that also covers desktop unchanged.
- Add an explicit landscape layout so the game is playable with one thumb in
  either orientation.
- Fix `calculateBlockSize()` so the board is sized from the actual rendered
  game area instead of hard-coded subtractions.
- Re-arrange the touch controls so the most-used actions (left/right/rotate)
  are large and reachable, and the secondary actions (hold, pause, hard drop)
  are present but smaller.
- Keep all gameplay, scoring, drop speed, hold, ghost, and pause behaviour
  identical.

## Out of Scope

- Swipe / drag gestures to replace on-screen buttons. The buttons stay; this
  task is layout only.
- Desktop visual changes beyond what the new container structure requires.
- The feature work on `feature/tetris-quality-of-life` (ghost, hold, scoring,
  pause, hard drop). That branch is orthogonal and will merge separately.
- PWA / install-to-home-screen / fullscreen API.
- Sound.

## Target Layouts

### Portrait phone (default, < 600px)

```
+----------------------------+
|          Tetris            |   <- compact h1
+----------------------------+
|  Next |          |  Hold   |
|  [..] |  Board   |  [..]   |   <- 3-column flex, board centred
|       |          |         |
|       |          |         |
+----------------------------+
|  Score  Lines  Level  High |   <- compact stats strip
+----------------------------+
|  [ ⬅ ] [ 🔄 ] [ ➡ ]         |   <- primary controls, 3 across
|  [ ⬇ ]  [ ⤓ ]   [ II ]      |   <- secondary controls, 3 across
|           [ H ]             |   <- hold, centred
+----------------------------+
```

The board and previews share a row so the board keeps the full width; previews
shrink to ~64px squares and sit in the side gutters. The stats strip is a
single full-width row. The controls grid is fixed-height and pinned to the
bottom of the viewport so the page never scrolls.

### Landscape phone (default, < 900px height)

```
+--------------------------------+
|  Tetris    S:0  L:0  Lv:1  H:0 |   <- compact header + inline stats
+----------+---------------------+
|  Next    |                     |
|  [..]    |                     |
|  Hold    |       Board         |
|  [..]    |                     |
|  Start   |                     |
+----------+---------------------+
|  [ ⬅ ][ 🔄 ][ ➡ ][ ⬇ ][ ⤓ ][ II ][ H ]   <- single-row controls
+--------------------------------+
```

The board takes the available width minus a fixed-width sidebar (previews +
button + score on the left). The controls are a single row across the bottom.

### Desktop (≥ 900px and ≥ 600px height)

The current desktop layout stays: board on the left, sidebar on the right,
no mobile controls.

## Files To Modify

### `index.html`

- Wrap the current top-level elements in a new `#app` container that becomes
  the grid host.
- Restructure `#game-container` so `#sidebar` is a sibling of `#game-canvas`
  rather than a parent block, with a `#board` wrapper around the canvas.
- Inside `#sidebar` group: stats row, next preview, hold preview, start
  button. Each group gets a semantic class.
- Add a `#stats` strip element (used on mobile, hidden on desktop) so the
  stats are always visible in one row in portrait.
- Keep `#mobile-controls`, `#game-over`, `#paused` element ids intact — they
  are referenced from `script.js`.

### `style.css`

- Lock `body` to `100dvh` (with `100vh` fallback) and `overflow: hidden`.
  Add `touch-action: none` and `overscroll-behavior: none` to the game area
  so the OS-level pull-to-refresh and rubber-banding do not hijack the page.
- Replace the existing mobile rules with a three-state layout:
  - Default (portrait phone): grid `auto 1fr auto` rows; game area is a
    flex column with the board row + stats strip; controls pinned to bottom.
  - Landscape phone (`orientation: landscape` and `max-height: 500px`):
    board + sidebar side by side; controls collapse to one row.
  - Desktop (`min-width: 900px`): restore the existing two-column layout.
- Add a `#board` wrapper with `aspect-ratio: 1 / 2` so the canvas container
  keeps the correct proportions and the JS can measure it.
- Resize the next/hold preview canvases via CSS (visual size) and let JS
  update the internal `width`/`height` to match.
- Enlarge touch targets to ≥48px on the primary action buttons (left, right,
  rotate) and keep the secondary buttons at 44px.
- Remove the `h1` margin on mobile and use a 16px font so the header does
  not steal height from the game area.

### `script.js`

- Rewrite `calculateBlockSize()` and `resizeCanvas()`:
  - Measure the actual `#board` element (`getBoundingClientRect()`) instead of
    subtracting hard-coded numbers from the window.
  - Add a `ResizeObserver` on `#board` so the canvas resizes when the layout
    changes (orientation, URL bar, dynamic viewport).
  - Add a `visualViewport` `resize` listener as a backstop for browsers that
    fire it without firing `resize`.
  - Re-derive `BLOCK_SIZE` from the measured `clientWidth` and `clientHeight`
    of the board container: `min(clientWidth/10, clientHeight/20)`, clamped
    to `[MIN_BLOCK_SIZE, MAX_BLOCK_SIZE]`.
  - Recompute the next/hold canvas internal sizes from their CSS size so the
    previews stay crisp.
  - Replace the constant `PREVIEW_BLOCK = 20` with a per-canvas block size
    computed inside `drawPieceInCanvas()` as `Math.max(8, Math.floor(
    canvasSize / 4))` so any preview size works.

## Constraints

- No new runtime dependencies. Static HTML/CSS/JS only.
- Do not change gameplay, scoring, drop speed, hold rules, ghost rendering,
  or pause behaviour.
- Do not change the public ids used by `script.js` (`game-canvas`,
  `next-canvas`, `hold-canvas`, `score`, `lines`, `level`, `high-score`,
  `start-btn`, `game-over`, `paused`, `restart-btn`).
- The Docker / Nginx / Servyn deploy config is unchanged.

## Verification

- Open `index.html` in a desktop browser at 1280×800 and confirm the board
  is on the left, the sidebar on the right, and the on-screen controls are
  hidden — desktop layout is preserved.
- Resize the desktop browser to 375×667 (iPhone-SE portrait) and confirm:
  - The page does not scroll.
  - The board, both previews, the stats strip, and all control buttons are
    visible without scrolling.
  - Tapping Start begins a game and the sidebar previews update.
  - The board fills the available width; the side previews are visibly
    smaller than 96px.
- Rotate to 667×375 (landscape) and confirm:
  - The board and sidebar sit side by side.
  - The controls collapse to one row at the bottom.
  - The page still does not scroll.
- Tapping each mobile control (left, right, rotate, down, hard-drop, hold,
  pause) on a touch device moves the piece, hard-drops it, holds it, or
  pauses the game as expected.
- Confirm the live sidebar score still updates on hard drop (regression
  guard for the recent `fix(game): refresh sidebar score after hard drop`).
- Confirm pause overlay and game-over overlay still centre and are not
  clipped.
