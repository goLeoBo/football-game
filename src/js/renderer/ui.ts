// =================================================================
// renderer/ui.js — 比赛 UI 叠加层渲染（暂停、回放指示、定位球提示、蓄力条、任意球UI、球门球UI）
// 绿茵对决 · 足球游戏
// =================================================================

// 主渲染调度
function draw() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.restore();

    drawStadium();
    drawField();

    if (mode === 'match') drawPlayers();
    else drawPenalty();

    drawBallTrail();
    if (lobPass && lobPass.charging) drawLobPassPreview();
    drawBallObj(mode === 'penalty' ? penBall : ball);
    drawBallHeightBar();

    // 长传蓄力能量条
    if (lobPass && lobPass.charging) drawLobPassPowerBar();

    // 定位球提示
    if (mode === 'match' && setPieceTimer > 0 && setPieceMsg) {
        ctx.fillStyle = '#ffd60a'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(setPieceMsg, FW / 2, project(0, WALL + 30).sy);
    }

    // 暂停
    if (mode === 'match' && state === 'paused') {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 48px sans-serif'; ctx.textAlign = 'center';
        const pauseY = CAM_OFFSET_Y + FH * CAM_TILT / 2;
        ctx.fillText('暂停', FW / 2, pauseY);
        ctx.font = '16px sans-serif';
        ctx.fillText('按 P 继续', FW / 2, pauseY + 40);
    }

    // 回放指示
    if (replayActive) drawReplayOverlay();

    // 任意球 UI
    if (freeKick && !freeKick.isAI) drawFreeKickUI();

    // 球门球 UI
    if (goalKick && !goalKick.isAI) drawGoalKickUI();
}

// --- 回放遮罩 ---
function drawReplayOverlay() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const grad = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.3, cv.width / 2, cv.height / 2, cv.height * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(120,0,0,.35)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#e63946'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('▶ 慢动作回放', 20, 70);
    ctx.fillStyle = '#ccc'; ctx.font = '14px sans-serif';
    ctx.fillText('0.22x', 20, 92);

    const btnW = 130, btnH = 44, btnX = cv.width - btnW - 20, btnY = 20;
    ctx.fillStyle = 'rgba(230,57,70,.85)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(btnX, btnY, btnW, btnH, 10);
    else ctx.rect(btnX, btnY, btnW, btnH);
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('跳过回放 ⏭', btnX + btnW / 2, btnY + btnH / 2 + 5);
    ctx.fillStyle = '#999'; ctx.font = '12px sans-serif';
    ctx.fillText('按空格/回车', btnX + btnW / 2, btnY + btnH + 16);
    ctx.restore();
}

// --- 任意球瞄准 + 力量条 ---
function drawFreeKickUI() {
    const taker = players[freeKick.takerIdx];
    if (!taker) return;

    const s = project(ball.x, ball.y);
    const ex = ball.x + taker.face.x * 180, ey = ball.y + taker.face.y * 180;
    const e = project(ex, ey);

    // 瞄准虚线
    ctx.strokeStyle = 'rgba(255,214,10,.6)'; ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(s.sx, s.sy); ctx.lineTo(e.sx, e.sy); ctx.stroke();
    ctx.setLineDash([]);

    // 箭头
    const ang = Math.atan2(e.sy - s.sy, e.sx - s.sx);
    ctx.fillStyle = 'rgba(255,214,10,.8)';
    ctx.beginPath();
    ctx.moveTo(e.sx, e.sy);
    ctx.lineTo(e.sx - Math.cos(ang - 0.4) * 14, e.sy - Math.sin(ang - 0.4) * 14);
    ctx.lineTo(e.sx - Math.cos(ang + 0.4) * 14, e.sy - Math.sin(ang + 0.4) * 14);
    ctx.closePath(); ctx.fill();

    // 提示文字
    ctx.fillStyle = freeKick.direct ? '#ffd60a' : '#64dcff';
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    if (!freeKick.charging) {
        ctx.fillText(
            freeKick.direct ? '【直接任意球】方向键瞄准 · 按射门蓄力 · 传球直接传出' : '【间接任意球】需先传球再射门 · 建议按传球键传递',
            FW / 2, project(0, WALL + 50).sy
        );
    } else {
        ctx.fillText(
            freeKick.direct ? '再按射门射门！(直接任意球可直接得分)' : '再按射门踢出！(间接任意球直接射门无效)',
            FW / 2, project(0, WALL + 50).sy
        );
    }

    // 力量条
    if (freeKick.charging) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const bx = cv.width / 2 - 120, by = cv.height - 70, bw = 240, bh = 18;
        ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
        const pct = freeKick.power / 100;
        const r = Math.floor(pct < 0.5 ? 255 * pct * 2 : 255);
        const g = Math.floor(pct < 0.5 ? 255 : 255 * (1 - (pct - 0.5) * 2));
        ctx.fillStyle = `rgb(${r},${g},0)`;
        ctx.fillRect(bx, by, bw * pct, bh);
        ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bx + bw * i / 4, by); ctx.lineTo(bx + bw * i / 4, by + bh); ctx.stroke(); }
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`力量 ${Math.floor(freeKick.power)}%`, cv.width / 2, by - 6);
        ctx.restore();
    }
}

