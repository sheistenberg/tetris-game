// Tetris game stub – to be implemented in subsequent tasks
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const startBtn = document.getElementById('start-btn');

let score = 0;
let lines = 0;
let animationId = null;

function draw() {
    // clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // draw placeholder
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Tetris', canvas.width / 2, canvas.height / 2);
}

function updateScore() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
}

function startGame() {
    if (animationId) return;
    score = 0;
    lines = 0;
    updateScore();
    draw();
    // main loop placeholder
    function loop() {
        // TODO: game logic
        animationId = requestAnimationFrame(loop);
    }
    animationId = requestAnimationFrame(loop);
}

startBtn.addEventListener('click', startGame);