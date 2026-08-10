// =================================================================
// 12-penalty.js — 点球大战
// 绿茵对决 · 足球游戏
//
// 标准 5 轮点球 + 突然死亡加罚。
// 玩家瞄球门上下 → 空格键锁定 → 门将随机扑救。
// =================================================================

function startPenalty() {
    mode = 'penalty';
    penScore = [0, 0]; penShots = [0, 0]; penRound = 1;
    penSuddenDeath = false; penResult = '';
    document.getElementById('sRed').textContent = '0';
    document.getElementById('sBlue').textContent = '0';
    document.getElementById('sTime').textContent = 'PEN';
    document.getElementById('penHUD').style.display = 'flex';
    document.getElementById('btnDebug').style.display = 'none';
    renderPenHUD();
    beginPlayerPen();
    hideOverlay();
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        document.getElementById('mctrl').classList.add('show');
    }
}

function beginPlayerPen() {
    penState = 'aim';
    penBall.x = PEN_SPOT_L.x; penBall.y = PEN_SPOT_L.y;
    penBall.vx = 0; penBall.vy = 0;
    aimY = FH / 2; aimDir = Math.random() < 0.5 ? 1 : -1;
    keeperX = WALL + GOAL_D;
    showMsg('你的回合：瞄准并射门', 1200);
}

function lockPenShot() {
    penTargetY = aimY;
    const zones = [FH / 2 - GOAL_H / 2 + 30, FH / 2, FH / 2 + GOAL_H / 2 - 30];
    keeperDiveY = zones[Math.floor(Math.random() * 3)] + rand(-10, 10);
    const dx = 0 - PEN_SPOT_L.x, dy = penTargetY - PEN_SPOT_L.y;
    const d = Math.hypot(dx, dy) || 1, sp = 10;
    penBall.vx = dx / d * sp; penBall.vy = dy / d * sp;
    penState = 'shoot';
}

function updatePenalty(dt) {
    if (penState === 'aim') {
        aimY += aimDir * aimSpeed;
        const top = FH / 2 - GOAL_H / 2 + 18, bot = FH / 2 + GOAL_H / 2 - 18;
        if (aimY < top) { aimY = top; aimDir = 1; }
        if (aimY > bot) { aimY = bot; aimDir = -1; }
    } else if (penState === 'shoot') {
        penBall.x += penBall.vx; penBall.y += penBall.vy;
        if (penBall.x <= WALL + GOAL_D + 6) {
            const saved = Math.abs(penBall.y - keeperDiveY) < 32;
            penResult = saved ? 'saved' : 'goal';
            penBall.vx = 0; penBall.vy = 0;
            if (!saved) penScore[TEAM_RED]++;
            penShots[TEAM_RED]++;
            document.getElementById('sRed')!.textContent = String(penScore[TEAM_RED]);
            renderPenHUD();
            showMsg(saved ? '被扑出！' : '进球！', 1200);
            penState = 'result'; penTimer = 1.4;
        }
    } else if (penState === 'result') {
        penTimer -= dt;
        if (penTimer <= 0) { if (checkPenOver()) return; beginAIPen(); }
    } else if (penState === 'ai-aim') {
        penTimer -= dt;
        if (penTimer <= 0) {
            penTargetY = FH / 2 + rand(-GOAL_H / 2 + 25, GOAL_H / 2 - 25);
            const zones = [FH / 2 - GOAL_H / 2 + 30, FH / 2, FH / 2 + GOAL_H / 2 - 30];
            keeperDiveY = zones[Math.floor(Math.random() * 3)] + rand(-10, 10);
            const dx = FW - PEN_SPOT_R.x, dy = penTargetY - PEN_SPOT_R.y;
            const d = Math.hypot(dx, dy) || 1, sp = 10;
            penBall.vx = dx / d * sp; penBall.vy = dy / d * sp;
            penState = 'ai-shoot';
        }
    } else if (penState === 'ai-shoot') {
        penBall.x += penBall.vx; penBall.y += penBall.vy;
        if (penBall.x >= FW - WALL - GOAL_D - 6) {
            const saved = Math.abs(penBall.y - keeperDiveY) < 32;
            penResult = saved ? 'saved' : 'goal';
            penBall.vx = 0; penBall.vy = 0;
            if (!saved) penScore[TEAM_BLUE]++;
            penShots[TEAM_BLUE]++;
            document.getElementById('sBlue')!.textContent = String(penScore[TEAM_BLUE]);
            renderPenHUD();
            showMsg(saved ? '扑出！' : '失球！', 1200);
            penState = 'ai-result'; penTimer = 1.4;
        }
    } else if (penState === 'ai-result') {
        penTimer -= dt;
        if (penTimer <= 0) { if (checkPenOver()) return; penRound++; beginPlayerPen(); }
    }
}

function beginAIPen() {
    penState = 'ai-aim'; penTimer = 0.8;
    penBall.x = PEN_SPOT_R.x; penBall.y = PEN_SPOT_R.y;
    penBall.vx = 0; penBall.vy = 0;
    keeperX = FW - WALL - GOAL_D;
    showMsg('蓝队回合', 900);
}

// 判断点球是否结束（标准 5 轮 + 突然死亡）
function checkPenOver() {
    if (penRound >= 5 && !penSuddenDeath) {
        const remR = 5 - penRound;
        if (Math.abs(penScore[0] - penScore[1]) > remR) { endPenalty(); return true; }
        if (penShots[0] >= 5 && penShots[1] >= 5 && penScore[0] !== penScore[1]) { endPenalty(); return true; }
        if (penShots[0] >= 5 && penShots[1] >= 5) { penSuddenDeath = true; }
    }
    if (penSuddenDeath && penShots[0] >= 5 + (penRound - 5) && penShots[1] >= 5 + (penRound - 5)) {
        if (penScore[0] !== penScore[1]) { endPenalty(); return true; }
    }
    return false;
}

function endPenalty() {
    penState = 'over';
    let res, cls;
    if (penScore[0] > penScore[1]) { res = '红队夺冠'; cls = 'red'; }
    else if (penScore[0] < penScore[1]) { res = '蓝队夺冠'; cls = 'blue'; }
    else { res = '平局'; cls = 'draw'; }
    showPanel(`<h1>点球大战结束</h1><div class="tag">PENALTY SHOOTOUT</div>
<div class="big ${cls}">${res}</div>
<p style="font-size:22px;color:#fff">红队 ${penScore[0]} : ${penScore[1]} 蓝队</p>
<div class="btns"><button class="btn btn-secondary" data-mode="penalty">再战一场</button><button class="btn btn-primary" data-mode="match">友谊赛</button><button class="btn btn-ghost" data-mode="menu">返回主菜单</button></div>`);
}

// 点球 HUD（进球/未进点标注）
function renderPenHUD() {
    const hud = document.getElementById('penHUD');
    let html = '<div class="pen-row"><span class="pen-label" style="color:#e63946">红</span>';
    for (let i = 0; i < 5; i++) {
        const s = penScore[0] > i ? 'in' : (penShots[0] > i ? 'out' : '');
        html += `<div class="pen-dot ${s}"></div>`;
    }
    html += '</div><div class="pen-row"><span class="pen-label" style="color:#3a86ff">蓝</span>';
    for (let i = 0; i < 5; i++) {
        const s = penScore[1] > i ? 'in' : (penShots[1] > i ? 'out' : '');
        html += `<div class="pen-dot ${s}"></div>`;
    }
    html += '</div>';
    hud.innerHTML = html;
}
