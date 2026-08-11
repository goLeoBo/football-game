// =================================================================
// 10-ai.js — AI 系统（角色化：各司其职）
// 绿茵对决 · 足球游戏
//
// 每个 AI 球员按角色（GK/DEF/MID/FWD）有不同的行为逻辑：
//   - 门将：预判球路、快速扑救、大脚解围
//   - 后卫：以 homeX 为锚，随球压上/回收，个体偏移打破对称
//   - 中场：在球后方的中场区域活动
//   - 前锋：智能跑位（回撤接应 vs 前插空当），不扎堆
//
// 还包括：追球者/协防者选择逻辑、AI 铲球逻辑。
// =================================================================

// 将 x 限制在以本方球门为基准的区域内
function clampBand(v, ownGoalX, attackDir, near, far) {
    const lo = ownGoalX + attackDir * near, hi = ownGoalX + attackDir * far;
    return clamp(v, Math.min(lo, hi), Math.max(lo, hi));
}

// 找到本队"该去追球"的球员：优先球落其防区内的最近队员
function getTeamChaser(team) {
    let best = -1, bd = 1e9, anyInZone = false;
    players.forEach((q, i) => {
        if (q.team === team && !q.gk) {
            const range = (q.role === 'DEF' ? 110 : q.role === 'MID' ? 160 : 120) * SX;
            if (Math.abs(ball.x - q.homeX) < range + 80 * SX) {
                anyInZone = true;
                const d = dist(q, ball);
                if (d < bd) { bd = d; best = i; }
            }
        }
    });
    if (anyInZone) return best;
    // fallback: 全局最近
    bd = 1e9;
    players.forEach((q, i) => {
        if (q.team === team && !q.gk) { const d = dist(q, ball); if (d < bd) { bd = d; best = i; } }
    });
    return best;
}

// 协防：对方持球深入我方半场时，第二名防守者上抢
function getTeamPressers(team) {
    const primary = getTeamChaser(team);
    const ballInDefZone = team === TEAM_RED ? ball.x < FW * 0.35 : ball.x > FW * 0.65;
    const oppHasBall = ball.owner && ball.owner.team !== team;
    if (ballInDefZone && oppHasBall) {
        let second = -1, bd = 1e9;
        players.forEach((q, i) => {
            if (q.team === team && !q.gk && i !== primary) {
                const d = dist(q, ball);
                if (d < bd) { bd = d; second = i; }
            }
        });
        return [primary, second];
    }
    return [primary, -1];
}

