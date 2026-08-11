// =================================================================
// 11-physics.js — 比赛物理（球员移动、球物理、铲断、射门、传球、进球）
// 绿茵对决 · 足球游戏
//
// physicsStep(dt, fullAI): 每帧更新物理。fullAI=true 时全体由 AI 控制。
// 处理顺序：任意球/球门球/长传蓄力 → 玩家控制 → AI → 碰撞 → z轴 → 边界 → 进球
// =================================================================

function physicsStep(dt, fullAI) {
    // 任意球模式优先
    if (freeKick) {
        updateFreeKick(dt);
        players.forEach(p => {
            if (p.sentOff) return;
            p.x += p.vx; p.y += p.vy; p.vx *= 0.82; p.vy *= 0.82;
            p.kick = Math.max(0, p.kick - dt);
        });
        if (ball.owner) {
            const op = ball.owner;
            ball.x = op.x + op.face.x * 12;
            ball.y = op.y + op.face.y * 12;
        }
        return;
    }

    // 球门球模式
    if (goalKick) {
        updateGoalKick(dt);
        players.forEach(p => {
            if (p.sentOff) return;
            p.x += p.vx; p.y += p.vy; p.vx *= 0.82; p.vy *= 0.82;
            p.kick = Math.max(0, p.kick - dt);
        });
        if (ball.owner) {
            const op = ball.owner;
            ball.x = op.x + op.face.x * 12;
            ball.y = op.y + op.face.y * 12;
        }
        return;
    }

    // 高空长传蓄力模式
    if (lobPass) {
        updateLobPass(dt);
        return;
    }

    // --- 2. 玩家输入 ---
    const mv = readMove();
    const ap = players[activeIdx];
    if (ap) {
        let max = 1.4, acc = 0.4;
        const moving = Math.abs(mv.x) > 0.1 || Math.abs(mv.y) > 0.1;
        const sprinting = keys['z'] && ap.stamina > 10 && moving;
        if (sprinting) {
            max = 2.2; acc = 0.62;
            ap.stamina = Math.max(0, ap.stamina - 0.85);
        } else {
            ap.stamina = Math.min(100, ap.stamina + 0.32);
        }
        ap.vx += mv.x * acc; ap.vy += mv.y * acc;
        const v = Math.hypot(ap.vx, ap.vy);
        if (v > max) { ap.vx = ap.vx / v * max; ap.vy = ap.vy / v * max; }
        if (moving) ap.face = { x: mv.x, y: mv.y };
        // 按键行动
        if (keys[' ']) actionShoot();
        if (keys['q']) actionPass();
        if (keys['c']) actionTackle();
    }

    // --- 3. AI ---
    const [chaserRed, secRed] = getTeamPressers(TEAM_RED);
    const [chaserBlue, secBlue] = getTeamPressers(TEAM_BLUE);
    players.forEach((p, i) => {
        if (i === activeIdx) return;
        if (fullAI || !p.gk) aiUpdate(p, dt, i,
            p.team === TEAM_RED ? chaserRed : chaserBlue,
            p.team === TEAM_RED ? secRed : secBlue);
    });

    // --- 4. 球员移动 & 铲球碰撞 ---
    players.forEach(p => {
        if (p.sentOff) return;
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.82; p.vy *= 0.82;
        p.kick = Math.max(0, p.kick - dt);

        if (p.slide > 0) {
            p.slide -= dt;
            players.forEach(q => {
                if (q === p || q.sentOff || q.team === p.team) return;
                if (dist(p, q) < p.r + q.r + 2) {
                    // 铲到球 → 断球；铲到人先于球 → 犯规
                    if (ball.owner === q || dist(p, ball) > 30) {
                        checkTackleFoul(p, q);
                        q.vx += p.slideDir.x * 2;
                        q.vy += p.slideDir.y * 2;
                        p.slide = 0; p.vx = 0; p.vy = 0;
                    } else {
                        ball.vx = p.slideDir.x * 6;
                        ball.vy = p.slideDir.y * 6;
                        ball.vz = 0; ball.z = 0;
                        ball.owner = null; ball.lastTeam = p.team;
                    }
                }
            });
        }
        p.x = clamp(p.x, 20, FW - 20);
        p.y = clamp(p.y, 20, FH - 20);
    });

    // --- 5. z 轴（球飞行）物理 ---
    ball.vz -= GRAVITY * dt;
    ball.z += ball.vz * dt * 60;
    if (ball.z <= 0) {
        ball.z = 0;
        if (ball.vz < -2) {
            ball.vz = -ball.vz * BALL_BOUNCE;
            ball.vx *= 0.88; ball.vy *= 0.88;
        } else {
            ball.vz = 0;
        }
    }

    // 飞行轨迹记录
    if (ball.z > 0.5) {
        ballTrail.push({ x: ball.x, y: ball.y, z: ball.z });
        if (ballTrail.length > 80) ballTrail.shift();
    } else if (ballTrail.length > 0) {
        ballTrail = [];
    }

    // --- 6. 球水平移动 ---
    ball.x += ball.vx; ball.y += ball.vy;
    ball.vx *= 0.992; ball.vy *= 0.992;

    // --- 7. 定位球冷却 ---
    if (setPieceTimer > 0) { setPieceTimer -= dt; if (setPieceTimer <= 0) { setPiece = null; setPieceMsg = ''; } }

    // --- 8. 边界 & 进球判定 ---
    const goalTop = FH / 2 - GOAL_H / 2, goalBot = FH / 2 + GOAL_H / 2;
    const canSetPiece = state === 'playing' && setPieceTimer <= 0 && !freeKick;

    // 上下边线 → 边线球
    if (ball.y < WALL + ball.r) {
        if (canSetPiece) { const t = ball.lastTeam === TEAM_RED ? TEAM_BLUE : TEAM_RED; doThrowIn(clamp(ball.x, WALL + 20, FW - WALL - 20), WALL + 18, t); }
        else { ball.y = WALL + ball.r; ball.vy *= -0.6; }
    }
    if (ball.y > FH - WALL - ball.r) {
        if (canSetPiece) { const t = ball.lastTeam === TEAM_RED ? TEAM_BLUE : TEAM_RED; doThrowIn(clamp(ball.x, WALL + 20, FW - WALL - 20), FH - WALL - 18, t); }
        else { ball.y = FH - WALL - ball.r; ball.vy *= -0.6; }
    }

    // 左侧球门线（蓝队攻此门）
    if (ball.x < WALL + ball.r) {
        if (ball.y > goalTop && ball.y < goalBot && state === 'playing') {
            if (ball._indirect && ball.lastTeam === TEAM_BLUE) {
                showMsg('间接任意球未经过传递，进球无效！', 1500);
                placeBall('goalkick', WALL + 30, FH / 2, TEAM_RED);
            } else { onGoal(TEAM_BLUE); }
        } else if (canSetPiece) {
            if (ball.lastTeam === TEAM_BLUE) { placeBall('goalkick', WALL + 30, FH / 2, TEAM_RED); }
            else { const cy = ball.y < FH / 2 ? WALL + 18 : FH - WALL - 18; placeBall('corner', WALL + 18, cy, TEAM_BLUE); }
        } else { ball.x = WALL + ball.r; ball.vx *= -0.6; }
    }

    // 右侧球门线（红队攻此门）
    if (ball.x > FW - WALL - ball.r) {
        if (ball.y > goalTop && ball.y < goalBot && state === 'playing') {
            if (ball._indirect && ball.lastTeam === TEAM_RED) {
                showMsg('间接任意球未经过传递，进球无效！', 1500);
                placeBall('goalkick', FW - WALL - 30, FH / 2, TEAM_BLUE);
            } else { onGoal(TEAM_RED); }
        } else if (canSetPiece) {
            if (ball.lastTeam === TEAM_RED) { placeBall('goalkick', FW - WALL - 30, FH / 2, TEAM_BLUE); }
            else { const cy = ball.y < FH / 2 ? WALL + 18 : FH - WALL - 18; placeBall('corner', FW - WALL - 18, cy, TEAM_RED); }
        } else { ball.x = FW - WALL - ball.r; ball.vx *= -0.6; }
    }

    // --- 9. 球员触球 ---
    let oc = null, od = 1e9;
    const canHead = ball.z < 45;   // 空中球太高无法地面拦截
    players.forEach(p => {
        if (p.kick > 0) return;
        if (!canHead && !ball.owner) return;
        const d = dist(p, ball);
        if (d < p.r + ball.r + 4 && d < od) { od = d; oc = p; }
    });

    if (oc) {
        const p = oc;
        delete ball._indirect;      // 触球即清除间接任意球标记

        if (Math.hypot(ball.vx, ball.vy) < 8 || ball.lastTeam === p.team || ball.owner === p) {
            // 本队接球 → 越位检测
            if (offsideCheck && p.team === offsideCheck.team && players.indexOf(p) !== offsideCheck.passerIdx) {
                const inOppHalf = offsideCheck.attackDir > 0 ? p.x > FW / 2 : p.x < FW / 2;
                const pastLine = offsideCheck.attackDir > 0 ? p.x > offsideCheck.lineX : p.x < offsideCheck.lineX;
                if (inOppHalf && pastLine && state === 'playing') {
                    callOffside(p); return;
                }
            }
            offsideCheck = null;

            // 球吸附到持球球员脚下
            const fx = p.face.x, fy = p.face.y, fl = Math.hypot(fx, fy) || 1;
            const tx = p.x + fx / fl * (p.r + ball.r + 2);
            const ty = p.y + fy / fl * (p.r + ball.r + 2);
            ball.x += (tx - ball.x) * 0.35;
            ball.y += (ty - ball.y) * 0.35;
            ball.vx = p.vx * 0.9 + (fx / fl) * 0.5;
            ball.vy = p.vy * 0.9 + (fy / fl) * 0.5;
            ball.owner = p; ball.lastTeam = p.team;
        } else {
            // 对方抢断/拦截 → 球弹出
            const dx = ball.x - p.x, dy = ball.y - p.y, d = Math.hypot(dx, dy) || 1;
            ball.vx += dx / d * 1.5; ball.vy += dy / d * 1.5;
            ball.owner = null;
        }
    }

    // --- 10. 球员间碰撞推开 ---
    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            const a = players[i], b = players[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy), min = a.r + b.r;
            if (d < min && d > 0) {
                const push = (min - d) / 2, nx = dx / d, ny = dy / d;
                a.x -= nx * push; a.y -= ny * push;
                b.x += nx * push; b.y += ny * push;
            }
        }
    }
}

