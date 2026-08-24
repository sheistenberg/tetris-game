// Game loop: runs via requestAnimationFrame, updates piece position, handles drops, collisions, line clears, and renders the board each frame
// It manages the main animation cycle for the Tetris game
const COLS = 10;
const ROWS = 20;
const MIN_BLOCK_SIZE = 16;
const MAX_BLOCK_SIZE = 30;
const PADDING = 8;
const QUEUE_SIZE = 4;
const HIGH_SCORE_KEY = 'tetris:highScore';
const SCORE_TABLE = [0, 40, 100, 300, 1200];
const LEVEL_SPEED_EXP = 0.85;
const MIN_DROP_INTERVAL = 80; // ms
// Line-clear animation timings (ms). Total clear (sweep + fall) ~ 310 ms.
const SWEEP_MS = 170;
const FALL_MS = 140;
// Score tick-up animation durations (ms).
const SCORE_TICK_HARDDROP_MS = 220;
const SCORE_TICK_CLEAR_MS = 380;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const boardEl = document.getElementById('board');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const highScoreEl = document.getElementById('high-score');
const finalScoreEl = document.getElementById('final-score');
const finalHighEl = document.getElementById('final-high');
const gameOverEl = document.getElementById('game-over');
const pausedEl = document.getElementById('paused');
const restartBtn = document.getElementById('restart-btn');
const startBtn = document.getElementById('start-btn');
const resumeBtn = document.getElementById('resume-btn');
const scoreFloaterEl = document.getElementById('score-floater');

// Dynamic block size
let BLOCK_SIZE = 24;

// Tetromino shapes (each shape is a matrix; non-zero cells are the piece's
// 1-based color index so the COLORS lookup in drawMatrix() renders each
// tetromino in its own color).
const SHAPES = [
    [ // I  (color index 1)
        [0,0,0,0],
        [1,1,1,1],
        [0,0,0,0],
        [0,0,0,0]
    ],
    [ // J  (color index 2)
        [2,0,0],
        [2,2,2],
        [0,0,0]
    ],
    [ // L  (color index 3)
        [0,0,3],
        [3,3,3],
        [0,0,0]
    ],
    [ // O  (color index 4)
        [4,4],
        [4,4]
    ],
    [ // S  (color index 5)
        [0,5,5],
        [5,5,0],
        [0,0,0]
    ],
    [ // T  (color index 6)
        [0,6,0],
        [6,6,6],
        [0,0,0]
    ],
    [ // Z  (color index 7)
        [7,7,0],
        [0,7,7],
        [0,0,0]
    ]
];
const COLORS = [
    null,
    '#00f0f0', // I cyan
    '#0000f0', // J blue
    '#f0a000', // L orange
    '#f0f000', // O yellow
    '#00f000', // S green
    '#a000f0', // T purple
    '#f00000'  // Z red
];

let grid = createEmptyGrid();
let current = null;
let dropCounter = 0;
let dropInterval = 1000; // ms
let lastTime = 0;
let score = 0;
let lines = 0;
let level = 1;
let rafId = null;
let queue = [];
let bag = [];
let heldPiece = null;
let canHold = true;
let currentHighScore = 0;
let paused = false;
// Game-time accumulator (ms) that only advances while the game is un-paused.
// Used as the baseline for clearAnim / scoreAnim so in-flight animations
// freeze on pause and resume from the same elapsed time on un-pause.
let gameTime = 0;
// Active line-clear animation (sweep + fall). Non-null while playing.
let clearAnim = null;
// Active score-tick animation (textContent interpolation). Non-null while playing.
let scoreAnim = null;

// Measure the rendered #board element and pick a block size that fits both
// axes. Uses clientWidth/clientHeight (the content box, which excludes the
// 1px border) so the block math reflects the space actually available to
// the canvas inside the board.
function calculateBlockSize() {
    const availableW = Math.max(0, boardEl.clientWidth);
    const availableH = Math.max(0, boardEl.clientHeight);
    const sizeFromWidth = Math.floor(availableW / COLS);
    const sizeFromHeight = Math.floor(availableH / ROWS);
    BLOCK_SIZE = Math.max(
        MIN_BLOCK_SIZE,
        Math.min(MAX_BLOCK_SIZE, Math.min(sizeFromWidth, sizeFromHeight))
    );
}

