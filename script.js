// Constants
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 24; // pixels
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
canvas.width = COLS * BLOCK_SIZE;
canvas.height = ROWS * BLOCK_SIZE;
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const musicBtn = document.getElementById('music-btn');
const themeSelect = document.getElementById('theme-select');
const restartBtn = document.getElementById('restart-btn');
const resumeBtn = document.getElementById('resume-btn');
const finalScoreEl = document.getElementById('final-score');
const leftBtn = document.getElementById('left-btn');
const rightBtn = document.getElementById('right-btn');
const downBtn = document.getElementById('down-btn');
const rotateBtn = document.getElementById('rotate-btn');
const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const gameOverOverlay = document.getElementById('game-over');
const pauseOverlay = document.getElementById('pause-overlay');

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
let nextPiece = null;
let holdPiece = null;
let canHold = true;
let dropCounter = 0;
let dropInterval = 1000; // ms
let lastTime = 0;
let score = 0;
let lines = 0;
let level = 1;
const LINES_PER_LEVEL = 10;
let rafId = null;
let isPaused = false;
let isGameOver = false;

// Sound effects (graceful handling if files missing)
const moveSound = new Audio('assets/sounds/move.wav');
const rotateSound = new Audio('assets/sounds/rotate.wav');
const clearSound = new Audio('assets/sounds/clear.wav');
const levelUpSound = new Audio('assets/sounds/levelup.wav');
const gameOverSound = new Audio('assets/sounds/gameover.wav');
let bgMusic = new Audio('assets/sounds/bgmusic.mp3');
bgMusic.loop = true;
let musicEnabled = true;

// High score from localStorage
let highScore = parseInt(localStorage.getItem('tetrisHighScore')) || 0;

// Initialize
function createEmptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function drawMatrix(matrix, offset) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                ctx.fillStyle = COLORS[value];
                ctx.fillRect((x + offset.x) * BLOCK_SIZE,
                             (y + offset.y) * BLOCK_SIZE,
                             BLOCK_SIZE - 1,
                             BLOCK_SIZE - 1);
            }
        });
    });
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
        lines += linesCleared;
        // Classic Tetris scoring
        const pointsPerLine = [0, 40, 100, 300, 1200];
        score += pointsPerLine[linesCleared] * level;
        // If we cleared lines, maybe play clear sound
        if (musicEnabled) clearSound.play().catch(() => {});
    }
}

function updateScore() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    // Update high score if needed
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('tetrisHighScore', highScore);
    }
}

function updateLevel() {
    const newLevel = Math.floor(lines / LINES_PER_LEVEL) + 1;
    if (newLevel !== level) {
        level = newLevel;
        levelEl.textContent = level;
        // Increase speed: exponential
        dropInterval = 1000 / Math.pow(1.2, level - 1);
        if (musicEnabled) levelUpSound.play().catch(() => {});
    }
}

function placePiece() {
    merge(current.matrix, current.pos);
    clearLines();
    // Shift next to current, generate new next
    current = nextPiece;
    nextPiece = resetPiece();
    canHold = true; // allow hold again after new piece enters
    drawPreview();
    drawHold();
    // Check for game over: if the current piece (just placed) caused overflow? Actually game over detected before placing new piece.
    // We'll check in resetPiece or before spawning.
}

function resetPiece() {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const piece = {
        matrix: shape,
        pos: {x: Math.floor((COLS - shape[0].length) / 2), y: 0}
    };
    // Game over check: if the new piece cannot spawn (collision at top)
    if (!isValidMove(piece.matrix, piece.pos)) {
        return null; // signal game over
    }
    return piece;
}

function playerDrop() {
    if (!current || isPaused || isGameOver) return;
    current.pos.y++;
    if (!isValidMove(current.matrix, current.pos)) {
        current.pos.y--;
        placePiece();
        if (current === null) {
            gameOver();
        }
    }
    dropCounter = 0;
}

function playerMove(dir) {
    if (!current || isPaused || isGameOver) return;
    current.pos.x += dir;
    if (!isValidMove(current.matrix, current.pos)) {
        current.pos.x -= dir;
    }
    if (musicEnabled) moveSound.play().catch(() => {});
}

function playerRotate() {
    if (!current || isPaused || isGameOver) return;
    const rotated = rotate(current.matrix);
    if (isValidMove(rotated, current.pos)) {
        current.matrix = rotated;
        if (musicEnabled) rotateSound.play().catch(() => {});
    }
}

function handleHold() {
    if (!current || !canHold || isPaused || isGameOver) return;
    canHold = false;
    if (holdPiece === null) {
        holdPiece = {
            matrix: current.matrix,
            pos: {x: current.pos.x, y: current.pos.y}
        };
        // Get new current from next piece
        current = nextPiece;
        nextPiece = resetPiece();
        if (current === null) {
            gameOver();
        }
    } else {
        // Swap current and hold
        const holdMatrix = holdPiece.matrix;
        holdPiece.matrix = current.matrix;
        current.matrix = holdMatrix;
        // Adjust position to top center (like new piece)
        current.pos = {x: Math.floor((COLS - current.matrix[0].length) / 2), y: 0};
        if (!isValidMove(current.matrix, current.pos)) {
            // If spawn invalid, revert? Should not happen if hold piece previously was valid.
            // For safety, we could revert but assume fine.
        }
    }
    drawHold();
    drawPreview();
}

