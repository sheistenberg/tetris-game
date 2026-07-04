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
const PREVIEW_BLOCK = 20;
const PREVIEW_PADDING = 6;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const startBtn = document.getElementById('start-btn');

// Dynamic block size
let BLOCK_SIZE = 24;

// Tetromino shapes (each shape is a matrix of 0s and 1s)
const SHAPES = [
    [ // I
        [0,0,0,0],
        [1,1,1,1],
        [0,0,0,0],
        [0,0,0,0]
    ],
    [ // J
        [1,0,0],
        [1,1,1],
        [0,0,0]
    ],
    [ // L
        [0,0,1],
        [1,1,1],
        [0,0,0]
    ],
    [ // O
        [1,1],
        [1,1]
    ],
    [ // S
        [0,1,1],
        [1,1,0],
        [0,0,0]
    ],
    [ // T
        [0,1,0],
        [1,1,1],
        [0,0,0]
    ],
    [ // Z
        [1,1,0],
        [0,1,1],
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

// Calculate block size based on viewport
function calculateBlockSize() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Available width for canvas (accounting for padding)
    const availableWidth = viewportWidth - (PADDING * 2) - 20; // 20px for sidebar on mobile
    // Available height for canvas (accounting for header, sidebar, controls)
    const headerHeight = 80; // h1 + margins
    const sidebarHeight = 120; // score/lines/level + button
    const controlsHeight = viewportWidth < 600 ? 180 : 0; // mobile controls
    const availableHeight = viewportHeight - headerHeight - sidebarHeight - controlsHeight - (PADDING * 2);
    
    // Calculate based on width and height constraints
    const sizeFromWidth = Math.floor(availableWidth / COLS);
    const sizeFromHeight = Math.floor(availableHeight / ROWS);
    
    // Use the smaller one to ensure it fits
    let newSize = Math.min(sizeFromWidth, sizeFromHeight);
    
    // Clamp to min/max
    newSize = Math.max(MIN_BLOCK_SIZE, Math.min(MAX_BLOCK_SIZE, newSize));
    
    BLOCK_SIZE = newSize;
}

// Resize canvas based on current block size
function resizeCanvas() {
    calculateBlockSize();
    canvas.width = COLS * BLOCK_SIZE;
    canvas.height = ROWS * BLOCK_SIZE;
    // Redraw if game is running
    if (rafId) {
        draw();
    }
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
    const pieceW = maxX - minX + 1;
    const pieceH = maxY - minY + 1;
    const totalW = pieceW * PREVIEW_BLOCK;
    const totalH = pieceH * PREVIEW_BLOCK;
    const offsetX = Math.floor((canvasSize - totalW) / 2 / PREVIEW_BLOCK) - minX;
    const offsetY = Math.floor((canvasSize - totalH) / 2 / PREVIEW_BLOCK) - minY;
    drawMatrix(matrix, {x: offsetX, y: offsetY}, targetCtx, PREVIEW_BLOCK);
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
    if (!heldPiece) {
        holdCtx.fillStyle = '#000';
        holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
        return;
    }
    drawPieceInCanvas(holdCtx, heldPiece.matrix, holdCanvas.width);
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(grid, {x: 0, y: 0});
    if (current) {
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
        const newLevel = Math.floor(lines / 10) + 1;
        lines += linesCleared;
        score += linesCleared * 100; // simple scoring; replaced by classic table in P1
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
    refillQueue();
    return {
        matrix: piece.matrix,
        index: piece.index,
        pos: {x: Math.floor((COLS - piece.matrix[0].length) / 2), y: 0}
    };
}

function placePiece() {
    merge(current.matrix, current.pos);
    clearLines();
    current = resetPiece();
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

function update(time = 0) {
    const delta = time - lastTime;
    lastTime = time;
    dropCounter += delta;
    if (dropCounter > dropInterval) {
        playerDrop();
    }
    draw();
    rafId = requestAnimationFrame(update);
}

function startGame() {
    if (rafId) return;
    grid = createEmptyGrid();
    bag = [];
    queue = [];
    current = resetPiece();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = computeDropInterval(level);
    updateScore();
    lastTime = performance.now();
    rafId = requestAnimationFrame(update);
}

function endGame() {
    cancelAnimationFrame(rafId);
    rafId = null;
    alert(`Game Over! Score: ${score}`);
    startBtn.disabled = false;
}

// Input handling - Keyboard
document.addEventListener('keydown', event => {
    // Prevent arrow keys from scrolling
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
    }
    
    if (!rafId) return;
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
        }
    });
});

startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    startGame();
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

// Prevent context menu on long press (mobile)
document.addEventListener('contextmenu', (e) => {
    if (e.target.classList.contains('control-btn')) {
        e.preventDefault();
    }
});

// Initialize canvas size on load
resizeCanvas();