// Resize the main canvas and the next/hold preview canvases to match the
// actual rendered sizes. The main canvas's CSS display size is also set so
// the rendered size matches its internal resolution (1:1 pixel mapping).
function resizeCanvas() {
    calculateBlockSize();
    const cssW = COLS * BLOCK_SIZE;
    const cssH = ROWS * BLOCK_SIZE;
    canvas.width = cssW;
    canvas.height = cssH;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    // Size the board to the canvas + borders. Without this the board fills
    // the 1fr grid cell and the canvas is flex-centered inside it, leaving
    // a strip of #000 on each side of the canvas that looks like extra
    // unplayable columns. max-width: 100% in CSS caps the board to the
    // cell width on viewports too narrow to hold the canvas.
    boardEl.style.width = (cssW + 2) + 'px';

    // Sync the next/hold preview internal size to the displayed size so the
    // previews stay crisp on both mobile (small) and desktop (larger) layouts.
    [nextCanvas, holdCanvas].forEach(c => {
        const displayed = c.getBoundingClientRect().width;
        const size = Math.max(16, Math.round(displayed));
        if (c.width !== size) c.width = size;
        if (c.height !== size) c.height = size;
    });

    if (rafId) {
        draw();
    }
    drawNext();
    drawHold();
}

function createEmptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function drawMatrix(matrix, offset, targetCtx, blockSize) {
    const context = targetCtx || ctx;
    const size = blockSize || BLOCK_SIZE;
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                context.fillStyle = COLORS[value];
                context.fillRect((x + offset.x) * size,
                                 (y + offset.y) * size,
                                 size - 1,
                                 size - 1);
            }
        });
    });
}

function drawPieceInCanvas(targetCtx, matrix, canvasSize) {
    targetCtx.fillStyle = '#000';
    targetCtx.fillRect(0, 0, canvasSize, canvasSize);

    // Find bounding box of filled cells to centre the piece
    let minX = matrix[0].length, minY = matrix.length, maxX = -1, maxY = -1;
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        });
    });
    if (maxX < 0) return;
    // Derive the preview block size from the canvas size so the piece always
    // fits, regardless of the preview's display dimensions.
    const block = Math.max(8, Math.floor(canvasSize / 4));
    const pieceW = maxX - minX + 1;
    const pieceH = maxY - minY + 1;
    const totalW = pieceW * block;
    const totalH = pieceH * block;
    const offsetX = Math.floor((canvasSize - totalW) / 2 / block) - minX;
    const offsetY = Math.floor((canvasSize - totalH) / 2 / block) - minY;
    drawMatrix(matrix, {x: offsetX, y: offsetY}, targetCtx, block);
}

function drawNext() {
    const piece = queue.length > 0 ? queue[0] : null;
    if (!piece) {
        nextCtx.fillStyle = '#000';
        nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
        return;
    }
    drawPieceInCanvas(nextCtx, piece.matrix, nextCanvas.width);
}

function drawHold() {
    if (heldPiece === null) {
        holdCtx.fillStyle = '#000';
        holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
        return;
    }
    drawPieceInCanvas(holdCtx, SHAPES[heldPiece], holdCanvas.width);
}

function getGhostPos() {
    let y = current.pos.y;
    while (isValidMove(current.matrix, {x: current.pos.x, y: y + 1})) {
        y++;
    }
    return {x: current.pos.x, y: y};
}

function drawGhost(matrix, pos) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                ctx.fillStyle = COLORS[value];
                ctx.globalAlpha = 0.25;
                ctx.fillRect((x + pos.x) * BLOCK_SIZE,
                             (y + pos.y) * BLOCK_SIZE,
                             BLOCK_SIZE - 1,
                             BLOCK_SIZE - 1);
                ctx.globalAlpha = 1;
            }
        });
    });
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (clearAnim && clearAnim.phase === 'fall') {
        drawGridWithFall();
    } else {
        drawGridWithSweepSkip();
    }
    if (clearAnim && clearAnim.phase === 'sweep') {
        drawRowSweep();
    }
    // The current piece is hidden during a clear animation so the playfield
    // shows only the surviving grid mid-animation. The next piece is spawned
    // when finishClearAnim() runs.
    if (current && !clearAnim) {
        const ghost = getGhostPos();
        if (ghost.y !== current.pos.y) {
            drawGhost(current.matrix, ghost);
        }
        drawMatrix(current.matrix, current.pos);
    }
}

function drawGridWithSweepSkip() {
    const skip = clearAnim ? new Set(clearAnim.rows) : null;
    for (let y = 0; y < ROWS; y++) {
        if (skip && skip.has(y)) continue;
        for (let x = 0; x < COLS; x++) {
            const v = grid[y][x];
            if (v === 0) continue;
            ctx.fillStyle = COLORS[v];
            ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
        }
    }
}

