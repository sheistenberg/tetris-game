# Line Clear & Score Animations

## Goal

Make line clears and score changes feel fast, satisfying, and rewarding, so the
player gets an immediate sensory hit every time they clear a row or bank points
— the kind of micro-interaction that makes you want to chain one more tetris.

Two specific upgrades:

1. **Line clear**: replace the current instant `splice + unshift` of full rows
   with a quick multi-phase canvas animation: a center-out white wipe of the
   cleared cells, then a gravity fall of the rows above into the gap.
2. **Score counter**: replace the current `textContent = score` with a short
   tick-up animation from the previous displayed value to the new one, a brief
   scale-and-glow pulse on the score, and a small `+N` floater that drifts up
   and fades next to the score. Lines and level get their own smaller pulses
   when they tick.

## Background

### What line clear looks like today

`script.js` has a synchronous `clearLines()` (lines 292–316). On a piece
lock-in, `placePiece()` calls `merge()` to write the piece into `grid`, then
calls `clearLines()`, which iterates from the bottom row up, splices each full
row out, and `unshift`s an empty row at the top. Then it updates
`lines`, `score`, `level`, `dropInterval`, and finally calls `updateScore()`
to write the new numbers to the sidebar — all in a single frame, before the
next render. The result is a hard, visual-less snap: rows disappear, blocks
above teleport to the bottom, and the score number changes with no feedback.

This is fine for a reference implementation, but it kills the dopamine hit that
Tetris is famous for. A 0.3-second flash-and-fall is enough to make every clear
feel earned, without delaying the game long enough to feel sluggish.

### What the score update looks like today

`updateScore()` (lines 322–330) is a one-shot DOM write:

```js
function updateScore() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    levelEl.textContent = level;
    if (score > currentHighScore) {
        currentHighScore = score;
        highScoreEl.textContent = score;
    }
}
```

It is called from `clearLines()`, `playerHardDrop()`, and `startGame()`. The
new value appears in a single frame, with no transition, no highlight, and no
indication of *how much* was just added. The high score changes silently.

For a hook, the player needs to feel the size of the win: a "+120" popup
anchored to the score, the score number physically ticking up, the score text
itself doing a brief bounce-and-glow. None of that exists today.

## Design

### Animation timing budget

Total clear animation: **~310 ms** (well below the 1 s default drop interval
and the ~100 ms minimum drop interval, so a hard drop on a single still does
not stall the game):

| Phase    | Duration | Effect                                                       |
| -------- | -------- | ------------------------------------------------------------ |
| Sweep    | 170 ms   | Center-out white wipe of cleared cells (per-cell stagger)    |
| Fall     | 140 ms   | Rows above the cleared area drop into the gap, ease-in (gravity) |

Score animations are driven by the same RAF loop and run concurrently with the
clear animation; they do not block gameplay logic.

### Line clear (canvas animation)

The grid is rendered each frame from `grid` plus the active animation state.
While a clear is in flight, the original cleared rows are *not* spliced from
`grid` until the sweep finishes — this lets the fall phase animate rows from
their pre-clear positions to their post-clear positions.

**Sweep** (170 ms). For each cell `(x, y)` in a cleared row, compute
`dist = |x - (COLS-1)/2|` and `cellStart = (dist / maxDist) * 0.4` (so the
center column starts at t=0 and the edge columns start at t=0.4). Each cell's
local progress is `(t - cellStart) / 0.6`. The cell draws as a white bar that
shrinks horizontally toward its center, fading only in the final 30% of its
local time. The effect: a crisp white wipe radiating from the middle of the
row, with the edge cells catching up at the end.

**Fall** (140 ms). For each non-cleared row `r`, the number of cleared rows
below it (`fallByRow[r]`) is precomputed at animation start. The draw Y for
row `r` is `(r + fallByRow[r] * (1 - easedProgress)) * BLOCK_SIZE`, where
`easedProgress = t^2` (ease-in for gravity). The row appears to accelerate
downward into the gap. At `t = 1`, every row sits at its post-clear position,
the cleared rows are spliced from `grid` in a single commit, and the next piece
is spawned.

### Score counter (DOM animation)

A new `scoreAnim` state object tracks `{ from, to, startTime, duration }`.
Each frame, the update loop interpolates with `easeOutCubic` and writes
`Math.round(from + (to - from) * eased)` to `scoreEl.textContent`. When the
animation finishes, `scoreAnim` is cleared and the final value is written.

Two durations are used:

- **Hard drop** (220 ms): small ticks from the +2/cell soft drop bonus.
- **Line clear** (380 ms): longer ticks for the larger `SCORE_TABLE[lines] *
  level` payouts, so the player gets to watch a meaningful number roll.

When the displayed value changes, a `.score--pulse` class is added to
`#score` for 220 ms (scale 1 → 1.22 → 1, color `#f0c040` → `#fff5c0` → `#f0c040`,
brief text-shadow glow). `animationend` removes the class so the next pulse
restarts cleanly.

### Score floater

