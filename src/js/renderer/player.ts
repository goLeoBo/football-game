// =================================================================
// renderer/player.js — 球员渲染：站姿、铲球、扑救、球衣号码、姓名、体力条
// 绿茵对决 · 足球游戏
//
// 球员按 y 深度排序绘制（远处先画）。
// 铲球时显示低姿态滑铲 + 扬尘效果。
// 门将扑救时显示侧倒 + 伸展手臂。
// =================================================================

const roleColor = { GK: null, DEF: '#7CFC00', MID: '#ffd60a', FWD: '#ffffff' };

function drawPlayers() {
    // 按深度排序（远→近）
    const sorted = players.map((p, i) => ({ p, i, depth: p.y })).sort((a, b) => a.depth - b.depth);
    sorted.forEach(({ p, i }) => {
        if (p.sentOff) return;
        const isRed = p.team === TEAM_RED;
        const pos = project(p.x, p.y);
        const sx = pos.sx, feetY = pos.sy;
        const dr = p.r * pos.dscale;
        const fl = Math.hypot(p.face.x, p.face.y) || 1;
        const dx = p.face.x / fl, dy = p.face.y / fl;
        const sliding = p.slide > 0;

        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath(); ctx.ellipse(sx + 2, feetY + 3, dr * 0.85, dr * 0.85 * CAM_TILT * 0.6, 0, 0, Math.PI * 2); ctx.fill();

        // 活跃球员高亮
        if (i === activeIdx && state !== 'over') {
            ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(sx, feetY, dr + 4, (dr + 4) * CAM_TILT * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
        }

        // 持球指示
        if (ball.owner === p) {
            ctx.strokeStyle = 'rgba(255,214,10,.7)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(sx, feetY, dr + 7, (dr + 7) * CAM_TILT * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
        }

        // 黄/红牌标记
        if (p.cards > 0) {
            const cardX = sx + dr + 5, cardY = feetY - 32;
            ctx.fillStyle = p.cards >= 2 ? '#e63946' : '#ffd60a';
            ctx.fillRect(cardX, cardY, 7, 10);
            ctx.strokeStyle = '#000'; ctx.lineWidth = 0.8;
            ctx.strokeRect(cardX, cardY, 7, 10);
        }

        if (sliding) {
            drawSlidingPlayer(p, sx, feetY, dr, isRed);
        } else if (p.gk && p.diveTimer && p.diveTimer > 0) {
            drawDivingGK(p, sx, feetY, dr, isRed);
        } else {
            drawStandingPlayer(p, i, sx, feetY, dr, dx, dy, isRed);
        }
    });
}

// 站姿球员
function drawStandingPlayer(p, i, sx, feetY, dr, dx, dy, isRed) {
    const fh = 30;
    const hipY = feetY - fh * 0.38;
    const shY  = feetY - fh * 0.70;
    const hdY  = feetY - fh * 0.88;
    const bw2 = dr * 1.25, bw1 = dr * 0.85;

    // 腿
    ctx.strokeStyle = isRed ? '#7a1a1a' : '#143060';
    ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    const legS = 3.5;
    ctx.beginPath();
    ctx.moveTo(sx - legS + dx * 1.5, hipY); ctx.lineTo(sx - legS, feetY);
    ctx.moveTo(sx + legS + dx * 1.5, hipY); ctx.lineTo(sx + legS, feetY);
    ctx.stroke();

    // 球衣（梯形）
    const jCol = p.gk ? (isRed ? '#ffb703' : '#fb8500') : (isRed ? '#e63946' : '#3a86ff');
    const jDark = p.gk ? (isRed ? '#cc8800' : '#cc5500') : (isRed ? '#a01818' : '#1a4a99');
    const grad = ctx.createLinearGradient(sx, shY, sx, hipY);
    grad.addColorStop(0, jCol); grad.addColorStop(1, jDark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sx - bw1, shY); ctx.lineTo(sx + bw1, shY);
    ctx.lineTo(sx + bw2, hipY); ctx.lineTo(sx - bw2, hipY);
    ctx.closePath(); ctx.fill();

    // 角色色条
    if (!p.gk && roleColor[p.role]) {
        ctx.strokeStyle = roleColor[p.role]; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx - bw1 + 1, shY + 1.5); ctx.lineTo(sx + bw1 - 1, shY + 1.5); ctx.stroke();
    }

    // 手臂
    ctx.strokeStyle = isRed ? '#e63946' : '#3a86ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx - bw1, shY + 2); ctx.lineTo(sx - bw1 - 4, hipY - 1);
    ctx.moveTo(sx + bw1, shY + 2); ctx.lineTo(sx + bw1 + 4, hipY - 1);
    ctx.stroke();

    // 头
    const hdR = dr * 0.42;
    ctx.fillStyle = '#f0c0a0';
    ctx.beginPath(); ctx.arc(sx + dx * 2.5, hdY, hdR, 0, Math.PI * 2); ctx.fill();
    // 头发
    ctx.fillStyle = isRed ? '#5a3010' : '#2a1a05';
    ctx.beginPath(); ctx.arc(sx + dx * 2.5, hdY - hdR * 0.3, hdR * 0.85, Math.PI, 0); ctx.fill();

    // 号码
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String((i % 11) + 1), sx, (shY + hipY) / 2);

    // 姓名
    ctx.fillStyle = i === activeIdx ? '#ffd60a' : 'rgba(255,255,255,.85)';
    ctx.font = (i === activeIdx ? 'bold ' : '') + '9px sans-serif'; ctx.textBaseline = 'bottom';
    ctx.fillText(p.name || '', sx, hdY - hdR - 2);

    // 体力条（仅活跃球员）
    if (i === activeIdx) {
        const bw = 28, bh = 4, bx = sx - bw / 2, by = hdY - hdR - 11;
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        const sr = (p.stamina ?? 100) / 100;
        ctx.fillStyle = sr > 0.5 ? '#7CFC00' : sr > 0.2 ? '#ffd60a' : '#e63946';
        ctx.fillRect(bx, by, bw * sr, bh);
    }
}

