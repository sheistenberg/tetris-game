# Restart Reset & Desktop Controls Modal

## Goal

Fix two quality-of-life bugs in the Tetris game:

1. **Restart does not actually reset the game.** After a game-over, clicking
   "Restart" leaves the board full of the old pieces, the score / queue / bag
   / hold are never cleared, and the animation keeps running. The new piece
   spawns on top of the old stack and the player loses again within a few
   drops. The loop repeats for as long as the user keeps clicking "Restart".

2. **Desktop users have no discoverable keyboard reference.** The mobile
   touch buttons are drawn on the page, but a desktop player has no way to
   learn that `C` holds the shape or that `Space` hard-drops it. Add a
   "Controls" button that opens a modal listing every keyboard shortcut, and
   that automatically pauses the running game while the modal is open so
   the player is not killed by an auto-drop while reading it. Closing the
   modal resumes the game if it was running when the modal opened.

## Background

### Why restart does not reset

`script.js`'s main loop is `update(time)` (lines 439–453):

```js
function update(time = 0) {
    const delta = time - lastTime;
    lastTime = time;
    if (paused) {
        draw();
        rafId = requestAnimationFrame(update);
        return;
    }
    dropCounter += delta;
    if (dropCounter > dropInterval) {
        playerDrop();
    }
    draw();
    rafId = requestAnimationFrame(update);   // <-- always re-schedules
}
```

`playerDrop()` (line 370) calls `placePiece()` when the active piece cannot
move down. `placePiece()` (line 349) merges the piece into the grid, then
checks whether the *next* spawn is valid; if not, it calls
`triggerGameOver()` (line 481), which cancels the current rAF and sets
`rafId = null`.

The bug: `triggerGameOver` runs **inside the same `update()` call that is
already on the stack**. After `triggerGameOver` returns, the surrounding
`update()` keeps running and unconditionally executes its final
`rafId = requestAnimationFrame(update)`. A fresh rAF is queued, the
animation continues, and `rafId` is non-null again.

The new rAF tick calls `update()` again, which calls `playerDrop()` again
(once `dropCounter` exceeds `dropInterval`). The current piece is the
"stuck" next-piece from `triggerGameOver` — it is sitting at `y: 0` and
cannot move. `placePiece()` merges it into the grid, draws a new next
piece, and either:

- spawns a piece that fits at `y: 0` and continues the game with the old
  grid still half-full of stuck pieces, **or**
- spawns a piece that does not fit and calls `triggerGameOver` again,
  which re-cancels and the loop repeats.

The end result: the canvas keeps drawing, pieces keep stacking on the old
grid, and the game-over modal stays up because `gameOverEl.hidden = true`
is never re-applied.

`restartGame()` (line 498) hides the modal and calls `startGame()`:

```js
function startGame() {
    if (rafId) return;   // <-- early return
    grid = createEmptyGrid();
    ...
}
```

`startGame` is the only place that clears `grid`, `bag`, `queue`,
`heldPiece`, `score`, `lines`, `level`, and `dropInterval`. Its first
line is `if (rafId) return;` — a guard against double-starting. Because
the animation is still running, `rafId` is non-null, so `startGame`
returns without doing anything. The restart is a no-op.

The bug was reproduced end-to-end in a real Chromium browser:

```
Game over after ~ 108 ticks
Before 500ms: rafId= 114 cur= {"x":3,"y":0}
After  500ms: rafId= 144 cur= {"x":3,"y":0}
Delta rAF: 30 rafId: 114 -> 144        <-- animation kept running
After restart: { nonEmpty: 46, score: 0, lines: 0, level: 1, rafId: 151 }
                                       <-- grid still has 46 cells of pieces
```

The fix is local to `update()`: after `playerDrop()` has potentially
called `triggerGameOver()`, only schedule the next rAF if the game is
still alive (`rafId !== null`). That single check lets `startGame()` see
`rafId === null` on the next restart and run its full reset.

### Why a Controls modal

The mobile layout (`.mobile-controls`) draws an on-screen button for
every action a player can take, so a touch user can play without ever
reading the source. The desktop layout hides `.mobile-controls` (CSS at
`style.css:262-378` — `display: none` for `min-width: 720px`), so a
desktop player only has the keyboard. The bindings are scattered across
`script.js` (line 506: `preventDefault` for the arrow keys and space,
line 511: `p`/`P` toggles pause, line 516: `c`/`C` holds the piece, and
the rest of the switch on line 520-537), but there is no UI surface
that lists them.

A `Controls` button in the sidebar that opens a modal listing the
bindings solves two problems at once:

1. **Discoverability.** A first-time player can see "Hold = C" and
   "Hard drop = Space" without reading the source.
2. **Read-time safety.** The modal should auto-pause the game so a
   piece does not lock in while the player is reading. When the player
   closes the modal, the game resumes from exactly the state it was in
   (running or not running). This is a small but important piece of
   polish — without it, a player who pauses to read the controls would
   resume into a half-lost position, and a player who is not in a game
   would not be affected.

## Scope

- Fix the auto-restart loop in `script.js` by making `update()` honour
  the `rafId = null` set by `triggerGameOver()`.
- Add a "Controls" button to `#sidebar` and a hidden `#controls` modal
  to `index.html`. The modal lists every keyboard shortcut, including
  the touch-button equivalents, and has a single `Close` button.
- Wire the button and modal in `script.js`: open pauses a running game
  and shows the modal, close hides the modal and resumes the game if it
  was running when the modal opened. The Escape key and a click on the
  dimmed backdrop also close the modal.
- Style the new button and modal in `style.css` so they match the
  existing `#game-over` / `#paused` overlay pattern: same dim backdrop,
  same `.modal-panel` chrome, same focusable Close button.
- Do not change the existing pause (`P` key, `II` mobile button) or
  game-over (`Restart` button) flows, the public ids used by `script.js`,
  the touch controls, the layout, the colours, the scoring, the drop
  speed, the bag / queue / hold mechanics, or the deploy config.

## Out of Scope

- Rebinding keys, adding new shortcuts, or changing the touch buttons.
- A dedicated icon-only Controls button on mobile (the touch controls
  already serve that role).
- Animations on the modal open/close.
- Persisting whether the user has acknowledged the controls.
- Localising the labels.
- Changes to the `Dockerfile`, `nginx.conf`, `.servyn/` config, or the
  `README.md`.

## Files To Modify

### `script.js`

**Bug 1 — restart loop.** Replace the final two lines of `update()`
so the next rAF is only queued when the game is still alive:

```js
function update(time = 0) {
    const delta = time - lastTime;
    lastTime = time;
    if (paused) {
        draw();
        rafId = requestAnimationFrame(update);
        return;
    }
    dropCounter += delta;
    if (dropCounter > dropInterval) {
        playerDrop();           // may call triggerGameOver() and set rafId = null
    }
    draw();
    if (rafId !== null) {       // <-- new guard
        rafId = requestAnimationFrame(update);
    }
}
```

This is the minimal change: the `if (rafId !== null)` check honours
the cancel that `triggerGameOver` performs, so the animation stops the
first time game-over is reached via the auto-drop path. `restartGame()`
-> `startGame()` then sees `rafId === null` and runs its full reset.
The `if (paused)` branch is unaffected because pause never calls
`triggerGameOver`.

While there, reset `dropCounter` in `startGame()` so a stale counter
from the previous game cannot force an immediate `playerDrop()` on the
first frame of the new game. (Not strictly required to fix the bug,
but it removes a related surprise where a restarted game can auto-drop
within ~1 frame if the previous game paused with a high `dropCounter`.)

**Bug 2 — Controls modal.** Add the DOM handles, the open/close
handlers, and the auto-pause logic:

```js
const controlsEl = document.getElementById('controls');
const controlsBtn = document.getElementById('controls-btn');
const controlsCloseBtn = document.getElementById('controls-close-btn');
let wasRunningBeforeControls = false;   // captures rafId != null at open time

function openControls() {
    wasRunningBeforeControls = rafId !== null && !paused;
    if (wasRunningBeforeControls) {
        togglePause();                   // reuses the existing pause overlay path
    }
    controlsEl.hidden = false;
    setTimeout(() => controlsCloseBtn.focus(), 0);
}

function closeControls() {
    controlsEl.hidden = true;
    if (wasRunningBeforeControls && paused) {
        togglePause();                   // resume only if we were the one who paused
    }
    wasRunningBeforeControls = false;
}

controlsBtn.addEventListener('click', openControls);
controlsCloseBtn.addEventListener('click', closeControls);
controlsEl.addEventListener('click', (e) => {
    if (e.target === controlsEl) closeControls();   // backdrop click
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !controlsEl.hidden) {
        e.preventDefault();
        closeControls();
    }
});
```

Notes:

- `wasRunningBeforeControls` is set on every open, so opening the
  modal while the game is already paused is a no-op for the
  pause/resume logic (we neither pause nor resume; the user just sees
  the modal).
- The `e.target === controlsEl` backdrop check only fires when the
  click lands on the dimmer, not on `.modal-panel` itself.