A `<span id="score-floater">` lives next to `#score` inside a `position:
relative` `.stat-value` wrapper. Each `awardScore()` call writes the delta
(`+N`) to the floater, removes and re-adds a `.score--floater--show` class
(forcing a reflow between) to restart a 720 ms `score-float` keyframe that
fades the floater in over the first 15% of its life and floats it 16 px upward
while fading to 0. `animationend` clears the text and class so the next
floater can fire.

### Lines and level pulses

- `#lines` gets a `.lines--pulse` class on every line clear (280 ms scale +
  green color flash).
- `#level` gets a `.level--pulse` class when `newLevel !== level` after a clear
  (420 ms scale + amber color flash, slightly longer so the level-up reads as
  a milestone).

### Game state coupling

- `placePiece()` checks for full rows. If any, it calls `startClearAnim(rows)`
  and returns *without* spawning the next piece. `finishClearAnim()` does the
  actual splice, updates `lines` / `score` / `level`, awards the score, then
  calls `spawnNext()`. If no rows are full, behavior is identical to today
  (immediate spawn).
- `update()` ticks the active clear animation, then the active score
  animation, then runs the normal drop counter. While a clear animation is
  active, the drop counter and `playerDrop()` are skipped so the next piece
  does not fall before it spawns.
- Player input (move / rotate / drop / hard-drop / hold) is blocked while
  `clearAnim` is active, with `pause` as the only exception. The piece itself
  is not drawn during the clear animation, so the playfield shows only the
  surviving grid mid-animation.
- Pause freezes the clear and score animations too: `update()` resets
  `lastTime` while paused and does not tick animations, so the in-flight
  animations resume from the same elapsed time when the player un-pauses.

## Scope

- Add a center-out sweep + gravity-fall line-clear animation.
- Add a tick-up + pulse + floater animation for the score counter.
- Add brief pulse animations for the lines and level counters.
- Do not change gameplay, scoring rules, controls, layout, pause behavior,
  resize behavior, or the public ids referenced from `script.js`.

## Out of Scope

- T-spin / kick animations. The current piece only does what it does today.
- Particle effects, screen shake, or post-processing.
- Sound (the repo does not include any audio assets).
- Line-clear particle bursts per color (one neutral white wipe keeps the
  visual consistent with the existing per-shape palette and reads as a
  "punch" rather than a fireworks show).
- Replacing `easeOutCubic` with a different curve or exposing the timings as
  user preferences.
- Touching the deploy config (`Dockerfile`, `nginx.conf`, `.servyn/`) or any
  planning doc other than this one.

## Files To Modify

### `index.html`

- Wrap the `#score` element in a `<span class="stat-value">` so the floater
  can be `position: absolute` relative to it.
- Add `<span id="score-floater" class="score-floater" aria-hidden="true">`
  inside the wrapper. Empty by default; populated by `awardScore()`.
- Leave every other element, id, and class unchanged.

### `style.css`

Add (do not change existing rules):

- `.stat-value { position: relative; display: inline-block; }` so the floater
  is anchored to the score text.
- `.score-floater` with `position: absolute; right: 0; top: -2px; opacity: 0;
  pointer-events: none;` and a `.score-floater--show` modifier that triggers a
  720 ms `score-float` keyframe (fade in 0–15%, drift up 16 px, fade out by
  100%).
- `#score { display: inline-block; transform-origin: center right; color:
  #f0c040; }` to give the score the same accent color as `#high-score` and
  to make scale transforms pivot from the right edge (so the number does not
  jitter left when it pulses).
- A `.score--pulse` class on `#score` driving a 220 ms `score-pulse` keyframe
  (scale 1 → 1.22 → 1, color gold → warm white → gold, brief text-shadow
  glow).
