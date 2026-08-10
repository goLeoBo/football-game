// =================================================================
// 03-input.js — 键盘、触屏摇杆 & 按钮输入
// 绿茵对决 · 足球游戏
//
// 键盘映射：方向键/WASD 移动，空格射门，Q 传球，C 铲断，
// Z 冲刺，X 切换球员，P 暂停。
// 触屏：左下摇杆移动，右下按钮传球/射门/铲断/冲刺。
// =================================================================

const keys = {};

// 键盘事件
window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
    }
    // 比赛模式按键
    if (mode === 'match') {
        if (k === 'x') switchPlayer();
        if (k === 'p' && (state === 'playing' || state === 'paused')) {
            state = state === 'playing' ? 'paused' : 'playing';
        }
        if (replayActive && (k === ' ' || k === 'enter')) skipReplay();
    } else if (mode === 'penalty') {
        if (k === ' ' && penState === 'aim') lockPenShot();
    }
});

window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// 读取移动输入（键盘 + 摇杆）
function readMove() {
    let x = 0, y = 0;
    if (keys['arrowleft'] || keys['a']) x -= 1;
    if (keys['arrowright'] || keys['d']) x += 1;
    if (keys['arrowup'] || keys['w']) y -= 1;
    if (keys['arrowdown'] || keys['s']) y += 1;
    x += stick.dx; y += stick.dy;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
}

// 切换控制球员（红队非门将中离球最近的）
function switchPlayer() {
    let best = -1, bd = 1e9;
    players.forEach((p, i) => {
        if (p.team === TEAM_RED && !p.gk && i !== activeIdx) {
            const d = dist(p, ball);
            if (d < bd) { bd = d; best = i; }
        }
    });
    if (best >= 0) activeIdx = best;
}

// --- 触屏摇杆 ---
const stick = { dx: 0, dy: 0, active: false, id: 0, cx: 0, cy: 0 };
const stickEl = document.getElementById('stick');
const knobEl = document.getElementById('stickKnob');

function stickStart(e) {
    stick.active = true;
    const r = stickEl.getBoundingClientRect();
    stick.cx = r.left + r.width / 2;
    stick.cy = r.top + r.height / 2;
    stick.id = e.pointerId || 0;
    stickMove(e);
}

function stickMove(e) {
    if (!stick.active) return;
    let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    const R = 50, m = Math.hypot(dx, dy);
    if (m > R) { dx = dx / m * R; dy = dy / m * R; }
    stick.dx = dx / R; stick.dy = dy / R;
    knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

function stickEnd() {
    stick.active = false; stick.dx = 0; stick.dy = 0;
    knobEl.style.transform = 'translate(-50%,-50%)';
}

stickEl.addEventListener('pointerdown', stickStart);
window.addEventListener('pointermove', stickMove);
window.addEventListener('pointerup', stickEnd);
window.addEventListener('pointercancel', stickEnd);

// --- 移动端按钮 ---
document.getElementById('btnShoot').addEventListener('pointerdown', e => {
    e.preventDefault();
    if (mode === 'match') actionShoot();
    else if (mode === 'penalty' && penState === 'aim') lockPenShot();
});

document.getElementById('btnPass').addEventListener('pointerdown', e => {
    e.preventDefault();
    if (mode === 'match') actionPass();
});

const btnSprint = document.getElementById('btnSprint');
btnSprint.addEventListener('pointerdown', e => { e.preventDefault(); keys['z'] = true; });
btnSprint.addEventListener('pointerup', e => { keys['z'] = false; });
btnSprint.addEventListener('pointerleave', e => { keys['z'] = false; });
btnSprint.addEventListener('pointercancel', e => { keys['z'] = false; });

document.getElementById('btnTackle').addEventListener('pointerdown', e => {
    e.preventDefault();
    if (mode === 'match') actionTackle();
});