function drawRowSweep() {
    // Center-out white wipe: each cell's local progress starts at
    // (distFromCenter / maxDist) * 0.4, so the center column starts at t=0
    // and the edge columns start at t=0.4. Each cell's wipe is 60% of the
    // sweep's total time. While wiping, the cell is a white bar that shrinks
    // horizontally toward its center and fades in the final 30% of its
    // local time. Cells with localT >= 1 are already gone.
    const t = clearAnim.sweepProgress;
    const maxDist = (COLS - 1) / 2;
    for (const rowIdx of clearAnim.rows) {
        for (let x = 0; x < COLS; x++) {
            const dist = Math.abs(x - (COLS - 1) / 2);
            const cellStart = (dist / maxDist) * 0.4;
            const localT = (t - cellStart) / 0.6;
            if (localT <= 0 || localT >= 1) continue;
            let widthFrac, alpha;
            if (localT < 0.3) {
                // Solid white bar with alpha rising
                widthFrac = 1;
                alpha = localT / 0.3;
            } else {
                // Shrink horizontally while held at full alpha
                widthFrac = 1 - (localT - 0.3) / 0.7;
                alpha = 1;
            }
            const w = BLOCK_SIZE * widthFrac;
            const offsetX = (BLOCK_SIZE - w) / 2;
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = alpha;
            ctx.fillRect(x * BLOCK_SIZE + offsetX, rowIdx * BLOCK_SIZE, w, BLOCK_SIZE - 1);
            ctx.globalAlpha = 1;
        }
    }
}

function drawGridWithFall() {
    // Render the grid where each row r is drawn at a Y offset that animates
    // from its pre-clear position down to its post-clear position. Rows
    // marked for clearing are not drawn (they were visually wiped by the
    // sweep phase and are about to be spliced out of `grid`).
    const cleared = new Set(clearAnim.rows);
    const fallProgress = clearAnim.fallProgress;
    for (let y = 0; y < ROWS; y++) {
        if (cleared.has(y)) continue;
        const fallBy = clearAnim.fallByRow[y];
        // Pre-clear row index = y + fallBy. Post-clear = y. Lerp.
        const visualRow = y + fallBy * (1 - fallProgress);
        const yPx = visualRow * BLOCK_SIZE;
        for (let x = 0; x < COLS; x++) {
            const v = grid[y][x];
            if (v === 0) continue;
            ctx.fillStyle = COLORS[v];
            ctx.fillRect(x * BLOCK_SIZE, yPx, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
        }
    }
}

function merge(matrix, pos) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                grid[y + pos.y][x + pos.x] = value;
            }
        });
    });
}

function rotate(matrix) {
    const N = matrix.length - 1;
    const result = matrix.map((row, i) =>
        row.map((val, j) => matrix[N - j][i])
    );
    return result;
}

function isValidMove(matrix, cellOffset) {
    for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < matrix[y].length; x++) {
            if (matrix[y][x] !== 0) {
                const newX = x + cellOffset.x;
                const newY = y + cellOffset.y;
                if (newX < 0 || newX >= COLS || newY < 0 || newY >= ROWS) {
                    return false;
                }
                if (grid[newY][newX] !== 0) {
                    return false;
                }
            }
        }
    }
    return true;
}

function findFullRows() {
    // Identify full rows in grid without mutating it. Returned bottom-to-top
    // so a Tetris (4 full rows) gives a stable ordering for animation state.
    const rows = [];
    for (let y = ROWS - 1; y >= 0; --y) {
        let full = true;
        for (let x = 0; x < COLS; ++x) {
            if (grid[y][x] === 0) { full = false; break; }
        }
        if (full) rows.push(y);
    }
    return rows;
}

function startClearAnim(rows) {
    // Precompute the number of cleared rows below each grid row so the fall
    // phase can lerp each row from its pre-clear position to its post-clear
    // position. Cleared rows themselves stay at 0 (they are not drawn).
    const fallByRow = new Array(ROWS).fill(0);
    for (let r = 0; r < ROWS; r++) {
        let count = 0;
        for (const cr of rows) if (cr < r) count++;
        fallByRow[r] = count;
    }
    clearAnim = {
        phase: 'sweep',
        rows,
        fallByRow,
        sweepStart: gameTime,
        sweepDuration: SWEEP_MS,
        sweepProgress: 0,
        fallStart: 0,
        fallDuration: FALL_MS,
        fallProgress: 0,
    };
}

