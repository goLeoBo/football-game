// =================================================================
// 08-setpiece.js — 定位球系统（任意球、角球、球门球、边线球、越位）
// 绿茵对决 · 足球游戏
//
// 包含：直接/间接任意球主罚、人墙摆放、越位判罚、
// 角球/球门球/边线球发球逻辑。
// =================================================================

// ==============================================================
// 任意球主罚
// 调用者：犯规吹罚后调用 startFreeKick() 启动
// ==============================================================

// direct: true=直接任意球(可射门得分+人墙), false=间接(需传一脚)
function startFreeKick(x, y, team, direct = true) {
    let best = -1, bd = 1e9;
    players.forEach((p, i) => {
        if (p.team !== team || p.sentOff) return;
        const d = dist(p, { x, y });
        if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;

    const taker = players[best];
    taker.x = x; taker.y = y; taker.vx = 0; taker.vy = 0;
    const goalX = team === TEAM_RED ? FW : 0, goalY = FH / 2;
    const dx = goalX - x, dy = goalY - y, len = Math.hypot(dx, dy) || 1;
    taker.face = { x: dx / len, y: dy / len };
    ball.x = x; ball.y = y; ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.z = 0;
    ball.owner = taker; ball.lastTeam = team;

    const DEF_DIST = 85;   // 人墙距离（≈9.15m）
    const wallList = [];

    if (direct) {
        // 摆人墙：对方距离球最近的 3~5 人沿球→球门连线的法向分布
        const wallers = players
            .filter(p => p.team !== team && !p.sentOff && !p.gk)
            .map(p => ({ p, d: dist(p, { x, y }) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 4).map(o => o.p);

        const fdx = (goalX - x) / len, fdy = (goalY - y) / len;
        const npx = -fdy, npy = fdx;           // 法向量（人墙分布方向）
        const wallCX = x + fdx * DEF_DIST;
        const wallCY = y + fdy * DEF_DIST;
        const wallCount = wallers.length;
        const spacing = 24;

        wallers.forEach((p, i) => {
            const off = (i - (wallCount - 1) / 2) * spacing;
            p.x = wallCX + npx * off;
            p.y = wallCY + npy * off;
            const f2x = x - p.x, f2y = y - p.y, l2 = Math.hypot(f2x, f2y) || 1;
            p.face = { x: f2x / l2, y: f2y / l2 };
            p.vx = 0; p.vy = 0;
            wallList.push(players.indexOf(p));
        });

        // 其余防守球员后退 ≥ 9.15m
        players.forEach(p => {
            if (p.team !== team || p.sentOff || p.gk || wallList.indexOf(players.indexOf(p)) >= 0) return;
            const pd = dist(p, { x, y });
            if (pd < DEF_DIST + 10) {
                const px = p.x - x, py = p.y - y, pl = Math.hypot(px, py) || 1;
                p.x = x + px / pl * (DEF_DIST + 10);
                p.y = y + py / pl * (DEF_DIST + 10);
                p.vx = 0; p.vy = 0;
            }
        });
    } else {
        // 间接任意球：全部后退 9.15m，不摆人墙
        players.forEach(p => {
            if (p.team === team || p.sentOff) return;
            const pd = dist(p, { x, y });
            if (pd < DEF_DIST) {
                const px = p.x - x, py = p.y - y, pl = Math.hypot(px, py) || 1;
                p.x = x + px / pl * DEF_DIST;
                p.y = y + py / pl * DEF_DIST;
                p.vx = 0; p.vy = 0;
            }
        });
    }

    freeKick = { takerIdx: best, team, timer: 4.0, isAI: team !== TEAM_RED, direct, wall: wallList, touched: false };
    if (team === TEAM_RED) activeIdx = best;
    setPiece = 'foul'; setPieceTimer = 99; setPieceMsg = (direct ? '直接' : '间接') + '任意球';
    offsideCheck = null;
}

// 任意球射门
function doFreeKickShoot(taker, power = 1.0) {
    const d = taker.face, len = Math.hypot(d.x, d.y) || 1;
    const sp = 8 + power * 11;
    const accDev = (1 - power) * 0.04 + power * 0.09;
    const ox = (Math.random() - 0.5) * accDev, oy = (Math.random() - 0.5) * accDev;
    ball.vx = (d.x / len + ox) * sp;
    ball.vy = (d.y / len + oy) * sp;
    ball.vz = 0; ball.z = 0;
    ball.owner = null; taker.kick = 0.3; ball.lastTeam = taker.team;
    recordOffside(taker);

    const indirectPenalty = !(freeKick && freeKick.direct);
    setPiece = null; setPieceTimer = 0; setPieceMsg = '';

    // 人墙起跳封堵
    if (freeKick && freeKick.direct && Array.isArray(freeKick.wall)) {
        const jumpChance = 0.55 + power * 0.2;
        freeKick.wall.forEach(wi => {
            const wp = players[wi];
            if (!wp || wp.sentOff) return;
            if (Math.random() < jumpChance) {
                wp.slide = 0.35;
                wp.slideDir = { x: taker.face.x / len, y: taker.face.y / len };
                wp.slidePower = 0.2;
            }
        });
    }
    freeKick = null;

    if (indirectPenalty) ball._indirect = true;

    triggerGKDive(taker);
    playCrowdCheer(0.5, 1.5);
}

// 门将扑救触发：根据来球速度、方向、距离断定是否扑救
function triggerGKDive(taker) {
    const defTeam = taker.team === TEAM_RED ? TEAM_BLUE : TEAM_RED;
    const gk = players.find(p => p.team === defTeam && p.gk && !p.sentOff);
    if (!gk) return;

    const goalX = taker.team === TEAM_RED ? FW : 0;
    const towardGoal = (taker.team === TEAM_RED && ball.vx > 1) || (taker.team === TEAM_BLUE && ball.vx < -1);
    if (!towardGoal) return;

    const t = Math.abs((goalX - ball.x) / (ball.vx || 0.1));
    if (t > 60 || t < 0) return;
    const predY = ball.y + ball.vy * t;
    if (predY < FH / 2 - GOAL_H / 2 - 30 || predY > FH / 2 + GOAL_H / 2 + 30) return;

    const power = Math.hypot(ball.vx, ball.vy);
    const shotDist = Math.abs(goalX - taker.x);
    const isLongShot = shotDist > 500;
    const errorAmt = 30 + power * 4 + Math.random() * 60 + (isLongShot ? 20 : 0);
    const diveTargetY = clamp(predY + (Math.random() - 0.5) * errorAmt, FH / 2 - GOAL_H / 2 + 5, FH / 2 + GOAL_H / 2 - 5);
    gk.diveDir = diveTargetY < FH / 2 - 15 ? -1 : (diveTargetY > FH / 2 + 15 ? 1 : 0);
    gk.diveTimer = isLongShot ? 0.85 : 0.7;
    gk.diveTargetY = diveTargetY;
}

// 任意球传球（短传）
function doFreeKickPass(taker) {
    let best = null, bd = 1e9;
    const fx = taker.face.x, fy = taker.face.y;
    players.forEach(q => {
        if (q.team === taker.team && q !== taker && !q.sentOff && !q.gk) {
            const dx = q.x - taker.x, dy = q.y - taker.y, dot = dx * fx + dy * fy;
            if (dot <= 0) return;
            const d = Math.hypot(dx, dy);
            if (d < bd) { bd = d; best = q; }
        }
    });
    let tx, ty;
    if (best) { tx = best.x; ty = best.y; }
    else { tx = taker.x + fx * 200; ty = taker.y + fy * 200; }
    const dx = tx - taker.x, dy = ty - taker.y, d = Math.hypot(dx, dy) || 1, sp = 9;
    ball.vx = dx / d * sp; ball.vy = dy / d * sp; ball.vz = 0; ball.z = 0;
    ball.owner = null; taker.kick = 0.2; ball.lastTeam = taker.team;
    delete ball._indirect;
    recordOffside(taker);
    setPiece = null; setPieceTimer = 0; setPieceMsg = '';
    freeKick = null;
}

// 任意球更新（每帧调用）
function updateFreeKick(dt) {
    freeKick.timer -= dt;
    const taker = players[freeKick.takerIdx];
    if (!taker || taker.sentOff) { freeKick = null; setPiece = null; setPieceTimer = 0; return; }
    taker.vx = 0; taker.vy = 0;

    if (!freeKick.isAI) {
        // 人类玩家：方向键瞄准，空格蓄力/射门，Shift 传球
        const mv = readMove();
        if (Math.abs(mv.x) > 0.1 || Math.abs(mv.y) > 0.1) {
            taker.face = { x: mv.x, y: mv.y };
        }
        if (keys[' '] && !freeKick.spaceLatch) {
            freeKick.spaceLatch = true;
            triggerFreeKickShoot();
            if (!freeKick) return;
        }
        if (!keys[' ']) freeKick.spaceLatch = false;
        if (freeKick.charging) {
            freeKick.power += dt * 85;
            if (freeKick.power >= 100) { doFreeKickShoot(taker, 1.0); freeKick = null; return; }
        }
        if (keys['shift'] && !freeKick.shiftLatch) {
            freeKick.shiftLatch = true;
            doFreeKickPass(taker);
            freeKick = null; return;
        }
        if (!keys['shift']) freeKick.shiftLatch = false;
    } else {
        // AI 主罚
        if (freeKick.timer < 2.5) {
            const goalX = taker.team === TEAM_RED ? FW : 0;
            const goalY = FH / 2, offset = (Math.random() - 0.5) * 100;
            const dx = goalX - taker.x, dy = (goalY + offset) - taker.y;
            const len = Math.hypot(dx, dy) || 1;
            taker.face = { x: dx / len, y: dy / len };
        }
        if (freeKick.timer < 2.0) {
            const goalX = taker.team === TEAM_RED ? FW : 0;
            const goalDist = Math.abs(taker.x - goalX);
            if (freeKick.direct) {
                if (goalDist > 820 || goalDist < 180) { doFreeKickPass(taker); }
                else { doFreeKickShoot(taker, 0.65 + Math.random() * 0.35); }
            } else { doFreeKickPass(taker); }
            return;
        }
    }

    // 持续保持对方退让
    players.forEach(p => {
        if (p.team !== freeKick.team && !p.sentOff) {
            const d = dist(p, ball);
            if (d < 55) {
                const dx = p.x - ball.x, dy = p.y - ball.y, dl = Math.hypot(dx, dy) || 1;
                p.x = ball.x + dx / dl * 58; p.y = ball.y + dy / dl * 58;
            }
        }
    });

    if (freeKick.timer <= 0) { doFreeKickPass(taker); freeKick = null; }
}

// ==============================================================
// 球门球开大脚
// ==============================================================

function doGoalKickLong(taker, power = 1.0) {
    const d = taker.face, len = Math.hypot(d.x, d.y) || 1;
    const sp = 5 + power * 10;
    const vz0 = 8 + power * 18;
    const accDev = (1 - power) * 0.03 + power * 0.06;
    const ox = (Math.random() - 0.5) * accDev, oy = (Math.random() - 0.5) * accDev;
    ball.vx = (d.x / len + ox) * sp;
    ball.vy = (d.y / len + oy) * sp;
    ball.vz = vz0; ball.z = 0;
    ball.owner = null; taker.kick = 0.3; ball.lastTeam = taker.team;
    recordOffside(taker);
    setPiece = null; setPieceTimer = 0; setPieceMsg = '';
    goalKick = null;
}

function doGoalKickShort(taker) {
    let best = null, bd = 1e9;
    players.forEach(q => {
        if (q.team === taker.team && q !== taker && !q.gk) {
            const dx = q.x - taker.x, dy = q.y - taker.y, d = Math.hypot(dx, dy);
            if (d < bd && d < 300) { bd = d; best = q; }
        }
    });
    let tx, ty;
    if (best) { tx = best.x; ty = best.y; }
    else { tx = taker.x + taker.face.x * 200; ty = taker.y + taker.face.y * 200; }
    const dx = tx - taker.x, dy = ty - taker.y, d = Math.hypot(dx, dy) || 1, sp = 6.5;
    ball.vx = dx / d * sp; ball.vy = dy / d * sp; ball.vz = 0; ball.z = 0;
    ball.owner = null; taker.kick = 0.2; ball.lastTeam = taker.team;
    recordOffside(taker);
    setPiece = null; setPieceTimer = 0; setPieceMsg = '';
    goalKick = null;
}

function updateGoalKick(dt) {
    goalKick.timer -= dt;
    const taker = players[goalKick.takerIdx];
    if (!taker || taker.sentOff) { goalKick = null; setPiece = null; setPieceTimer = 0; return; }
    taker.vx = 0; taker.vy = 0;

    if (!goalKick.isAI) {
        const mv = readMove();
        if (Math.abs(mv.x) > 0.1 || Math.abs(mv.y) > 0.1) {
            taker.face = { x: mv.x, y: mv.y };
        }
        if (keys[' '] && !goalKick.spaceLatch) {
            goalKick.spaceLatch = true;
            if (!goalKick.charging) { goalKick.charging = true; goalKick.power = 10; }
            else { doGoalKickLong(taker, Math.max(0.25, goalKick.power / 100)); return; }
        }
        if (!keys[' ']) goalKick.spaceLatch = false;
        if (goalKick.charging) {
            goalKick.power += dt * 90;
            if (goalKick.power >= 100) { doGoalKickLong(taker, 1.0); return; }
        }
        if (keys['shift']) { doGoalKickShort(taker); return; }
    } else {
        // AI: 2.2 秒后自动处理
        if (goalKick.timer < 2.2) {
            const attackDir = taker.team === TEAM_RED ? 1 : -1;
            if (Math.random() < 0.82) {
                let best = null, bd = -1;
                players.forEach(q => {
                    if (q.team === taker.team && q !== taker) {
                        const forward = (q.x - taker.x) * attackDir;
                        if (forward > 200 && forward > bd) { bd = forward; best = q; }
                    }
                });
                let tx, ty;
                if (best && Math.random() < 0.6) {
                    tx = best.x + attackDir * 60 + (Math.random() - 0.5) * 80;
                    ty = best.y + (Math.random() - 0.5) * 80;
                } else {
                    tx = taker.x + attackDir * (FW * 0.55);
                    ty = FH / 2 + (Math.random() - 0.5) * FH * 0.55;
                }
                const dx = tx - taker.x, dy = ty - taker.y, len = Math.hypot(dx, dy) || 1;
                taker.face = { x: dx / len, y: dy / len };
                const power = 0.65 + Math.random() * 0.35;
                setTimeout(() => { if (goalKick && players[goalKick.takerIdx] === taker) doGoalKickLong(taker, power); }, 180);
                goalKick.timer = 999;
            } else {
                setTimeout(() => { if (goalKick && players[goalKick.takerIdx] === taker) doGoalKickShort(taker); }, 180);
                goalKick.timer = 999;
            }
        }
    }

    players.forEach(p => {
        if (p.team !== goalKick.team && !p.sentOff) {
            const d = dist(p, ball);
            if (d < 55) {
                const dx = p.x - ball.x, dy = p.y - ball.y, dl = Math.hypot(dx, dy) || 1;
                p.x = ball.x + dx / dl * 58; p.y = ball.y + dy / dl * 58;
            }
        }
    });

    if (goalKick.timer <= 0 && goalKick.timer !== 999) { doGoalKickLong(taker, 0.7); }
}

// ==============================================================
// 定位球公共放置
// ==============================================================

function placeBall(type, x, y, awardTeam) {
    setPiece = type; setPieceTimer = 1.8; offsideCheck = null;
    ball.x = x; ball.y = y; ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.z = 0; ball.owner = null;
    ball.lastTeam = awardTeam;

    let best = -1, bd = 1e9;
    if (type === 'goalkick') {
        players.forEach((p, i) => { if (p.team === awardTeam && p.gk) best = i; });
    }
    if (best < 0) {
        players.forEach((p, i) => {
            if (p.team !== awardTeam) return;
            const d = dist(p, ball);
            if (d < bd) { bd = d; best = i; }
        });
    }

    if (best >= 0) {
        const p = players[best];
        p.x = x; p.y = y; p.vx = 0; p.vy = 0;
        p.face = { x: awardTeam === TEAM_RED ? 1 : -1, y: 0 };
        ball.owner = p; ball.lastTeam = awardTeam;
        if (awardTeam === TEAM_RED) activeIdx = best;
    }

    // 对方退让
    players.forEach(p => {
        if (p.team === awardTeam) return;
        const d = dist(p, { x, y });
        if (d < 55) {
            const dx = p.x - x, dy = p.y - y, dl = Math.hypot(dx, dy) || 1;
            p.x = x + dx / dl * 55; p.y = y + dy / dl * 55;
            p.x = clamp(p.x, WALL, FW - WALL); p.y = clamp(p.y, WALL, FH - WALL);
        }
    });

    const labels = { corner: '角球', goalkick: '球门球', throwin: '边线球', offside: '越位 · 任意球' };
    setPieceMsg = labels[type] || '';

    if (type === 'goalkick' && best >= 0) {
        goalKick = { takerIdx: best, team: awardTeam, isAI: awardTeam !== TEAM_RED, charging: false, power: 0, spaceLatch: false, timer: 3.5 };
    } else { goalKick = null; }
}

// 边线球
function doThrowIn(x, y, awardTeam) {
    setPiece = 'throwin'; setPieceTimer = 2.2; offsideCheck = null;
    ball.lastTeam = awardTeam;

    let best = -1, bd = 1e9;
    players.forEach((p, i) => {
        if (p.team !== awardTeam) return;
        const d = dist(p, { x, y });
        if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) {
        const p = players[best];
        p.x = x; p.y = y; p.vx = 0; p.vy = 0;
        p.face = { x: awardTeam === TEAM_RED ? 1 : -1, y: 0 };
        ball.x = x; ball.y = y; ball.vx = 0; ball.vy = 0; ball.owner = p;
        if (awardTeam === TEAM_RED) activeIdx = best;
    } else {
        ball.x = x; ball.y = y; ball.vx = 0; ball.vy = 0; ball.owner = null;
    }

    players.forEach(p => {
        if (p.team === awardTeam) return;
        const d = dist(p, { x, y });
        if (d < 55) {
            const dx = p.x - x, dy = p.y - y, dl = Math.hypot(dx, dy) || 1;
            p.x = x + dx / dl * 55; p.y = y + dy / dl * 55;
            p.x = clamp(p.x, WALL, FW - WALL); p.y = clamp(p.y, WALL, FH - WALL);
        }
    });
    setPieceMsg = '边线球';
}

// ==============================================================
// 越位系统
// ==============================================================

// 获取越位线：对方倒数第二名防守队员的 x 坐标
function getOffsideLine(attackingTeam) {
    const defTeam = attackingTeam === TEAM_RED ? TEAM_BLUE : TEAM_RED;
    const goalX = attackingTeam === TEAM_RED ? FW : 0;
    const defs = players.filter(p => p.team === defTeam)
        .map(p => ({ x: p.x, d: Math.abs(p.x - goalX) }))
        .sort((a, b) => a.d - b.d);
    if (defs.length >= 2) return defs[1].x;
    return goalX;
}

// 传球/射门时记录越位检测数据
function recordOffside(passer) {
    offsideCheck = {
        team: passer.team,
        lineX: getOffsideLine(passer.team),
        attackDir: passer.team === TEAM_RED ? 1 : -1,
        passerIdx: players.indexOf(passer)
    };
}

// 判罚越位：防守方在越位位置获得任意球
function callOffside(offender) {
    const defTeam = offender.team === TEAM_RED ? TEAM_BLUE : TEAM_RED;
    const fkX = clamp(offender.x, WALL + 20, FW - WALL - 20);
    const fkY = clamp(offender.y, WALL + 20, FH - WALL - 20);
    ball.owner = null; ball.vx = 0; ball.vy = 0;
    offsideCheck = null;
    setPiece = 'offside'; setPieceTimer = 2.0; setPieceMsg = '越位';

    let best = -1, bd = 1e9;
    players.forEach((p, i) => {
        if (p.team !== defTeam) return;
        const d = dist(p, { x: fkX, y: fkY });
        if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) {
        const p = players[best];
        p.x = fkX; p.y = fkY; p.vx = 0; p.vy = 0;
        p.face = { x: defTeam === TEAM_RED ? 1 : -1, y: 0 };
        ball.x = fkX; ball.y = fkY; ball.owner = p; ball.lastTeam = defTeam;
        if (defTeam === TEAM_RED) activeIdx = best;
    }

    players.forEach(p => {
        if (p.team === defTeam) return;
        const d = dist(p, { x: fkX, y: fkY });
        if (d < 55) {
            const dx = p.x - fkX, dy = p.y - fkY, dl = Math.hypot(dx, dy) || 1;
            p.x = fkX + dx / dl * 55; p.y = fkY + dy / dl * 55;
            p.x = clamp(p.x, WALL, FW - WALL); p.y = clamp(p.y, WALL, FH - WALL);
        }
    });
    showMsg('越位！', 1500);
    playWhistle();
}