- The `Escape` handler is registered on `document` so it works
  regardless of focus, but it short-circuits when the modal is hidden
  so it does not interfere with the existing `P`-key pause binding.
- The existing `pausedEl.hidden = true` resets in `triggerGameOver`
  and `startGame` are untouched, so the Controls modal cannot leak
  pause state into a new game.

### `index.html`

Add the Controls button to the existing `#sidebar`, immediately after
the `Start` button so it sits in the same vertical group of actions:

```html
<button id="start-btn">Start</button>
<button id="controls-btn" type="button">Controls</button>
```

Add the hidden Controls modal as a sibling of `#game-over` and
`#paused` (the existing overlay pattern), reusing the same
`.modal-panel` class:

```html
<div id="controls" hidden>
    <div id="controls-panel" class="modal-panel" role="dialog"
         aria-modal="true" aria-labelledby="controls-title">
        <h2 id="controls-title">Controls</h2>
        <table class="controls-table">
            <tr><th>Action</th><th>Key</th></tr>
            <tr><td>Move left</td><td>←</td></tr>
            <tr><td>Move right</td><td>→</td></tr>
            <tr><td>Soft drop</td><td>↓</td></tr>
            <tr><td>Rotate</td><td>↑</td></tr>
            <tr><td>Hard drop</td><td>Space</td></tr>
            <tr><td>Hold</td><td>C</td></tr>
            <tr><td>Pause / Resume</td><td>P</td></tr>
        </table>
        <button id="controls-close-btn" type="button">Close</button>
    </div>
</div>
```

The new public ids (`controls`, `controls-panel`, `controls-btn`,
`controls-close-btn`) are added to the existing convention used by
`#game-over` / `#paused` and are not referenced from anywhere else
in the codebase, so there is no risk of collision.

### `style.css`

Reuse the `#game-over` / `#paused` overlay pattern for `#controls` and
add a small table style for the key list. Concretely:

- A `#controls { position: fixed; inset: 0; ... display: flex; ... z-index: 95; }`
  rule matching the existing `#paused` overlay, with `#controls[hidden] { display: none; }`
  to mirror the `[hidden]` toggling.
- A `.controls-table` rule that lays the bindings out as a two-column
  table (action / key) with left-aligned cells, generous padding, and
  a width that keeps the modal compact on mobile.
- A `#controls-panel button` rule that matches the existing `.modal-panel button`
  so the Close button looks like the Resume / Restart buttons.

No new colours, no new fonts, no layout changes outside the new modal
and table.

## Verification

1. **Restart actually resets.** Open `index.html` and let a piece
   stack to the top so the game ends via the auto-drop path
   (do not press hard drop, just let the game run). The game-over
   modal appears. Click "Restart".
   - The board is empty (no pieces from the previous run are
     visible).
   - Score, Lines, and Level all read `0`, `0`, `1` respectively.
   - A new piece falls from the top.
   - The new game can last at least as long as the first game did
     (the pieces start from a clean board).

2. **Restart also works after a hard-drop game over.** Same as
   above, but use `Space` to hard-drop repeatedly until the game
   ends. The restart behaviour is unchanged (it was already working
   on this path because the keydown handler exits before `update()`
   re-schedules a rAF).

3. **Controls button opens the modal.** On a desktop viewport
   (≥ 720px wide), the sidebar shows a new "Controls" button
   underneath "Start". Click it.
   - The Controls modal appears, listing every key binding.
   - If a game was running, it pauses: the live piece stops falling,
     the `#paused` overlay does *not* appear (we are not in the
     normal pause flow), and the animation loop is suspended via
     `togglePause()`.
   - Focus moves to the "Close" button.

4. **Closing the modal resumes the game.** With the modal open and
   the game paused by it, press Escape, click the Close button, or
   click the dimmed backdrop.
   - The modal disappears.
   - The piece resumes falling from where it stopped.
   - Pressing `P` still toggles pause as before.
   - If the game was *not* running when the modal was opened (start
     screen, game-over screen, or already paused), closing the
     modal does not start a new game or change the pause state.

5. **Touch controls and existing flows are untouched.** On a mobile
   viewport the `.mobile-controls` row still works exactly as
   before. The `P` key, the `II` mobile pause button, the `C` key,
   the `Hold` button, the `Start` button, the `Restart` button, the
   `#paused` modal, and the `#game-over` modal all behave exactly as
   they did before this change.

6. **No regressions in scoring / drop / level.** Clear at least one
   line and confirm the score and `Lines` counter update, the
   sidebar shows the new `Level` after every 10 lines, and the
   drop speed visibly speeds up at the new level.