function tickClearAnim(time) {
    if (!clearAnim) return;
    if (clearAnim.phase === 'sweep') {
        const t = (time - clearAnim.sweepStart) / clearAnim.sweepDuration;
        clearAnim.sweepProgress = Math.min(1, t);
        if (t >= 1) {
            clearAnim.phase = 'fall';
            clearAnim.fallStart = time;
            clearAnim.fallProgress = 0;
        }
    } else if (clearAnim.phase === 'fall') {
        const t = (time - clearAnim.fallStart) / clearAnim.fallDuration;
        // ease-in (gravity): t^2
        clearAnim.fallProgress = Math.min(1, t * t);
        if (t >= 1) {
            finishClearAnim();
        }
    }
}

function finishClearAnim() {
    // Commit the row removal, score, and level changes in a single frame.
    // Splice top-to-bottom so the indices do not shift while we work.
    const sorted = [...clearAnim.rows].sort((a, b) => b - a);
    const linesCleared = sorted.length;
    for (const y of sorted) {
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(0));
    }
    const points = SCORE_TABLE[linesCleared] * level;
    lines += linesCleared;
    if (points > 0) {
        score += points;
        awardScore(points, SCORE_TICK_CLEAR_MS);
        pulseEl(scoreEl, 'score--pulse');
    }
    const newLevel = Math.floor(lines / 10) + 1;
    let levelChanged = false;
    if (newLevel !== level) {
        level = newLevel;
        dropInterval = computeDropInterval(level);
        levelChanged = true;
    }
    // Update non-score stats directly; the score text is owned by the
    // scoreAnim ticker until the tick completes.
    linesEl.textContent = lines;
    levelEl.textContent = level;
    pulseEl(linesEl, 'lines--pulse');
    if (levelChanged) {
        pulseEl(levelEl, 'level--pulse');
    }
    if (score > currentHighScore) {
        currentHighScore = score;
        highScoreEl.textContent = score;
    }
    clearAnim = null;
    spawnNext();
}

function awardScore(delta, durationMs) {
    if (delta <= 0) return;
    // Start the tick from whatever value the sidebar is currently showing,
    // not from the raw `score`. This way a tick already in flight smoothly
    // transitions into the new tick without a visible jump.
    const current = parseInt(scoreEl.textContent, 10) || 0;
    scoreAnim = {
        from: current,
        to: score,
        startTime: gameTime,
        duration: durationMs,
    };
    showFloater('+' + delta);
}

function tickScoreAnim(time) {
    if (!scoreAnim) return;
    const t = Math.min(1, (time - scoreAnim.startTime) / scoreAnim.duration);
    // ease-out cubic
    const e = 1 - Math.pow(1 - t, 3);
    const value = Math.round(scoreAnim.from + (scoreAnim.to - scoreAnim.from) * e);
    scoreEl.textContent = value;
    if (t >= 1) {
        scoreAnim = null;
        // Snap to the authoritative score to absorb any rounding drift.
        scoreEl.textContent = score;
    }
}

function pulseEl(el, className) {
    el.classList.remove(className);
    // Force a reflow so the animation restarts even when the class is
    // re-added in the same frame.
    void el.offsetWidth;
    el.classList.add(className);
}

function showFloater(text) {
    scoreFloaterEl.textContent = text;
    scoreFloaterEl.classList.remove('score-floater--show');
    void scoreFloaterEl.offsetWidth;
    scoreFloaterEl.classList.add('score-floater--show');
}

function computeDropInterval(forLevel) {
    return Math.max(MIN_DROP_INTERVAL, 1000 * Math.pow(LEVEL_SPEED_EXP, forLevel - 1));
}

function updateScore() {
    scoreEl.textContent = formatScoreForDisplay(score);
    linesEl.textContent = lines;
    levelEl.textContent = level;
    if (score > currentHighScore) {
        currentHighScore = score;
        highScoreEl.textContent = score;
    }
}

const MAX_DISPLAYABLE_SCORE = 999999;

function formatScoreForDisplay(value) {
    if (value > MAX_DISPLAYABLE_SCORE) return MAX_DISPLAYABLE_SCORE;
    return value;
}

function readHighScore() {
    try {
        const raw = localStorage.getItem(HIGH_SCORE_KEY);
        const parsed = raw === null ? 0 : parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch (e) {
        return 0;
    }
}

function writeHighScore(value) {
    try {
        localStorage.setItem(HIGH_SCORE_KEY, String(value));
    } catch (e) {
        // localStorage may be disabled (private mode, quota); ignore.
    }
}

function refillBag() {
    const next = [0, 1, 2, 3, 4, 5, 6];
    for (let i = next.length - 1; i > 0; --i) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
    }
    bag.push(...next);
}

