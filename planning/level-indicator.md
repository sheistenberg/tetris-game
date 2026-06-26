# Level Indicator

## Goal

Display the player's current level next to the existing score display.

## Scope

- Add a `Level` indicator in the sidebar UI alongside `Score` and `Lines`.
- Introduce level state that starts at `1` when a game starts.
- Increase the displayed level by `1` for every `10` total cleared lines.
- Update the level in the UI immediately after lines are cleared.
- Do not change drop timing, score rules, controls, or any other gameplay behavior.

## Files To Modify

- `index.html`
  - Add a level row in `#sidebar` near the existing score and lines rows.
- `script.js`
  - Add a `level` state variable near the existing `score` and `lines` state.
  - Update `clearLines()` to derive level from total cleared lines.
  - Update `updateScore()` to also render the current level.
  - Reset level to `1` in `startGame()`.

## Verification

- Open `index.html` in a browser.
- Start a game and confirm the sidebar shows `Level: 1`.
- Clear lines until total cleared lines reaches `10` and confirm the sidebar updates to `Level: 2` immediately.
- Confirm score and line count still update as before.
- Confirm piece drop speed does not change.