// --- 球门球瞄准 + 力量条 ---
function drawGoalKickUI() {
    const taker = players[goalKick.takerIdx];
    if (!taker) return;

    const s = project(ball.x, ball.y);
    const ex = ball.x + taker.face.x * 380, ey = ball.y + taker.face.y * 180;
    const e = project(ex, ey);

    // 弧线预览
    ctx.strokeStyle = 'rgba(100,220,255,.55)'; ctx.lineWidth = 2.5;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.moveTo(s.sx, s.sy);
    const midX = (s.sx + e.sx) / 2, midY = Math.min(s.sy, e.sy) - 90;
    ctx.quadraticCurveTo(midX, midY, e.sx, e.sy);
    ctx.stroke();
    ctx.setLineDash([]);

    // 落点标记
    ctx.fillStyle = 'rgba(100,220,255,.8)';
    ctx.beginPath(); ctx.arc(e.sx, e.sy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(e.sx, e.sy, 7, 0, Math.PI * 2); ctx.stroke();

    // 提示
    ctx.fillStyle = '#64dcff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    if (!goalKick.charging) {
        ctx.fillText('球门球：方向键瞄准 · 射门键蓄力开大脚 · 传球键短传', FW / 2, project(0, WALL + 50).sy);
    } else {
        ctx.fillText('再按射门键开大脚！', FW / 2, project(0, WALL + 50).sy);
    }

    // 力量条
    if (goalKick.charging) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const bx = cv.width / 2 - 120, by = cv.height - 70, bw = 240, bh = 18;
        ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
        const pct = goalKick.power / 100;
        const r = Math.floor(pct * 140), g = Math.floor(200 - pct * 60), b = Math.floor(255);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(bx, by, bw * pct, bh);
        ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bx + bw * i / 4, by); ctx.lineTo(bx + bw * i / 4, by + bh); ctx.stroke(); }
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`开球力量 ${Math.floor(goalKick.power)}%`, cv.width / 2, by - 6);
        ctx.restore();
    }
}

// --- 长传蓄力条 ---
function drawLobPassPowerBar() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pw = 200, ph = 14, px = (cv.width - pw) / 2, py = cv.height - 60;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px - 4, py - 20, pw + 8, ph + 38, 8);
    else ctx.rect(px - 4, py - 20, pw + 8, ph + 38);
    ctx.fill();
    ctx.fillStyle = '#ccc'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('长传蓄力', cv.width / 2, py - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(px, py, pw, ph);
    const pct = Math.min(1, (lobPass.power || 0) / 100);
    const grad = ctx.createLinearGradient(px, 0, px + pw, 0);
    grad.addColorStop(0, '#2ecc40'); grad.addColorStop(0.5, '#ffd60a'); grad.addColorStop(1, '#e63946');
    ctx.fillStyle = grad; ctx.fillRect(px, py, pw * pct, ph);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
    ctx.strokeRect(px, py, pw, ph);
    ctx.restore();
}