function refillQueue() {
    while (queue.length < QUEUE_SIZE) {
        if (bag.length === 0) refillBag();
        const idx = bag.shift();
        const shape = SHAPES[idx];
        queue.push({
            index: idx,
            matrix: shape
        });
    }
}

function nextFromQueue() {
    refillQueue();
    const piece = queue.shift();
    return {
        matrix: piece.matrix,
        index: piece.index,
        pos: {x: Math.floor((COLS - piece.matrix[0].length) / 2), y: 0}
    };
}

function placePiece() {
    merge(current.matrix, current.pos);
    const fullRows = findFullRows();
    if (fullRows.length > 0) {
        // Defer the next-piece spawn until the line-clear animation finishes
        // (see finishClearAnim). During the animation the current piece is
        // hidden and the drop counter is frozen, so the playfield reads as
        // "the rows just got wiped and the rest fell into place."
        startClearAnim(fullRows);
        return;
    }
    spawnNext();
}

function spawnNext() {
    const next = nextFromQueue();
    if (!isValidMove(next.matrix, next.pos)) {
        current = next;
        triggerGameOver();
        return;
    }
    canHold = true;
    current = next;
    drawNext();
}

function resetPiece() {
    const piece = nextFromQueue();
    canHold = true;
    drawNext();
    return piece;
}

function playerDrop() {
    current.pos.y++;
    if (!isValidMove(current.matrix, current.pos)) {
        current.pos.y--;
        placePiece();
    }
    dropCounter = 0;
}

function playerHardDrop() {
    let cellsDropped = 0;
    while (isValidMove(current.matrix, {x: current.pos.x, y: current.pos.y + 1})) {
        current.pos.y++;
        cellsDropped++;
    }
    if (cellsDropped > 0) {
        const bonus = cellsDropped * 2;
        score += bonus;
        awardScore(bonus, SCORE_TICK_HARDDROP_MS);
        pulseEl(scoreEl, 'score--pulse');
    }
    placePiece();
    dropCounter = 0;
}

function playerMove(dir) {
    current.pos.x += dir;
    if (!isValidMove(current.matrix, current.pos)) {
        current.pos.x -= dir;
    }
}

function playerRotate() {
    const rotated = rotate(current.matrix);
    if (isValidMove(rotated, current.pos)) {
        current.matrix = rotated;
    }
}

function pieceFromIndex(index) {
    const shape = SHAPES[index];
    return {
        matrix: shape,
        index: index,
        pos: {x: Math.floor((COLS - shape[0].length) / 2), y: 0}
    };
}

function holdPiece() {
    if (!canHold) return;
    if (heldPiece === null) {
        heldPiece = current.index;
        const next = nextFromQueue();
        if (!isValidMove(next.matrix, next.pos)) {
            current = next;
            triggerGameOver();
            return;
        }
        canHold = false;
        current = next;
        drawNext();
    } else {
        const prevHeld = heldPiece;
        heldPiece = current.index;
        const swapped = pieceFromIndex(prevHeld);
        canHold = false;
        current = swapped;
    }
    drawHold();
}

function update(time = 0) {
    if (paused) {
        // Reset lastTime so the un-pause frame does not deliver a multi-second
        // delta to the drop counter. gameTime (and therefore the animation
        // baselines) is not advanced while paused, so in-flight animations
        // freeze and resume from the same elapsed time on un-pause.
        lastTime = time;
        draw();
        rafId = requestAnimationFrame(update);
        return;
    }
    const delta = time - lastTime;
    lastTime = time;
    gameTime += delta;
    if (clearAnim) {
        tickClearAnim(gameTime);
        tickScoreAnim(gameTime);
        draw();
        rafId = requestAnimationFrame(update);
        return;
    }
    tickScoreAnim(gameTime);
    dropCounter += delta;
    if (dropCounter > dropInterval) {
        playerDrop();
    }
    draw();
    rafId = requestAnimationFrame(update);
}

function togglePause() {
    if (!rafId) return;
    paused = !paused;
    pausedEl.hidden = !paused;
    if (paused) {
        document.body.classList.add('paused');
        // Land focus on the Resume button so keyboard / screen-reader users
        // can immediately press Enter. Deferred so the panel is visible when
        // focus moves (otherwise the browser may scroll or skip the focus).
        setTimeout(() => resumeBtn.focus(), 0);
    } else {
        document.body.classList.remove('paused');
    }
}