// 铲球姿态
function drawSlidingPlayer(p, sx, feetY, dr, isRed) {
    const sdx = p.slideDir.x, sdy = p.slideDir.y;
    const slideAng = Math.atan2(sdy, sdx);
    const slideProgress = p.slide / 0.5;
    const tPower = p.slidePower || 0.5;
    const slideLen = dr * (1.2 + slideProgress * 1.0 + tPower * 1.5);

    // 扬尘
    const dustCount = Math.floor(2 + tPower * 4);
    ctx.fillStyle = `rgba(180,160,120,${0.3 + tPower * 0.2})`;
    for (let d = 0; d < dustCount; d++) {
        const dustX = sx - sdx * (slideLen + d * 7) + (Math.random() - 0.5) * 5;
        const dustY = feetY - sdy * (slideLen + d * 7) * 0.3 + (Math.random() - 0.5) * 4;
        ctx.beginPath(); ctx.arc(dustX, dustY, 3 - d * 0.4, 0, Math.PI * 2); ctx.fill();
    }

    // 滑行残影
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + slideProgress * 0.25})`; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx - sdx * slideLen, feetY - sdy * slideLen * 0.3); ctx.lineTo(sx, feetY); ctx.stroke();

    const jCol = p.gk ? (isRed ? '#ffb703' : '#fb8500') : (isRed ? '#e63946' : '#3a86ff');
    const jDark = p.gk ? (isRed ? '#cc8800' : '#cc5500') : (isRed ? '#a01818' : '#1a4a99');

    ctx.save();
    ctx.translate(sx, feetY - 4);
    ctx.rotate(slideAng);
    // 后腿
    ctx.strokeStyle = isRed ? '#7a1a1a' : '#143060'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-dr * 0.5, 0); ctx.lineTo(-dr * 0.8, -dr * 0.5);
    ctx.stroke();
    // 躯干
    const grad = ctx.createLinearGradient(0, -dr * 0.5, 0, dr * 0.3);
    grad.addColorStop(0, jCol); grad.addColorStop(1, jDark);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(0, -2, dr * 1.1, dr * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    // 铲球腿
    ctx.strokeStyle = isRed ? '#7a1a1a' : '#143060'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(dr * 0.6, -2); ctx.lineTo(dr * 2.0, 2);
    ctx.stroke();
    // 鞋
    ctx.fillStyle = isRed ? '#e63946' : '#3a86ff';
    ctx.beginPath(); ctx.ellipse(dr * 2.0, 2, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    // 手臂
    ctx.strokeStyle = jCol; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-dr * 0.3, -4); ctx.lineTo(-dr * 1.0, -dr * 0.6);
    ctx.stroke();
    ctx.restore();

    // 头
    ctx.fillStyle = '#f0c0a0';
    const headX = sx + sdx * dr * 1.2;
    const headY = feetY - 10 - Math.abs(sdy) * 5;
    ctx.beginPath(); ctx.arc(headX, headY, dr * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isRed ? '#5a3010' : '#2a1a05';
    ctx.beginPath(); ctx.arc(headX - sdx * 2, headY - 2, dr * 0.3, Math.PI * 0.3, Math.PI * 1.3); ctx.fill();
}

// 门将扑救
function drawDivingGK(p, sx, feetY, dr, isRed) {
    const diveDir = p.diveDir || 0;
    const jCol = isRed ? '#ffb703' : '#fb8500';
    const jDark = isRed ? '#cc8800' : '#cc5500';

    ctx.strokeStyle = 'rgba(255,180,0,.35)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, feetY - 14);
    ctx.lineTo(sx + diveDir * 20, feetY - 14 - Math.abs(diveDir) * 15);
    ctx.stroke();

    ctx.save();
    ctx.translate(sx, feetY - 14);
    const diveAng = diveDir * 0.7;
    ctx.rotate(diveAng);
    const grad = ctx.createLinearGradient(0, -dr * 0.6, 0, dr * 0.6);
    grad.addColorStop(0, jCol); grad.addColorStop(1, jDark);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(0, 0, dr * 1.4, dr * 0.65, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = jCol; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    const armExt = dr * 1.6;
    ctx.beginPath();
    ctx.moveTo(dr * 0.8, -dr * 0.3); ctx.lineTo(armExt, -dr * 0.5);
    ctx.moveTo(dr * 0.8, dr * 0.3); ctx.lineTo(armExt * 0.9, dr * 0.4);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(armExt, -dr * 0.5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(armExt * 0.9, dr * 0.4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const headX = sx + diveDir * dr * 0.8;
    const headY = feetY - 14 - Math.abs(diveDir) * 8;
    ctx.fillStyle = '#f0c0a0';
    ctx.beginPath(); ctx.arc(headX, headY, dr * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isRed ? '#5a3010' : '#2a1a05';
    ctx.beginPath(); ctx.arc(headX, headY - dr * 0.15, dr * 0.35, Math.PI, 0); ctx.fill();
}

// 点球模式绘制
function drawPenalty() {
    const isPlayerTurn = penState === 'aim' || penState === 'shoot' || penState === 'result';
    const spot = isPlayerTurn ? PEN_SPOT_L : PEN_SPOT_R;
    const shooterColor = isPlayerTurn ? '#e63946' : '#3a86ff';
    const sp = project(spot.x, spot.y);
    const kp = project(keeperX, keeperDiveY);

    // 罚球者
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(sp.sx + 2, sp.sy + 3, 13, 9 * CAM_TILT, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shooterColor;
    ctx.beginPath(); ctx.arc(sp.sx, sp.sy, 13, 0, Math.PI * 2); ctx.fill();

    // 门将
    ctx.fillStyle = isPlayerTurn ? '#3a86ff' : '#ffb703';
    ctx.beginPath(); ctx.arc(kp.sx, kp.sy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(kp.sx, kp.sy, 18, 18 * CAM_TILT, 0, 0, Math.PI * 2); ctx.stroke();

    // 瞄准光标（玩家的回合）
    if (penState === 'aim') {
        const gp = project(WALL + GOAL_D / 2, aimY);
        ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(gp.sx, gp.sy, 12, 12 * CAM_TILT, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gp.sx - 18, gp.sy); ctx.lineTo(gp.sx + 18, gp.sy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gp.sx, gp.sy - 18); ctx.lineTo(gp.sx, gp.sy + 18); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('空格 / 射门键 锁定方向', FW / 2, project(0, FH - 40).sy);
    }
}
