// =================================================================
// renderer/ball.js — 足球渲染、飞行轨迹虚线、长传弧线预览、高度指示条
// 绿茵对决 · 足球游戏
//
// drawBallObj(b): 绘制足球本体（白色带五边形花纹）及地面阴影。
//   b: {x, y, z, vx, vy, r} — 球对象或 penBall
// drawBallTrail(): 飞行轨迹虚线（z轴渐变着色）
// drawLobPassPreview(): 蓄力期间的弧线预览
// drawBallHeightBar(): 屏幕右侧球高度实时指示条
// =================================================================

function drawBallObj(b) {
    const pos = project(b.x, b.y);
    const zH = (b.z || 0);
    const top = project(b.x, b.y, zH);
    const ds = pos.dscale;

    // 地面阴影：越高越小越淡
    const shadowScale = Math.max(0.3, 1 - zH / 200) * ds;
    const shadowAlpha = Math.max(0.1, 0.4 - zH / 400);
    ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(pos.sx + 1, pos.sy + 2, b.r * shadowScale, b.r * CAM_TILT * 0.7 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 球本体
    const ballScale = (1 + zH / 600) * ds;
    const drawY = top.sy;
    const drawR = b.r * ballScale;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(pos.sx, drawY, drawR, 0, Math.PI * 2); ctx.fill();

    // 五边形花纹
    ctx.fillStyle = '#222';
    const a = Math.atan2(b.vy, b.vx) + performance.now() / 300;
    for (let i = 0; i < 5; i++) {
        const ang = a + i * Math.PI * 2 / 5;
        ctx.beginPath();
        ctx.arc(pos.sx + Math.cos(ang) * drawR * 0.5, drawY + Math.sin(ang) * drawR * 0.5, drawR * 0.28, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(pos.sx, drawY, drawR, 0, Math.PI * 2); ctx.stroke();
}

// 飞行轨迹虚线
function drawBallTrail() {
    if (ballTrail.length < 2) return;
    const maxH = 200;
    const n = ballTrail.length;
    for (let i = 0; i < n - 1; i++) {
        if (i % 2 !== 0) continue;   // 隔段画，形成虚线
        const p0 = ballTrail[i], p1 = ballTrail[i + 1];
        const pos0 = project(p0.x, p0.y, p0.z);
        const pos1 = project(p1.x, p1.y, p1.z);
        const age = 1 - (i + 1) / n;
        if (age < 0.08) continue;
        const alpha = 0.15 + age * 0.7;
        const zAvg = (p0.z + p1.z) / 2;
        const t = Math.min(1, zAvg / maxH);
        let r, g, b;
        if (t < 0.5) {
            const s = t * 2;
            r = Math.round(46 + s * (255 - 46));
            g = Math.round(204 + s * (214 - 204));
            b = Math.round(64 + s * (10 - 64));
        } else {
            const s = (t - 0.5) * 2;
            r = Math.round(255 + s * (230 - 255));
            g = Math.round(214 + s * (57 - 214));
            b = Math.round(10 + s * (70 - 10));
        }
        const w = 3 + age * 2.5;
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
        ctx.lineWidth = w * pos0.dscale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pos0.sx, pos0.sy);
        ctx.lineTo(pos1.sx, pos1.sy);
        ctx.stroke();
    }
}

// 长传蓄力弧线预览
function drawLobPassPreview() {
    if (lobPassPreview.length < 2) return;
    const n = lobPassPreview.length;
    const maxH = 200;
    for (let i = 0; i < n - 1; i++) {
        if (i % 3 !== 0) continue;
        const p0 = lobPassPreview[i], p1 = lobPassPreview[i + 1];
        if (p0.z < 0 || p1.z < 0) continue;
        const pos0 = project(p0.x, p0.y, p0.z);
        const pos1 = project(p1.x, p1.y, p1.z);
        const zMid = (p0.z + p1.z) / 2;
        const t = Math.min(1, zMid / maxH);
        let r, g, b;
        if (t < 0.35) {
            const s = t / 0.35;
            r = Math.round(46 + s * (138 - 46));
            g = Math.round(204 + s * (228 - 204));
            b = Math.round(64 + s * (52 - 64));
        } else if (t < 0.65) {
            const s = (t - 0.35) / 0.3;
            r = Math.round(138 + s * (255 - 138));
            g = Math.round(228 + s * (214 - 228));
            b = Math.round(52 + s * (10 - 52));
        } else {
            const s = Math.min(1, (t - 0.65) / 0.35);
            r = Math.round(255 + s * (230 - 255));
            g = Math.round(214 + s * (57 - 214));
            b = Math.round(10 + s * (70 - 10));
        }
        const alpha = 0.4 + 0.3 * Math.min(1, zMid / 50);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
        ctx.lineWidth = (2.5 + 2 * (zMid / maxH)) * pos0.dscale;
        ctx.lineCap = 'round';
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pos0.sx, pos0.sy);
        ctx.lineTo(pos1.sx, pos1.sy);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// 球高度指示条（屏幕右侧）
function drawBallHeightBar() {
    const b = mode === 'penalty' ? penBall : ball;
    const z = b.z || 0;
    const maxH = 200;
    const clampedZ = Math.max(0, Math.min(z, maxH));

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const barX = cv.width - 62, barW = 18, barH = 260;
    const barY = (cv.height - barH) / 2;

    // 背景面板
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(barX - 14, barY - 32, barW + 50, barH + 64, 8);
    else ctx.rect(barX - 14, barY - 32, barW + 50, barH + 64);
    ctx.fill();

    ctx.fillStyle = '#ccc'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('球高度', barX + barW / 2, barY - 16);

    // 刻度
    [0, 50, 100, 150, 200].forEach(l => {
        const y = barY + barH - (l / maxH) * barH;
        ctx.strokeStyle = '#555'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(barX + barW, y); ctx.lineTo(barX + barW + 5, y); ctx.stroke();
        ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(String(l), barX + barW + 7, y + 3);
    });

    // 渐变色：低绿 → 中黄 → 高红
    const grad = ctx.createLinearGradient(0, barY + barH, 0, barY);
    grad.addColorStop(0, '#2ecc40'); grad.addColorStop(0.35, '#8ae234');
    grad.addColorStop(0.65, '#ffd60a'); grad.addColorStop(1, '#e63946');

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(barX, barY, barW, barH);

    const fillH = (clampedZ / maxH) * barH;
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY + barH - fillH, barW, fillH);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // 当前数值
    const valY = barY + barH - fillH;
    ctx.fillStyle = '#ffd60a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    const labelY = Math.max(barY + 9, Math.min(valY - 5, barY + barH - 5));
    ctx.fillText(String(Math.round(z)), barX + barW / 2, labelY);

    ctx.restore();
}