- `#lines` and `#level` get `display: inline-block; transform-origin: center
  right;` and `.lines--pulse` (280 ms, scale 1 → 1.18, color #eee → #7dffa0)
  and `.level--pulse` (420 ms, scale 1 → 1.3, color #eee → #ffd040)
  keyframes.

### `script.js`

- Add module-level `let clearAnim = null; let scoreAnim = null;` near the
  other state.
- Add timing constants: `SWEEP_MS = 170; FALL_MS = 140;
  SCORE_TICK_HARDDROP_MS = 220; SCORE_TICK_CLEAR_MS = 380;`.
- Add helpers: `findFullRows()`, `startClearAnim(rows)` (computes
  `fallByRow`), `tickClearAnim(time)` (advances phase and progress), and
  `finishClearAnim()` (commits the row removal, updates `lines` / `score` /
  `level`, fires score and counter pulses, calls `spawnNext()`).
- Add `awardScore(delta, durationMs)` (reads current displayed value, starts
  a `scoreAnim`, shows the floater) and `tickScoreAnim(time)` (interpolates
  with `easeOutCubic` and writes `scoreEl.textContent`).
- Add `pulseEl(el, className)` (removes, forces a reflow, re-adds) and
  `showFloater(text)` (textContent + class toggle, same reflow trick).
- Register a one-time `animationend` listener on `#score-floater` that clears
  the class and textContent so the next floater can fire.
- Refactor `placePiece()`: after `merge()`, call `findFullRows()`. If any
  rows are full, call `startClearAnim(rows)` and return. Otherwise, call
  the new `spawnNext()` helper, which contains the existing
  `nextFromQueue() + isValidMove check + canHold + drawNext()` logic.
- Refactor `update()`:
  - If `paused`, set `lastTime = time` and return *before* computing `delta`
    so un-pausing does not deliver a multi-second `delta` to the drop
    counter.
  - If `clearAnim` is active, call `tickClearAnim(time)` and `draw()`, then
    return (skip the drop counter and `playerDrop()`).
  - Otherwise, tick `scoreAnim` (whether or not `clearAnim` is active, score
    animations tick every frame).
  - Run the existing drop counter / `playerDrop()` / `draw()` path.
- Refactor `draw()` to support the clear animation. The base render still
  calls `drawMatrix(grid, {x:0, y:0})` followed by the ghost and current
  piece, but:
  - If `clearAnim.phase === 'sweep'`, skip the cleared rows in the base
    `drawMatrix` call (so the cells do not flash in their original color
    before the wipe takes over) and overlay `drawRowSweep()`.
  - If `clearAnim.phase === 'fall'`, render the grid using per-row fall
    offsets via the new `drawGridWithFall()` helper. The cleared rows are
    skipped. The ghost and current piece are *not* drawn during a clear
    animation.
- Refactor `playerHardDrop()` to call `awardScore(cellsDropped * 2,
  SCORE_TICK_HARDDROP_MS)` and `pulseEl(scoreEl, 'score--pulse')` instead of
  `updateScore()`.
- In the `keydown` handler, add an `if (clearAnim) return;` short-circuit
  after the pause check, so move / rotate / hard-drop / hold are blocked
  during the animation. Pause still works.
- In the `.control-btn` `pointerdown` handler, add the same
  `if (clearAnim) return;` short-circuit.
- `clearLines()` and `updateScore()` are no longer called from
  `playerHardDrop` or `clearLines` (the former is removed, the latter is
  replaced by the new flow). Keep `updateScore()` for `startGame()` to reset
  the sidebar at the start of a game (no animation needed on a fresh game).

## Constraints

- No new runtime dependencies. Static HTML/CSS/JS only.
- The full clear animation (sweep + fall) must complete in **≤ 350 ms** so
  the game does not feel sluggish. Score animations are independent and may
  overlap with subsequent gameplay.
- The total input block window during a clear animation must not exceed
  the same 350 ms budget.
- The animations must respect pause: pausing the game freezes the clear and
  score animations in place; un-pausing resumes from the same elapsed time.
- Do not change the public ids used by `script.js` (`game-canvas`,
  `next-canvas`, `hold-canvas`, `score`, `lines`, `level`, `high-score`,
  `start-btn`, `game-over`, `paused`, `restart-btn`).
- The Docker / Nginx / Servyn deploy config is unchanged.
- Do not change the renderer for the ghost piece, next preview, or hold
  preview.

## Verification

- Open `index.html` in a desktop browser and start a game.
- Clear a single line and confirm: the row wipes white from the center
  outward over ~170 ms, then the rows above accelerate downward into the
  gap over ~140 ms, then the next piece spawns. The whole sequence reads
  as one motion and completes in well under half a second.
- Clear a Tetris (4 lines at once) and confirm: all 4 rows wipe together,
  the rows above fall by 4 cells with the same ease-in feel, and the next
  piece spawns immediately after.
- Watch the score number change during a line clear and confirm: it ticks
  up smoothly from the previous value to the new one over ~380 ms, with a
  brief scale + glow pulse and a `+N` floater drifting up next to the
  score.
- Hard-drop a piece 5 cells and confirm: the score ticks up by 10 over
  ~220 ms with a smaller pulse and a `+10` floater.
- Clear multiple lines in quick succession (T-spins, multi-line setups)
  and confirm: each clear plays its full animation; the next piece does
  not spawn early; subsequent line clears on the resulting playfield
  animate correctly; the score number picks up the tick from the
  displayed (mid-animation) value rather than the raw `score` value.
- Clear exactly 10 lines and confirm: the `Level` value pulses with a
  larger scale + amber flash, and the drop speed increases after the
  clear animation finishes.
- Pause the game mid-line-clear animation (press P while a row is wiping)
  and confirm: the animation freezes, the pause overlay shows, the
  animation does not advance. Unpause and confirm: the animation resumes
  from the same point and completes normally.
- Try to move / rotate / hard-drop / hold while a clear animation is
  running and confirm: those inputs are ignored. Pause still works.
- Reload the page and start a new game and confirm: the score, lines,
  level, and high score all reset to their starting values; the next and
  hold previews render correctly; no stray floater is visible from a
  previous game.
- Resize the browser window (or rotate a mobile device) during gameplay
  and confirm: the canvas resizes correctly and the floater stays
  anchored to the score number.
- Confirm the regressions guards from earlier releases still hold: the
  sidebar score updates on hard drop, the ghost piece is visible, the
  hold / next previews keep updating, pause and resume work, and the
  game-over overlay still shows the final score and high score.