// --- 进球 ---
function onGoal(team) {
    score[team]++;
    document.getElementById('sRed').textContent = String(score[TEAM_RED]);
    document.getElementById('sBlue').textContent = String(score[TEAM_BLUE]);
    scorer = team; state = 'goal'; goalTimer = 2.2;
    showMsg(team === TEAM_RED ? '进球！红队得分' : '进球！蓝队得分', 1500);
    playCrowdCheer(1.0, 3.0);
}

// --- 比赛结束 ---
function endMatch() {
    state = 'over';
    stopCrowdAmbience();
    // 世界杯模式回调
    if (wc && wc._matchCallback) { const cb = wc._matchCallback; wc._matchCallback = null; cb(score); return; }
    let res, cls;
    if (score[TEAM_RED] > score[TEAM_BLUE]) { res = '红队获胜'; cls = 'red'; }
    else if (score[TEAM_RED] < score[TEAM_BLUE]) { res = '蓝队获胜'; cls = 'blue'; }
    else { res = '平局'; cls = 'draw'; }
    showPanel(`<h1>比赛结束</h1><div class="tag">FULL TIME</div>
<div class="big ${cls}">${res}</div>
<p style="font-size:22px;color:#fff">红队 ${score[TEAM_RED]} : ${score[TEAM_BLUE]} 蓝队</p>
<div class="btns"><button class="btn btn-primary" data-mode="match">再来一场</button><button class="btn btn-secondary" data-mode="penalty">点球大战</button><button class="btn btn-ghost" data-mode="menu">返回主菜单</button></div>`);
}

