// =================================================================
// 09-lobpass.js — 高空长传蓄力系统
// 绿茵对决 · 足球游戏
//
// 长传操作：按 Q/传球键 → 进入蓄力模式 → 方向键瞄准 →
// 再按射门键踢出。蓄力期间显示弧线预览轨迹。
// C 键可取消蓄力。
// =================================================================

// 高空长传：根据蓄力力度踢出大弧线高抛球
function doLobPass(p, power) {
    let best = null, bd = 1e9;
    const fx = p.face.x, fy = p.face.y;
    // 找前方最近队友
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
    const sp = 2 + power * 5;           // 力度 → 水平速度 3~7
    ball.vx = dx / d * sp;
    ball.vy = dy / d * sp;

    const peakH = Math.min(200, d * 0.32 + 25) * (0.5 + power * 0.5);
    ball.vz = Math.sqrt(2 * GRAVITY * peakH) * 0.82;
    ball.z = 0; ball.owner = null; p.kick = 0.2; ball.lastTeam = p.team;
    recordOffside(p);
}

function updateLobPass(dt) {
    if (!lobPass) return;
    const taker = players[lobPass.takerIdx];
    if (!taker || taker.sentOff || ball.owner !== taker) {
        lobPass = null; return;
    }
    taker.vx = 0; taker.vy = 0;
    // 球跟随持球者
    ball.x = taker.x + taker.face.x * 12;
    ball.y = taker.y + taker.face.y * 12;

    // 方向键瞄准
    const mv = readMove();
    if (Math.abs(mv.x) > 0.1 || Math.abs(mv.y) > 0.1) {
        taker.face = { x: mv.x, y: mv.y };
    }

    // 空格/射门键：第一次→开始蓄力，第二次→踢出
    if (keys[' '] && !lobPass.spaceLatch) {
        lobPass.spaceLatch = true;
        if (!lobPass.charging) {
            lobPass.charging = true; lobPass.power = 10;
        } else {
            doLobPass(taker, Math.max(0.25, lobPass.power / 100));
            lobPass = null; return;
        }
    }
    if (!keys[' ']) lobPass.spaceLatch = false;

    // 蓄力中：生成弧线预览轨迹
    if (lobPass.charging) {
        lobPass.power += dt * 90;

        const p = taker;
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

        const power = Math.max(0.25, lobPass.power / 100);
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
        const sp = 2 + power * 5;
        const peakH = Math.min(200, d * 0.32 + 25) * (0.5 + power * 0.5);
        const vz = Math.sqrt(2 * GRAVITY * peakH) * 0.82;
        const vx = dx / d * sp, vy = dy / d * sp;
        const T = 2 * vz / GRAVITY;
        const steps = 50;
        const startX = p.x + p.face.x * 12, startY = p.y + p.face.y * 12;
        lobPassPreview = [];
        for (let i = 0; i <= steps; i++) {
            const t = T * i / steps;
            lobPassPreview.push({
                x: startX + vx * t,
                y: startY + vy * t,
                z: vz * t - 0.5 * GRAVITY * t * t
            });
        }

        if (lobPass.power >= 100) {
            doLobPass(taker, 1.0);
            lobPass = null; return;
        }
    }

    // C 键取消蓄力
    if (keys['c']) {
        lobPass = null; return;
    }
}