function drawPreview() {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    if (!nextPiece) return;
    const matrix = nextPiece.matrix;
    // Scale to fit canvas (assuming 60x60, block size 12)
    const blockSize = 12;
    const offsetX = (previewCanvas.width - matrix[0].length * blockSize) / 2;
    const offsetY = (previewCanvas.height - matrix.length * blockSize) / 2;
    previewCtx.fillStyle = '#000';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                previewCtx.fillStyle = COLORS[value];
                previewCtx.fillRect(offsetX + x * blockSize,
                                    offsetY + y * blockSize,
                                    blockSize - 1,
                                    blockSize - 1);
            }
        });
    });
}

function drawHold() {
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (!holdPiece) return;
    const matrix = holdPiece.matrix;
    const blockSize = 12;
    const offsetX = (holdCanvas.width - matrix[0].length * blockSize) / 2;
    const offsetY = (holdCanvas.height - matrix.length * blockSize) / 2;
    holdCtx.fillStyle = '#000';
    holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                holdCtx.fillStyle = COLORS[value];
                holdCtx.fillRect(offsetX + x * blockSize,
                                 offsetY + y * blockSize,
                                 blockSize - 1,
                                 blockSize - 1);
            }
        });
    });
}

function update(time = 0) {
    if (isPaused || !current) {
        // still need to draw? we'll draw but not update logic
        draw();
        rafId = requestAnimationFrame(update);
        return;
    }
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
    // Reset game state
    grid = createEmptyGrid();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 1000;
    isPaused = false;
    isGameOver = false;
    canHold = true;
    holdPiece = null;
    current = resetPiece();
    nextPiece = resetPiece();
    updateScore();
    levelEl.textContent = level;
    drawPreview();
    drawHold();
    hideGameOverOverlay();
    hidePauseOverlay();
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    musicBtn.disabled = false;
    lastTime = performance.now();
    rafId = requestAnimationFrame(update);
    // Start background music if enabled
    if (musicEnabled) {
        bgMusic.play().catch(() => {});
    }
}

function gameOver() {
    isGameOver = true;
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    // Play game over sound
    if (musicEnabled) gameOverSound.play().catch(() => {});
    // Pause background music
    bgMusic.pause();
    // Show final score
    finalScoreEl.textContent = score;
    showGameOverOverlay();
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    musicBtn.disabled = true;
}

function showGameOverOverlay() {
    gameOverOverlay.classList.add('visible');
}
function hideGameOverOverlay() {
    gameOverOverlay.classList.remove('visible');
}
function showPauseOverlay() {
    pauseOverlay.classList.add('visible');
}
function hidePauseOverlay() {
    pauseOverlay.classList.remove('visible');
}

// Input handling
document.addEventListener('keydown', event => {
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
        case 'c':
        case 'C':
            handleHold();
            break;
        case 'p':
        case 'P':
            togglePause();
            break;
    }
});

startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    startGame();
});

pauseBtn.addEventListener('click', togglePause);
musicBtn.addEventListener('click', toggleMusic);
restartBtn.addEventListener('click', () => {
    hideGameOverOverlay();
    startGame();
});
resumeBtn.addEventListener('click', togglePause);
themeSelect.addEventListener('change', changeTheme);
leftBtn.addEventListener('click', () => playerMove(-1));
rightBtn.addEventListener('click', () => playerMove(1));
downBtn.addEventListener('click', playerDrop);
rotateBtn.addEventListener('click', playerRotate);

function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;
    if (isPaused) {
        // Cancel animation frame
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        showPauseOverlay();
        pauseBtn.textContent = 'Resume';
        // Pause music
        if (musicEnabled) bgMusic.pause();
    } else {
        hidePauseOverlay();
        pauseBtn.textContent = 'Pause';
        // Resume music
        if (musicEnabled) bgMusic.play().catch(() => {});
        lastTime = performance.now();
        rafId = requestAnimationFrame(update);
    }
    // Disable/enable other buttons as needed
    startBtn.disabled = isPaused;
    musicBtn.disabled = !isPaused && !musicEnabled ? false : false; // keep enabled
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    musicBtn.textContent = musicEnabled ? 'Music: On' : 'Music: Off';
    if (musicEnabled) {
        // Resume or start music if game is running
        if (!isPaused && !isGameOver && rafId) {
            bgMusic.play().catch(() => {});
        }
    } else {
        bgMusic.pause();
    }
}

function changeTheme() {
    const selected = themeSelect.value;
    document.documentElement.className = selected; // replace all classes with selected
    // Save preference
    localStorage.setItem('tetrisTheme', selected);
}

// Load theme from localStorage on startup
function loadTheme() {
    const saved = localStorage.getItem('tetrisTheme');
    if (saved) {
        themeSelect.value = saved;
        document.documentElement.className = saved;
    }
}

// Initialize on page load
window.addEventListener('load', () => {
    loadTheme();
    // Optionally hide start button until first start? keep as is.
});