function startGame() {
    if (rafId) return;
    grid = createEmptyGrid();
    bag = [];
    queue = [];
    heldPiece = null;
    canHold = true;
    paused = false;
    pausedEl.hidden = true;
    current = resetPiece();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = computeDropInterval(level);
    // Cancel any in-flight animations from a previous game so a stale
    // clearAnim / scoreAnim from a fast Restart click does not leak in.
    clearAnim = null;
    scoreAnim = null;
    gameTime = 0;
    updateScore();
    drawHold();
    lastTime = performance.now();
    rafId = requestAnimationFrame(update);
}

function triggerGameOver() {
    // Reconcile sidebar score if a tick is in flight
    scoreEl.textContent = score;
    scoreAnim = null;
    clearAnim = null;

    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    paused = false;
    pausedEl.hidden = true;
    const high = readHighScore();
    const newHigh = score > high;
    if (newHigh) writeHighScore(score);
    finalScoreEl.textContent = score;
    finalHighEl.textContent = newHigh ? score : high;
    highScoreEl.textContent = newHigh ? score : high;
    gameOverEl.hidden = false;
    startBtn.disabled = false;
}

function restartGame() {
    gameOverEl.hidden = true;
    startGame();
}

// Input handling - Keyboard
document.addEventListener('keydown', event => {
    // Prevent arrow keys from scrolling
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
        event.preventDefault();
    }

    if (!rafId) return;
    if (event.key === 'p' || event.key === 'P') {
        togglePause();
        return;
    }
    if (paused) return;
    // Block gameplay input while a line-clear animation is playing. Pause
    // (above) is intentionally still allowed.
    if (clearAnim) return;
    if (event.key === 'c' || event.key === 'C') {
        holdPiece();
        return;
    }
    switch (event.key) {
        case 'ArrowLeft':
            playerMove(-1);
            break;
        case 'ArrowRight':
            playerMove(1);
            break;
        case 'ArrowDown':
            playerDrop();
            break;
        case 'ArrowUp':
            playerRotate();
            break;
        case ' ':
            if (event.repeat) return;
            playerHardDrop();
            break;
    }
});

// Mobile touch controls
document.querySelectorAll('.control-btn').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!rafId) return;
        if (paused) return;
        // Block gameplay input while a line-clear animation is playing. The
        // pause button is exempt because it is the pause key, not a gameplay
        // action; mobile users get the same short-circuit by tapping pause.
        if (clearAnim && btn.dataset.action !== 'pause') return;

        const action = btn.dataset.action;
        switch (action) {
            case 'left':
                playerMove(-1);
                break;
            case 'right':
                playerMove(1);
                break;
            case 'rotate':
                playerRotate();
                break;
            case 'down':
                playerDrop();
                break;
            case 'hard-drop':
                playerHardDrop();
                break;
            case 'pause':
                togglePause();
                break;
            case 'hold':
                holdPiece();
                break;
        }
    });
});

startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    startGame();
});

restartBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    restartGame();
});

resumeBtn.addEventListener('click', () => {
    togglePause();
});

// Handle resize and orientation change
window.addEventListener('resize', () => {
    resizeCanvas();
});

// Handle orientation change (mainly for mobile)
window.addEventListener('orientationchange', () => {
    // Small delay to let the browser update viewport dimensions
    setTimeout(resizeCanvas, 100);
});

// Re-size when the board's rendered box changes — covers the URL bar showing
// or hiding, soft keyboards, and any other layout-driven viewport change that
// does not fire a window 'resize' event.
if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => resizeCanvas()).observe(boardEl);
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resizeCanvas);
}

// Prevent context menu on long press (mobile)
document.addEventListener('contextmenu', (e) => {
    if (e.target.classList.contains('control-btn')) {
        e.preventDefault();
    }
});

// Initialize canvas size on load
resizeCanvas();
currentHighScore = readHighScore();
highScoreEl.textContent = currentHighScore;
drawNext();
drawHold();

// Reset any stray floater from a previous page load and clear its text once
// its CSS animation finishes so the next awardScore() can fire cleanly.
scoreFloaterEl.classList.remove('score-floater--show');
scoreFloaterEl.textContent = '';
scoreFloaterEl.addEventListener('animationend', () => {
    scoreFloaterEl.classList.remove('score-floater--show');
    scoreFloaterEl.textContent = '';
});