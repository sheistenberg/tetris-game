// Constants
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
const controlsEl = document.getElementById('controls');
const controlsBtn = document.getElementById('controls-btn');
const controlsCloseBtn = document.getElementById('controls-close-btn');

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
    drawMatrix(grid, {x: 0, y: 0});
    if (current) {
        const ghost = getGhostPos();
        if (ghost.y !== current.pos.y) {
            drawGhost(current.matrix, ghost);
        }
        drawMatrix(current.matrix, current.pos);
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

function clearLines() {
    let linesCleared = 0;
    outer: for (let y = ROWS - 1; y >= 0; --y) {
        for (let x = 0; x < COLS; ++x) {
            if (grid[y][x] === 0) {
                continue outer;
            }
        }
        // row is full
        const row = grid.splice(y, 1)[0];
        grid.unshift(Array(COLS).fill(0));
        linesCleared++;
        y++; // recheck same line index after shift
    }
    if (linesCleared > 0) {
        lines += linesCleared;
        const newLevel = Math.floor(lines / 10) + 1;
        score += SCORE_TABLE[linesCleared] * level;
        if (newLevel !== level) {
            level = newLevel;
            dropInterval = computeDropInterval(level);
        }
        updateScore();
    }
}

function computeDropInterval(forLevel) {
    return Math.max(MIN_DROP_INTERVAL, 1000 * Math.pow(LEVEL_SPEED_EXP, forLevel - 1));
}

function updateScore() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    levelEl.textContent = level;
    if (score > currentHighScore) {
        currentHighScore = score;
        highScoreEl.textContent = score;
    }
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
    clearLines();
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
        score += cellsDropped * 2;
        updateScore();
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
    const delta = time - lastTime;
    lastTime = time;
    if (paused) {
        draw();
        rafId = requestAnimationFrame(update);
        return;
    }
    dropCounter += delta;
    if (dropCounter > dropInterval) {
        // playerDrop() can chain into placePiece() -> triggerGameOver(), which
        // cancels the current rAF and sets rafId = null. In that case the
        // game is over and we must NOT re-schedule a new frame, otherwise the
        // animation would keep running, the board would keep filling with
        // stuck pieces, and restartGame() -> startGame() would early-return
        // on its `if (rafId) return` guard, leaving the old grid in place.
        playerDrop();
    }
    draw();
    if (rafId !== null) {
        rafId = requestAnimationFrame(update);
    }
}

function togglePause() {
    if (!rafId) return;
    paused = !paused;
    pausedEl.hidden = !paused;
    if (paused) {
        // Land focus on the Resume button so keyboard / screen-reader users
        // can immediately press Enter. Deferred so the panel is visible when
        // focus moves (otherwise the browser may scroll or skip the focus).
        setTimeout(() => resumeBtn.focus(), 0);
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
    // Reset the soft-drop accumulator so a stale value from the previous run
    // cannot force an immediate playerDrop() on the first frame of the new one.
    dropCounter = 0;
    updateScore();
    drawHold();
    lastTime = performance.now();
    rafId = requestAnimationFrame(update);
}

function triggerGameOver() {
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
        if (!controlsEl.hidden) return;
        togglePause();
        return;
    }
    if (paused) return;
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

// Controls modal — a desktop reference for the keyboard shortcuts. Opening
// the modal pauses a running game so a piece cannot auto-drop while the
// player is reading; closing it resumes the game only if the modal was
// the one that paused it. If the game was already paused (or not running)
// when the modal opened, closing the modal leaves the state alone.
let wasRunningBeforeControls = false;

function openControls() {
    wasRunningBeforeControls = rafId !== null && !paused;
    if (wasRunningBeforeControls) {
        togglePause();
    }
    controlsEl.hidden = false;
    // Defer focus so the browser paints the modal before focus moves
    // (otherwise some browsers skip the focus or scroll unexpectedly).
    setTimeout(() => controlsCloseBtn.focus(), 0);
}

function closeControls() {
    if (controlsEl.hidden) return;
    controlsEl.hidden = true;
    if (wasRunningBeforeControls && paused) {
        togglePause();
    }
    wasRunningBeforeControls = false;
}

controlsBtn.addEventListener('click', openControls);
controlsCloseBtn.addEventListener('click', closeControls);
// Backdrop click closes the modal; clicks on the panel itself do not.
controlsEl.addEventListener('click', (e) => {
    if (e.target === controlsEl) closeControls();
});
// Escape closes the modal from anywhere, but only when it is open so the
// key still works for the P-key pause binding when the modal is hidden.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !controlsEl.hidden) {
        e.preventDefault();
        closeControls();
    }
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