// --- 玩家射门 ---
function doShoot(p) {
    const d = p.face, len = Math.hypot(d.x, d.y) || 1, sp = 13;
    ball.vx = d.x / len * sp; ball.vy = d.y / len * sp; ball.vz = 0; ball.z = 0;
    ball.owner = null; p.kick = 0.3; ball.lastTeam = p.team;
    recordOffside(p);
    triggerGKDive(p);
    const towardGoal = (p.team === TEAM_RED && ball.vx > 1) || (p.team === TEAM_BLUE && ball.vx < -1);
    if (towardGoal) playCrowdCheer(0.35, 1.0);
}

// 玩家短传
function doPass(p) {
    let best = null, bd = 1e9;
    const fx = p.face.x, fy = p.face.y;
    players.forEach(q => {
        if (q.team === p.team && q !== p && !q.gk) {
            const dx = q.x - p.x, dy = q.y - p.y, dot = dx * fx + dy * fy;
            if (dot <= 0) return;
            const d = Math.hypot(dx, dy);
            if (d < bd) { bd = d; best = q; }
        }
    });
    let tx, ty;
    if (best) { tx = best.x; ty = best.y; }
    else { tx = p.x + fx * 200; ty = p.y + fy * 200; }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    ball.vx = dx / d * 7; ball.vy = dy / d * 7; ball.vz = 0;
    ball.z = 0; ball.owner = null; p.kick = 0.2; ball.lastTeam = p.team;
    recordOffside(p);
}