// 单个 AI 球员的每帧更新
// idx: 球员在 players 中的索引  chaserIdx: 追球者索引  secIdx: 协防者索引
function aiUpdate(p, dt, idx, chaserIdx, secIdx) {
    const attackDir = p.team === TEAM_RED ? 1 : -1;
    const goalX = p.team === TEAM_RED ? FW : 0;
    const ownGoalX = p.team === TEAM_RED ? 0 : FW;

    // --- 门将 ---
    if (p.gk) {
        const gx = p.team === TEAM_RED ? 100 * SX : FW - 100 * SX;

        // 扑救动画中
        if (p.diveTimer && p.diveTimer > 0) {
            p.diveTimer -= dt;
            const dty = p.diveTargetY || FH / 2;
            const dy = dty - p.y;
            p.y += dy * 0.18;
            p.vx = 0; p.vy = 0;
            if (dist(p, ball) < 32 && ball.owner === null && Math.abs(ball.x - gx) < 80) {
                p.kick = 0.2;
                const dir = attackDir;
                ball.vx = dir * 8 + rand(-2, 2);
                ball.vy = (ball.y < FH / 2 ? -1 : 1) * 5 + rand(-2, 2);
                ball.vz = 0; ball.z = 0;
                ball.owner = null; ball.lastTeam = p.team;
                recordOffside(p);
                p.diveTimer = 0;
                playCrowdClap(1.5);
            }
            return;
        }

        // 常规站位：预判球路
        const predY = ball.y + ball.vy * 3;
        const ty = clamp(predY, FH / 2 - GOAL_H / 2 + 8, FH / 2 + GOAL_H / 2 - 8);
        moveToward(p, gx, ty, 0.85);

        // 球靠近球门时出击
        if (Math.abs(ball.x - goalX) < 165 * SX) {
            moveToward(p, clamp(ball.x, gx - 30 * SX, gx + 30 * SX), clamp(predY, FH / 2 - GOAL_H / 2, FH / 2 + GOAL_H / 2), 1.7);
        }

        // 用手接住来球（大脚解围）
        if (dist(p, ball) < 26 && ball.owner === null) {
            p.kick = 0.2;
            const dir = attackDir;
            ball.vx = dir * 9 + rand(-1, 1);
            ball.vy = (ball.y < FH / 2 ? -1 : 1) * 4 + rand(-2, 2);
            ball.vz = 0; ball.z = 0;
            ball.owner = null; ball.lastTeam = p.team;
            recordOffside(p);
        }
        return;
    }

    // --- 自己带球 ---
    if (ball.owner === p) {
        moveToward(p, goalX, FH / 2 + rand(-40, 40), 0.72);
        p.face.x = attackDir;
        // 靠近球门 → 射门
        if (Math.abs(ball.x - goalX) < 300 * SX && Math.random() < 0.05) {
            const gy = FH / 2 + rand(-GOAL_H / 2 + 20, GOAL_H / 2 - 20);
            const dx = goalX - p.x, dy = gy - p.y, d = Math.hypot(dx, dy) || 1, sp = 12;
            ball.vx = dx / d * sp; ball.vy = dy / d * sp; ball.vz = 0; ball.z = 0;
            ball.owner = null; p.kick = 0.25; ball.lastTeam = p.team;
            recordOffside(p);
            triggerGKDive(p);
        } else if (Math.random() < 0.012) {
            doPass(p);
        }
        return;
    }

    // --- 追球 / 协防 ---
    if (idx === chaserIdx || idx === secIdx) {
        const px = ball.x + ball.vx * 4, py = ball.y + ball.vy * 4;

        // 接近持球对方球员时可能铲球
        if (p.slide <= 0 && p.stamina > 20 && ball.owner && ball.owner.team !== p.team) {
            const d = dist(p, ball.owner);
            if (d < 32 && Math.random() < 0.025) {
                const power = p.role === 'DEF' ? 0.4 + Math.random() * 0.45 : 0.3 + Math.random() * 0.4;
                doSlideTackle(p, { x: ball.owner.x - p.x, y: ball.owner.y - p.y }, power);
            }
        }
        moveToward(p, px, py, idx === chaserIdx ? 0.85 : 0.78);
        return;
    }

    // --- 各司其职：按角色保持阵型 ---
    // 所有球员：对方持球靠近时均可铲球
    if (p.slide <= 0 && p.stamina > 20 && ball.owner && ball.owner.team !== p.team) {
        const d = dist(p, ball.owner);
        if (d < 30 && Math.random() < 0.012) {
            let power;
            if (p.role === 'DEF') power = 0.4 + Math.random() * 0.45;
            else if (p.role === 'MID') power = 0.3 + Math.random() * 0.3;
            else power = 0.25 + Math.random() * 0.25;
            doSlideTackle(p, { x: ball.owner.x - p.x, y: ball.owner.y - p.y }, power);
            return;
        }
    }

    let tx, ty;
    const dby = ball.y - p.homeY;

    if (p.role === 'DEF') {
        const ballDistY = Math.abs(p.homeY - ball.y);
        const pressFactor = Math.max(0, 1 - ballDistY / 200);
        // 每个后卫独特的深度偏移，打破左右对称
        const idxOff = p.homeY < 300 ? 0 : (p.homeY < 500 ? 1 : (p.homeY < 700 ? 2 : 3));
        const personalOffset = [-20, 40, -10, -40][idxOff] * SX;
        const ballDelta = (ball.x - p.homeX) * (0.15 + pressFactor * 0.15);
        tx = clampBand(p.homeX + ballDelta + personalOffset, ownGoalX, attackDir, 100 * SX, 450 * SX);
        ty = p.homeY + dby * (0.12 + pressFactor * 0.38);
    } else if (p.role === 'MID') {
        tx = clampBand(ball.x - attackDir * 60 * SX, ownGoalX, attackDir, 300 * SX, 580 * SX);
        ty = p.homeY + dby * 0.4;
    } else {
        // 前锋：智能跑位
        const ballDistY = Math.abs(p.homeY - ball.y);
        const isNearBall = ballDistY < 180;
        const teamHasBall = ball.lastTeam === p.team;
        if (isNearBall && teamHasBall) {
            tx = clampBand(ball.x + attackDir * 40 * SX, ownGoalX, attackDir, 380 * SX, 680 * SX);
            ty = p.homeY + dby * 0.5;
        } else if (teamHasBall) {
            tx = clampBand(ball.x + attackDir * 190 * SX, ownGoalX, attackDir, 550 * SX, 820 * SX);
            ty = p.homeY + dby * 0.15;
        } else {
            tx = clampBand(ball.x + attackDir * 120 * SX, ownGoalX, attackDir, 460 * SX, 760 * SX);
            ty = p.homeY + dby * 0.25;
        }
    }
    moveToward(p, tx, ty, 0.7);
}

// 平滑移动到目标位置
function moveToward(p, tx, ty, sp) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    const acc = 0.32, max = 1.4 * sp;
    p.vx += dx / d * acc; p.vy += dy / d * acc;
    const v = Math.hypot(p.vx, p.vy);
    if (v > max) { p.vx = p.vx / v * max; p.vy = p.vy / v * max; }
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { p.face.x = dx / d; p.face.y = dy / d; }
}
