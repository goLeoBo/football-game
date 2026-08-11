// =================================================================
// renderer/field.js — 球场绘制：草地、割草条纹、边线、禁区、中圈、球门、越位线
// 绿茵对决 · 足球游戏
// =================================================================

function drawField() {
    // 草地基础色
    const ftl = project(0, 0), ftr = project(FW, 0), fbl = project(0, FH), fbr = project(FW, FH);
    fillTrap(ftl, ftr, fbr, fbl, '#2f8a2f');

    // 竖向割草条纹
    const stripes = 14;
    for (let i = 0; i < stripes; i++) {
        const x0 = i * FW / stripes, x1 = (i + 1) * FW / stripes;
        fillTrap(project(x0, 0), project(x1, 0), project(x1, FH), project(x0, FH),
            i % 2 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)');
    }

    // 深度渐变（远端暗 → 近端亮）
    const grad = ctx.createLinearGradient(0, ftl.sy, 0, fbl.sy);
    grad.addColorStop(0, 'rgba(0,0,0,.32)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(255,255,255,.06)');
    fillTrap(ftl, ftr, fbr, fbl, grad);

    // 边角虚化
    const vg = ctx.createRadialGradient(FW / 2, (ftl.sy + fbl.sy) / 2, FW * 0.3, FW / 2, (ftl.sy + fbl.sy) / 2, FW * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.25)');
    fillTrap(ftl, ftr, fbr, fbl, vg);

    // 边线
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = WALL;
    const tl = project(WALL / 2, WALL / 2), tr = project(FW - WALL / 2, WALL / 2);
    const bl_ = project(WALL / 2, FH - WALL / 2), br_ = project(FW - WALL / 2, FH - WALL / 2);
    ctx.beginPath();
    ctx.moveTo(tl.sx, tl.sy); ctx.lineTo(tr.sx, tr.sy);
    ctx.lineTo(br_.sx, br_.sy); ctx.lineTo(bl_.sx, bl_.sy);
    ctx.closePath(); ctx.stroke();

    // 中线 + 中圈
    ctx.lineWidth = 3;
    if (mode === 'match') {
        const mt = project(FW / 2, WALL), mb = project(FW / 2, FH - WALL);
        ctx.beginPath(); ctx.moveTo(mt.sx, mt.sy); ctx.lineTo(mb.sx, mb.sy); ctx.stroke();
        const mc = project(FW / 2, FH / 2);
        ctx.beginPath(); ctx.ellipse(mc.sx, mc.sy, 125 * mc.dscale, 125 * CAM_TILT, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(mc.sx, mc.sy, 4, 0, Math.PI * 2); ctx.fill();
    }

    // 大禁区（左右）
    const bw = 225, bh = 550;
    drawRect(WALL, FH / 2 - bh / 2, WALL + bw, FH / 2 + bh / 2);
    drawRect(FW - WALL - bw, FH / 2 - bh / 2, FW - WALL, FH / 2 + bh / 2);

    // 小禁区
    const sw = 75, sh = 250;
    drawRect(WALL, FH / 2 - sh / 2, WALL + sw, FH / 2 + sh / 2);
    drawRect(FW - WALL - sw, FH / 2 - sh / 2, FW - WALL, FH / 2 + sh / 2);

    // 点球点 + 罚球弧
    if (mode === 'match') {
        const penDist = 150, arcR = 125;
        const a1 = Math.acos((bw - penDist) / arcR);
        const pl = project(WALL + penDist, FH / 2);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(pl.sx, pl.sy, 4 * pl.dscale, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(pl.sx, pl.sy, arcR * pl.dscale, arcR * CAM_TILT, 0, -a1, a1); ctx.stroke();
        const pr = project(FW - WALL - penDist, FH / 2);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(pr.sx, pr.sy, 4 * pr.dscale, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(pr.sx, pr.sy, arcR * pr.dscale, arcR * CAM_TILT, 0, Math.PI - a1, Math.PI + a1); ctx.stroke();
    }

    // 越位线（虚线）
    if (mode === 'match' && state === 'playing' && ball.lastTeam >= 0 && ball.lastTeam <= 1) {
        const attTeam = ball.lastTeam, lineX = getOffsideLine(attTeam);
        const lt = project(lineX, 0), lb = project(lineX, FH);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,214,10,.35)'; ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(lt.sx, lt.sy); ctx.lineTo(lb.sx, lb.sy); ctx.stroke();
        ctx.restore();
    }

    // 3D 球门
    drawGoal3D(0, FH / 2, true);
    drawGoal3D(FW, FH / 2, false);

    // 点球点（penalty 模式）
    if (mode === 'penalty') {
        ctx.fillStyle = '#fff';
        const pl = project(PEN_SPOT_L.x, PEN_SPOT_L.y), pr = project(PEN_SPOT_R.x, PEN_SPOT_R.y);
        ctx.beginPath(); ctx.arc(pl.sx, pl.sy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(pr.sx, pr.sy, 3, 0, Math.PI * 2); ctx.fill();
    }
}

// 矩形（透视后 → 梯形）
function drawRect(x1, y1, x2, y2) {
    const a = project(x1, y1), b = project(x2, y1), c = project(x2, y2), d = project(x1, y2);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
    ctx.closePath(); ctx.stroke();
}

// 3D 球门（带网）
function drawGoal3D(gx, gy, isLeft) {
    const postH = 34;
    const depth = isLeft ? -20 : 20;
    const ftl = project(gx, gy - GOAL_H / 2), fbl = project(gx, gy + GOAL_H / 2);
    const btl = project(gx + depth, gy - GOAL_H / 2), bbl = project(gx + depth, gy + GOAL_H / 2);
    const fTopL = ftl.sy - postH, fTopR = fbl.sy - postH;
    const bTopL = btl.sy - postH * 0.72, bTopR = bbl.sy - postH * 0.72;

    // 网格四边形
    function netQuad(x1, y1, x2, y2, x3, y3, x4, y4, cols, rows) {
        ctx.fillStyle = 'rgba(255,255,255,.07)';
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1;
        for (let i = 1; i < cols; i++) {
            const t = i / cols;
            ctx.beginPath();
            ctx.moveTo(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
            ctx.lineTo(x4 + (x3 - x4) * t, y4 + (y3 - y4) * t);
            ctx.stroke();
        }
        for (let j = 1; j < rows; j++) {
            const t = j / rows;
            ctx.beginPath();
            ctx.moveTo(x1 + (x4 - x1) * t, y1 + (y4 - y1) * t);
            ctx.lineTo(x2 + (x3 - x2) * t, y2 + (y3 - y2) * t);
            ctx.stroke();
        }
    }

    netQuad(btl.sx, bTopL, bbl.sx, bTopR, bbl.sx, bbl.sy, btl.sx, btl.sy, 6, 5);
    netQuad(ftl.sx, fTopL, fbl.sx, fTopR, bbl.sx, bTopR, btl.sx, bTopL, 6, 3);
    netQuad(ftl.sx, ftl.sy, ftl.sx, fTopL, btl.sx, bTopL, btl.sx, btl.sy, 3, 5);
    netQuad(fbl.sx, fTopR, fbl.sx, fbl.sy, bbl.sx, bbl.sy, bbl.sx, bTopR, 3, 5);

    // 门柱 + 横梁
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ftl.sx, ftl.sy); ctx.lineTo(ftl.sx, fTopL); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fbl.sx, fbl.sy); ctx.lineTo(fbl.sx, fTopR); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ftl.sx, fTopL); ctx.lineTo(fbl.sx, fTopR); ctx.stroke();
}