// 铲球
function doSlideTackle(p, dir, power) {
    if (p.slide > 0 || p.stamina < 15) return;
    const len = Math.hypot(dir.x, dir.y) || 1;
    const ndx = dir.x / len, ndy = dir.y / len;
    p.slide = 0.5; p.stamina -= 15;
    p.slideDir = { x: ndx, y: ndy };
    p.slidePower = power;
    const sp = 2.0 + power * 4.0;
    p.vx = ndx * sp; p.vy = ndy * sp;
}

// --- 玩家行动入口（由输入模块调用） ---

function triggerFreeKickShoot() {
    if (!freeKick || freeKick.isAI) return;
    if (!freeKick.charging) { freeKick.charging = true; freeKick.power = 0; }
    else { const t = players[freeKick.takerIdx]; doFreeKickShoot(t, freeKick.power / 100); freeKick = null; }
}

function actionShoot() {
    if (freeKick && !freeKick.isAI) { triggerFreeKickShoot(); return; }
    if (goalKick && !goalKick.isAI) {
        if (!goalKick.charging) { goalKick.charging = true; goalKick.power = 10; }
        else { const taker = players[goalKick.takerIdx]; if (taker) doGoalKickLong(taker, Math.max(0.25, goalKick.power / 100)); }
        return;
    }
    if (state !== 'playing') return;
    const p = players[activeIdx];
    if (ball.owner === p || dist(p, ball) < 26) doShoot(p);
}

function actionPass() {
    if (freeKick && !freeKick.isAI) { const t = players[freeKick.takerIdx]; doFreeKickPass(t); freeKick = null; return; }
    if (goalKick && !goalKick.isAI) { const t = players[goalKick.takerIdx]; if (t) doGoalKickShort(t); return; }
    if (state !== 'playing') return;

    if (lobPass) {
        if (!lobPass.charging) { lobPass.charging = true; lobPass.power = 10; }
        else { const taker = players[lobPass.takerIdx]; if (taker) doLobPass(taker, Math.max(0.25, lobPass.power / 100)); lobPass = null; }
        return;
    }

    const p = players[activeIdx];
    if (ball.owner === p || dist(p, ball) < 26) {
        lobPass = { takerIdx: activeIdx, charging: false, power: 0, spaceLatch: false };
    }
}

function actionTackle() {
    if (state !== 'playing') return;
    const p = players[activeIdx];
    if (p.slide > 0 || p.stamina < 15) return;
    const power = 0.4 + Math.random() * 0.5;
    doSlideTackle(p, p.face, power);
}
