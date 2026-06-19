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
const startBtn = document.getElementById('start-btn');

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
let rafId = null;

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
        score += linesCleared * 100; // simple scoring
        updateScore();
    }
}

function updateScore() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
}

function placePiece() {
    merge(current.matrix, current.pos);
    clearLines();
    current = resetPiece();
}

function resetPiece() {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    return {
        matrix: shape,
        pos: {x: Math.floor((COLS - shape[0].length) / 2), y: 0}
    };
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
    current = resetPiece();
    score = 0;
    lines = 0;
    updateScore();
    dropInterval = 1000;
    lastTime = performance.now();
    rafId = requestAnimationFrame(update);
}

function endGame() {
    cancelAnimationFrame(rafId);
    rafId = null;
    alert(`Game Over! Score: ${score}`);
    startBtn.disabled = false;
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
    }
});

startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    startGame();
});