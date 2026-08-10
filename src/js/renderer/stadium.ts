// =================================================================
// renderer/stadium.js — 3D 体育场渲染：多层看台、观众、LED 广告牌、场边细节
// 绿茵对决 · 足球游戏
//
// 四层绘制：
//   1. 看台建筑结构（16 段多层梯形）
//   2. LED 电子广告牌（带发光 + 点阵灯珠）
//   3. 观众人群（LOD 三档：远景简化 / 中景 / 近景完整人形）
//   4. 场边摄像机、替补席、角旗
// =================================================================

// --- 看台参数 ---
const TIER_COUNT = 3;
const TIER_CONFIG = {
    far:   { rows: [7, 8, 9], rowH: [17, 15, 13], yStart: -16, yDir: -1, stepH: [18, 16, 14], crowdPerRow: [42, 34, 28] },
    near:  { rows: [5, 6, 7], rowH: [17, 16, 14], yStart: FH + 12, yDir: 1, stepH: [19, 17, 15], crowdPerRow: [38, 30, 24] },
    left:  { rows: [11, 9, 7], rowH: [13, 11, 10], yStart: -18, yDir: -1, xStart: -22, xDir: -1, stepW: [14, 12, 11], crowdPerRow: [52, 42, 34] },
    right: { rows: [11, 9, 7], rowH: [13, 11, 10], yStart: -18, yDir: -1, xStart: FW + 22, xDir: 1, stepW: [14, 12, 11], crowdPerRow: [52, 42, 34] }
};

let stadiumCrowd = null;

// 梯形填充工具：四个项目坐标 → 填充纯色/渐变
function fillTrap(tl, tr, br, bl, style) {
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.moveTo(tl.sx, tl.sy); ctx.lineTo(tr.sx, tr.sy);
    ctx.lineTo(br.sx, br.sy); ctx.lineTo(bl.sx, bl.sy);
    ctx.closePath(); ctx.fill();
}

// --- 初始化观众（一次生成，每帧按深度排序渲染）---
function initStadiumCrowd() {
    const arr = [];
    const homeColor = '#e63946', awayColor = '#104999';
    // 色带分区
    const sectionPalette = [
        [homeColor, '#d62839', '#c1121f'],
        [awayColor, '#1a5bb5', '#0d3b7a'],
        ['#ffd60a', '#f4c700', '#d4a800'],
        ['#06d6a0', '#05b88a', '#049a74'],
        ['#8338ec', '#6d28d9', '#5a1dc2'],
        ['#fb8500', '#e67600', '#cc6700'],
        ['#ffffff', '#eeeeee', '#dddddd'],
        ['#222222', '#333333', '#444444']
    ];
    const skinColors = ['#f0c0a0', '#d4a373', '#e8b894', '#c89270', '#ba8766', '#cd9358'];

    // 远端看台
    const farDeps = [0, TIER_CONFIG.far.rows[0] * TIER_CONFIG.far.stepH[0], TIER_CONFIG.far.rows[0] * TIER_CONFIG.far.stepH[0] + TIER_CONFIG.far.rows[1] * TIER_CONFIG.far.stepH[1]];
    for (let tier = 0; tier < TIER_COUNT; tier++) {
        const rows = TIER_CONFIG.far.rows[tier], rowH = TIER_CONFIG.far.rowH[tier];
        const yOff = farDeps[tier];
        for (let r = 0; r < rows; r++) {
            const y = TIER_CONFIG.far.yStart - yOff + r * rowH * TIER_CONFIG.far.yDir;
            const density = TIER_CONFIG.far.crowdPerRow[tier];
            const pal = sectionPalette[(tier * 3 + r) % 8];
            for (let i = 0; i < density; i++) {
                const x = 2 + (i / (density - 1)) * (FW - 4) + (Math.random() - 0.5) * 2;
                arr.push({
                    x, y, tier,
                    shirt: Math.random() < 0.85 ? pal[Math.floor(Math.random() * 3)] : sectionPalette[Math.floor(Math.random() * 8)][0],
                    skin: skinColors[Math.floor(Math.random() * skinColors.length)],
                    h: 12 + Math.random() * 5 + tier * 1.5,
                    w: 7.5 + Math.random() * 3.5,
                    jitter: Math.random() * Math.PI * 2,
                    wave: Math.random() < 0.06,
                    clap: Math.random() < 0.05,
                    hasScarf: Math.random() < 0.08
                });
            }
        }
    }

    // 近端看台
    const nearDeps = [0, TIER_CONFIG.near.rows[0] * TIER_CONFIG.near.stepH[0], TIER_CONFIG.near.rows[0] * TIER_CONFIG.near.stepH[0] + TIER_CONFIG.near.rows[1] * TIER_CONFIG.near.stepH[1]];
    for (let tier = 0; tier < TIER_COUNT; tier++) {
        const rows = TIER_CONFIG.near.rows[tier], rowH = TIER_CONFIG.near.rowH[tier];
        const yOff = nearDeps[tier];
        for (let r = 0; r < rows; r++) {
            const y = TIER_CONFIG.near.yStart + yOff + r * rowH;
            const density = TIER_CONFIG.near.crowdPerRow[tier];
            const pal = sectionPalette[(tier * 3 + r + 1) % 8];
            for (let i = 0; i < density; i++) {
                const x = 2 + (i / (density - 1)) * (FW - 4) + (Math.random() - 0.5) * 2;
                arr.push({
                    x, y, tier: tier + 3,
                    shirt: Math.random() < 0.85 ? pal[Math.floor(Math.random() * 3)] : sectionPalette[Math.floor(Math.random() * 8)][0],
                    skin: skinColors[Math.floor(Math.random() * skinColors.length)],
                    h: 14 + Math.random() * 5 + tier * 1.5,
                    w: 8.5 + Math.random() * 3.5,
                    jitter: Math.random() * Math.PI * 2,
                    wave: Math.random() < 0.08,
                    clap: Math.random() < 0.06,
                    hasScarf: Math.random() < 0.09
                });
            }
        }
    }

    // 左侧看台
    const leftDeps = [0, TIER_CONFIG.left.rows[0] * TIER_CONFIG.left.stepW[0], TIER_CONFIG.left.rows[0] * TIER_CONFIG.left.stepW[0] + TIER_CONFIG.left.rows[1] * TIER_CONFIG.left.stepW[1]];
    for (let tier = 0; tier < TIER_COUNT; tier++) {
        const rows = TIER_CONFIG.left.rows[tier], rowH = TIER_CONFIG.left.rowH[tier];
        const xBase = TIER_CONFIG.left.xStart - leftDeps[tier];
        for (let r = 0; r < rows; r++) {
            const x = xBase + r * rowH * TIER_CONFIG.left.xDir;
            const density = TIER_CONFIG.left.crowdPerRow[tier];
            const pal = sectionPalette[(tier * 3 + r + 2) % 8];
            for (let i = 0; i < density; i++) {
                const y = 3 + (i / (density - 1)) * (FH - 6) + (Math.random() - 0.5) * 2;
                arr.push({
                    x, y, tier: tier + 6,
                    shirt: Math.random() < 0.85 ? pal[Math.floor(Math.random() * 3)] : sectionPalette[Math.floor(Math.random() * 8)][0],
                    skin: skinColors[Math.floor(Math.random() * skinColors.length)],
                    h: 12 + Math.random() * 5 + tier * 1.2,
                    w: 7.5 + Math.random() * 3.5,
                    jitter: Math.random() * Math.PI * 2,
                    wave: Math.random() < 0.06,
                    clap: Math.random() < 0.04,
                    hasScarf: Math.random() < 0.07
                });
            }
        }
    }

    // 右侧看台
    for (let tier = 0; tier < TIER_COUNT; tier++) {
        const rows = TIER_CONFIG.right.rows[tier], rowH = TIER_CONFIG.right.rowH[tier];
        const xBase = TIER_CONFIG.right.xStart + leftDeps[tier];
        for (let r = 0; r < rows; r++) {
            const x = xBase + r * rowH;
            const density = TIER_CONFIG.right.crowdPerRow[tier];
            const pal = sectionPalette[(tier * 3 + r + 3) % 8];
            for (let i = 0; i < density; i++) {
                const y = 3 + (i / (density - 1)) * (FH - 6) + (Math.random() - 0.5) * 2;
                arr.push({
                    x, y, tier: tier + 9,
                    shirt: Math.random() < 0.85 ? pal[Math.floor(Math.random() * 3)] : sectionPalette[Math.floor(Math.random() * 8)][0],
                    skin: skinColors[Math.floor(Math.random() * skinColors.length)],
                    h: 12 + Math.random() * 5 + tier * 1.2,
                    w: 7.5 + Math.random() * 3.5,
                    jitter: Math.random() * Math.PI * 2,
                    wave: Math.random() < 0.06,
                    clap: Math.random() < 0.04,
                    hasScarf: Math.random() < 0.07
                });
            }
        }
    }
    stadiumCrowd = arr;
}

// --- LED 广告牌 ---
const AD_LED_TEXTS = [
    'GOLEOBO', 'SPORT+ LIVE', 'UEFA CHAMPIONS', 'FAIR PLAY', 'GOAL!!!',
    'WORLD CUP 2026', 'PRO LEAGUE', 'DREAM TEAM', 'VICTORY', 'SOCCER LIVE',
    'PREMIER LEAGUE', 'CHAMPIONS LEAGUE', 'FOOTBALL', 'STAR PLAYERS', 'ELITE SPORT'
];
const AD_LED_COLORS = ['#ff3333', '#33ff33', '#3399ff', '#ffcc00', '#ff66cc', '#00ffcc', '#ff6600', '#cc33ff'];
let adData = null;

function initAds() {
    adData = [];
    const countPerSide = 12;
    // 远端
    for (let i = 0; i < countPerSide; i++) {
        const w = FW / countPerSide;
        adData.push({
            x: i * w + w / 2, y: -24, w: w * 0.9, h: 16,
            text: AD_LED_TEXTS[(i + Math.floor(Math.random() * AD_LED_TEXTS.length)) % AD_LED_TEXTS.length],
            bg: AD_LED_COLORS[i % AD_LED_COLORS.length],
            side: 'far', index: i, glowColor: AD_LED_COLORS[i % AD_LED_COLORS.length]
        });
    }
    // 近端
    for (let i = 0; i < countPerSide; i++) {
        const w = FW / countPerSide;
        adData.push({
            x: i * w + w / 2, y: FH + 16, w: w * 0.9, h: 16,
            text: AD_LED_TEXTS[(i + 5) % AD_LED_TEXTS.length],
            bg: AD_LED_COLORS[(i + 3) % AD_LED_COLORS.length],
            side: 'near', index: i, glowColor: AD_LED_COLORS[(i + 3) % AD_LED_COLORS.length]
        });
    }
    // 左侧
    const leftCount = 8;
    for (let i = 0; i < leftCount; i++) {
        const hh = FH / leftCount;
        adData.push({
            x: -24, y: i * hh + hh / 2, w: 16, h: hh * 0.85,
            text: AD_LED_TEXTS[(i + 8) % AD_LED_TEXTS.length],
            bg: AD_LED_COLORS[(i + 6) % AD_LED_COLORS.length],
            side: 'left', index: i, glowColor: AD_LED_COLORS[(i + 6) % AD_LED_COLORS.length]
        });
    }
    // 右侧
    for (let i = 0; i < leftCount; i++) {
        const hh = FH / leftCount;
        adData.push({
            x: FW + 24, y: i * hh + hh / 2, w: 16, h: hh * 0.85,
            text: AD_LED_TEXTS[(i + 12) % AD_LED_TEXTS.length],
            bg: AD_LED_COLORS[(i + 1) % AD_LED_COLORS.length],
            side: 'right', index: i, glowColor: AD_LED_COLORS[(i + 1) % AD_LED_COLORS.length]
        });
    }
}

// ==============================================================
// 主渲染函数
// ==============================================================

function drawStadium() {
    if (!stadiumCrowd) initStadiumCrowd();
    if (!adData) initAds();
    const t = performance.now() / 1000;

    // == 第一阶段：看台建筑结构 ==

    // 远端三层
    const farBaseY = -16;
    const farTierDepth = [7 * 14, 7 * 14 + 8 * 12, 7 * 14 + 8 * 12 + 9 * 11];
    for (let tier = TIER_COUNT - 1; tier >= 0; tier--) {
        const rows = TIER_CONFIG.far.rows[tier];
        const yStart = farBaseY - (tier === 0 ? 0 : farTierDepth[tier - 1]);
        const stepH = [14, 12, 11][tier];
        for (let r = rows - 1; r >= 0; r--) {
            const y0 = yStart + r * stepH * (-1), y1 = yStart + (r + 1) * stepH * (-1);
            const shade = 14 + tier * 8 + r * 3;
            fillTrap(project(-60, y1), project(FW + 60, y1), project(FW + 60, y0), project(-60, y0), `rgb(${shade},${shade + 3},${shade + 14})`);
        }
        const rY = yStart + rows * stepH * (-1);
        fillTrap(project(-55, rY), project(FW + 55, rY), project(FW + 55, rY - 5), project(-55, rY - 5), '#4a4a5a');
    }

    // 近端三层
    const nearBaseY = FH + 12;
    const nearTierDepth = [5 * 14, 5 * 14 + 6 * 13, 5 * 14 + 6 * 13 + 7 * 12];
    for (let tier = TIER_COUNT - 1; tier >= 0; tier--) {
        const rows = TIER_CONFIG.near.rows[tier];
        const yStart = nearBaseY + (tier === 0 ? 0 : nearTierDepth[tier - 1]);
        const stepH = [14, 13, 12][tier];
        for (let r = rows - 1; r >= 0; r--) {
            const y0 = yStart + r * stepH, y1 = yStart + (r + 1) * stepH;
            const shade = 12 + tier * 7 + r * 4;
            fillTrap(project(-60, y0), project(FW + 60, y0), project(FW + 60, y1), project(-60, y1), `rgb(${shade},${shade + 2},${shade + 10})`);
        }
        const rY = yStart + rows * stepH;
        fillTrap(project(-55, rY), project(FW + 55, rY), project(FW + 55, rY + 3), project(-55, rY + 3), '#4a4a5a');
    }

    // 左侧多层
    const leftTierDepth = [11 * 10, 11 * 10 + 9 * 9, 11 * 10 + 9 * 9 + 7 * 8];
    for (let tier = TIER_COUNT - 1; tier >= 0; tier--) {
        const xStart = -22 - (tier === 0 ? 0 : leftTierDepth[tier - 1]);
        const rows = [11, 9, 7][tier], stepW = [10, 9, 8][tier];
        for (let r = rows - 1; r >= 0; r--) {
            const x0 = xStart + r * stepW * (-1), x1 = xStart + (r + 1) * stepW * (-1);
            const shade = 10 + tier * 6 + r * 2;
            fillTrap(project(x1, -60), project(x0, -60), project(x0, FH + 60), project(x1, FH + 60), `rgb(${shade},${shade + 3},${shade + 12})`);
        }
        const rx = xStart + rows * stepW * (-1);
        fillTrap(project(rx, -55), project(rx + 4, -55), project(rx + 4, FH + 55), project(rx, FH + 55), '#4a4a5a');
    }

    // 右侧多层
    for (let tier = TIER_COUNT - 1; tier >= 0; tier--) {
        const xStart = FW + 22 + (tier === 0 ? 0 : leftTierDepth[tier - 1]);
        const rows = [11, 9, 7][tier], stepW = [10, 9, 8][tier];
        for (let r = rows - 1; r >= 0; r--) {
            const x0 = xStart + r * stepW, x1 = xStart + (r + 1) * stepW;
            const shade = 10 + tier * 6 + r * 2;
            fillTrap(project(x0, -60), project(x1, -60), project(x1, FH + 60), project(x0, FH + 60), `rgb(${shade},${shade + 3},${shade + 12})`);
        }
        const rx = xStart + rows * stepW;
        fillTrap(project(rx - 4, -55), project(rx, -55), project(rx, FH + 55), project(rx - 4, FH + 55), '#4a4a5a');
    }

    // 四角
    [[-60, -60, 20, 20], [FW + 40, -60, 20, 20], [-60, FH + 40, 20, 20], [FW + 40, FH + 40, 20, 20]].forEach(c => {
        fillTrap(project(c[0], c[1]), project(c[0] + c[2], c[1]), project(c[0] + c[2], c[1] + c[3]), project(c[0], c[1] + c[3]), '#1a1a28');
    });

    // == 第二阶段：LED 电子广告牌 ==
    const ledGlow = 0.6 + Math.sin(t * 2.5) * 0.3;
    adData.forEach(ad => {
        const isH = ad.side === 'far' || ad.side === 'near';
        let tl, tr, bl, br;
        if (isH) {
            tl = project(ad.x - ad.w / 2, ad.y - ad.h, 6); tr = project(ad.x + ad.w / 2, ad.y - ad.h, 6);
            bl = project(ad.x - ad.w / 2, ad.y, 0);      br = project(ad.x + ad.w / 2, ad.y, 0);
        } else {
            tl = project(ad.x - ad.w, ad.y - ad.h / 2, 6); tr = project(ad.x, ad.y - ad.h / 2, 6);
            bl = project(ad.x - ad.w, ad.y + ad.h / 2, 0); br = project(ad.x, ad.y + ad.h / 2, 0);
        }
        const mid = isH ? project(ad.x, ad.y - ad.h * 0.5, 4) : project(ad.x - ad.w * 0.5, ad.y, 4);
        const midDS = mid.dscale || 0.85;
        fillTrap(tl, tr, br, bl, ad.bg);
        ctx.strokeStyle = ad.glowColor; ctx.lineWidth = 2 * midDS;
        ctx.save();
        try { ctx.shadowColor = ad.glowColor; ctx.shadowBlur = 8 * ledGlow * midDS; } catch (e) { /* ignore */ }
        ctx.beginPath(); ctx.moveTo(tl.sx, tl.sy); ctx.lineTo(tr.sx, tr.sy);
        ctx.lineTo(br.sx, br.sy); ctx.lineTo(bl.sx, bl.sy);
        ctx.closePath(); ctx.stroke(); ctx.restore();
        ctx.fillStyle = '#fff';
        const fs = Math.max(5, (isH ? 11 : 8) * midDS);
        ctx.font = `bold ${fs}px "Courier New", monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.save();
        try { ctx.shadowColor = 'rgba(255,255,255,.9)'; ctx.shadowBlur = 4 * ledGlow * midDS; } catch (e) { /* ignore */ }
        ctx.fillText(ad.text, mid.sx, mid.sy); ctx.restore();
        // LED 小灯珠
        const dotCount = isH ? 6 : 4;
        for (let d = 0; d < dotCount; d++) {
            const frac = (d + 0.5) / dotCount;
            const dx = isH ? tl.sx + (tr.sx - tl.sx) * frac : tl.sx + (tr.sx - tl.sx) * 0.5;
            const dy = isH ? bl.sy + (br.sy - bl.sy) * 0.85 : tl.sy + (bl.sy - tl.sy) * frac;
            ctx.fillStyle = Math.sin(t * 8 + d * 1.7) > 0 ? ad.glowColor : '#333';
            ctx.beginPath(); ctx.arc(dx, dy, 2 * midDS, 0, Math.PI * 2); ctx.fill();
        }
    });

    // == 第三阶段：观众 ==
    const sorted = [...stadiumCrowd].sort((a, b) => a.y - b.y);
    sorted.forEach(c => {
        const pos = project(c.x, c.y), ds = pos.dscale;
        if (ds < 0.10) return;
        const t2 = performance.now() / 1000;
        const bob = Math.sin(t2 * 2.1 + c.jitter) * 0.35;
        const w = c.w * ds, h = c.h * ds;
        const px = pos.sx, py = pos.sy + bob;
        const headR = w * 0.28, headCY = py - h * 0.92, neckY = py - h * 0.68;
        const shL = px - w * 0.32, shR = px + w * 0.32, shY = py - h * 0.70;
        const waL = px - w * 0.18, waR = px + w * 0.18, waY = py - h * 0.15;
        const hipL = px - w * 0.16, hipR = px + w * 0.16, hipY = py - h * 0.08;
        const kneeY = py + h * 0.12, footY = py + h * 0.28;

        if (ds < 0.22) {
            // 远景简化人形
            ctx.globalAlpha = 0.4 + ds * 0.7;
            ctx.fillStyle = c.shirt;
            ctx.beginPath(); ctx.moveTo(shL, shY); ctx.lineTo(shR, shY); ctx.lineTo(waR, waY); ctx.lineTo(waL, waY);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = c.skin;
            ctx.beginPath(); ctx.arc(px, headCY, headR, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = w * 0.08; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(hipL, hipY); ctx.lineTo(px - w * 0.12, kneeY); ctx.lineTo(px - w * 0.1, footY);
            ctx.moveTo(hipR, hipY); ctx.lineTo(px + w * 0.12, kneeY); ctx.lineTo(px + w * 0.1, footY);
            ctx.stroke();
            ctx.strokeStyle = c.skin; ctx.lineWidth = w * 0.07;
            ctx.beginPath();
            ctx.moveTo(shL + w * 0.04, shY + 2); ctx.lineTo(px - w * 0.22, py - h * 0.2);
            ctx.moveTo(shR - w * 0.04, shY + 2); ctx.lineTo(px + w * 0.22, py - h * 0.2);
            ctx.stroke();
        } else if (ds < 0.45) {
            // 中景
            ctx.globalAlpha = 0.55 + ds * 0.45;
            ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = w * 0.12; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(hipL, hipY); ctx.lineTo(px - w * 0.14, kneeY); ctx.lineTo(px - w * 0.12, footY);
            ctx.moveTo(hipR, hipY); ctx.lineTo(px + w * 0.14, kneeY); ctx.lineTo(px + w * 0.12, footY);
            ctx.stroke();
            ctx.strokeStyle = c.skin; ctx.lineWidth = w * 0.1; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(shL + w * 0.05, shY + 2); ctx.lineTo(px - w * 0.24, py - h * 0.22);
            ctx.moveTo(shR - w * 0.05, shY + 2); ctx.lineTo(px + w * 0.24, py - h * 0.22);
            ctx.stroke();
            ctx.fillStyle = c.shirt;
            ctx.beginPath(); ctx.moveTo(shL, shY); ctx.lineTo(shR, shY); ctx.lineTo(waR, waY); ctx.lineTo(waL, waY);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = c.skin;
            ctx.beginPath(); ctx.arc(px, headCY, headR, 0, Math.PI * 2); ctx.fill();
        } else {
            // 近景完整人形 + 动画
            ctx.globalAlpha = 0.68 + ds * 0.32;
            ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = w * 0.15; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(hipL, hipY); ctx.lineTo(px - w * 0.14, kneeY); ctx.lineTo(px - w * 0.12, footY);
            ctx.moveTo(hipR, hipY); ctx.lineTo(px + w * 0.14, kneeY); ctx.lineTo(px + w * 0.12, footY);
            ctx.stroke();
            ctx.fillStyle = c.shirt;
            ctx.beginPath(); ctx.moveTo(shL, shY); ctx.lineTo(shR, shY); ctx.lineTo(waR, waY); ctx.lineTo(waL, waY);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = c.skin;
            ctx.beginPath(); ctx.arc(px, headCY, headR, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = c.skin; ctx.lineWidth = w * 0.12; ctx.lineCap = 'round';
            if (c.wave) {
                const waveAng = Math.sin(t2 * 3.5 + c.jitter) * 0.55 + 1.2;
                ctx.beginPath();
                ctx.moveTo(shL + w * 0.06, shY + 2); ctx.lineTo(px - w * 0.22, py - h * 0.2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(shR - w * 0.06, shY + 2);
                ctx.lineTo(shR + Math.cos(waveAng) * w * 0.65, shY - Math.sin(waveAng) * w * 0.65);
                ctx.stroke();
            } else if (c.clap) {
                const clapIn = Math.abs(Math.sin(t2 * 4.5 + c.jitter)) * 0.25;
                ctx.beginPath();
                ctx.moveTo(shL + w * 0.06, shY + 2); ctx.lineTo(px - w * 0.08 - clapIn * w * 0.35, py - h * 0.35);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(shR - w * 0.06, shY + 2); ctx.lineTo(px + w * 0.08 + clapIn * w * 0.35, py - h * 0.35);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(shL + w * 0.06, shY + 2); ctx.lineTo(px - w * 0.22, py - h * 0.2);
                ctx.moveTo(shR - w * 0.06, shY + 2); ctx.lineTo(px + w * 0.22, py - h * 0.2);
                ctx.stroke();
            }
            if (c.hasScarf) {
                ctx.fillStyle = '#ffd60a';
                ctx.beginPath(); ctx.ellipse(px, neckY + w * 0.04, w * 0.28, w * 0.1, -0.15, 0, Math.PI * 2); ctx.fill();
            }
        }
    });

    // 灯光暗角
    ctx.globalAlpha = 0.15;
    const farGrad = ctx.createLinearGradient(0, project(0, -16).sy, 0, project(0, -216).sy);
    farGrad.addColorStop(0, 'rgba(0,0,0,0)'); farGrad.addColorStop(0.3, 'rgba(0,0,0,.65)'); farGrad.addColorStop(1, 'rgba(0,0,0,.88)');
    ctx.fillStyle = farGrad; ctx.fillRect(0, 0, cv.width, project(0, -216).sy);
    const nearGrad = ctx.createLinearGradient(0, project(0, FH + 200).sy, 0, project(0, FH + 12).sy);
    nearGrad.addColorStop(0, 'rgba(0,0,0,.82)'); nearGrad.addColorStop(0.5, 'rgba(0,0,0,.18)'); nearGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = nearGrad; ctx.fillRect(0, project(0, FH + 12).sy, cv.width, project(0, FH + 200).sy - project(0, FH + 12).sy);
    ctx.globalAlpha = 1;

    // == 第四阶段：场边细节 ==
    // 摄像机
    [FW * 0.2, FW * 0.4, FW * 0.6, FW * 0.8].forEach(cx => drawCamera(cx, -18));
    [FW * 0.3, FW * 0.7].forEach(cx => drawCamera(cx, FH + 14));
    // 替补席
    drawBench(-18, FH / 2 - 70, true);
    drawBench(FW + 18, FH / 2 - 70, false);
    // 角旗
    [[WALL, WALL], [FW - WALL, WALL], [WALL, FH - WALL], [FW - WALL, FH - WALL]].forEach(([cx, cy]) => {
        const cp = project(cx, cy);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * cp.dscale;
        ctx.beginPath(); ctx.moveTo(cp.sx, cp.sy); ctx.lineTo(cp.sx, cp.sy - 12 * cp.dscale); ctx.stroke();
        ctx.fillStyle = '#ffd60a';
        ctx.beginPath(); ctx.arc(cp.sx, cp.sy - 13 * cp.dscale, 3 * cp.dscale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e63946';
        ctx.beginPath();
        ctx.moveTo(cp.sx, cp.sy - 13 * cp.dscale);
        ctx.lineTo(cp.sx + 7 * cp.dscale, cp.sy - 17 * cp.dscale);
        ctx.lineTo(cp.sx, cp.sy - 20 * cp.dscale);
        ctx.closePath(); ctx.fill();
    });
}

// 场边摄像机
function drawCamera(cx, cy) {
    const pos = project(cx, cy), ds = pos.dscale, sz = 7 * ds;
    const sx = pos.sx, sy = pos.sy;
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5 * ds; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(sx - sz * 0.8, sy + sz * 1.5);
    ctx.moveTo(sx, sy); ctx.lineTo(sx + sz * 0.8, sy + sz * 1.5);
    ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + sz * 1.5);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.ellipse(sx, sy - sz * 0.3, sz * 0.7, sz * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.ellipse(sx, sy - sz * 0.3, sz * 0.3, sz * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(100,180,255,.4)';
    ctx.beginPath(); ctx.arc(sx - sz * 0.1, sy - sz * 0.4, sz * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3333';
    ctx.beginPath(); ctx.arc(sx + sz * 0.35, sy - sz * 0.4, sz * 0.1, 0, Math.PI * 2); ctx.fill();
}

// 替补席
function drawBench(bx, by, isLeft) {
    const len = 120, bw = 14;
    const tl = project(bx, by, 22), tr = project(bx + len, by, 22);
    const bl = project(bx, by + bw, 0), br = project(bx + len, by + bw, 0);
    fillTrap(tl, tr, br, bl, isLeft ? 'rgba(60,70,90,.9)' : 'rgba(90,70,60,.9)');
    const sl = project(bx, by + bw, 0), sr = project(bx + len, by + bw, 0);
    const sbl = project(bx, by + bw + 8, 0), sbr = project(bx + len, by + bw + 8, 0);
    fillTrap(sl, sr, sbr, sbl, 'rgba(40,45,55,.95)');
    for (let i = 0; i < 4; i++) {
        const px = bx + 18 + i * 28, py = by + bw + 4;
        const pos = project(px, py), dr = 6 * pos.dscale;
        const teamColor = isLeft ? '#3a86ff' : '#e63946';
        ctx.fillStyle = teamColor;
        ctx.beginPath(); ctx.ellipse(pos.sx, pos.sy - dr * 0.5, dr * 0.8, dr * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f0c0a0';
        ctx.beginPath(); ctx.arc(pos.sx, pos.sy - dr * 1.1, dr * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    // 教练
    const cox = isLeft ? bx + len - 8 : bx + 8, cpos = project(cox, by + bw + 4);
    const cdr = 7 * cpos.dscale;
    ctx.fillStyle = isLeft ? '#1a4a99' : '#a01818';
    ctx.beginPath(); ctx.ellipse(cpos.sx, cpos.sy - cdr * 0.6, cdr * 0.7, cdr * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0c0a0';
    ctx.beginPath(); ctx.arc(cpos.sx, cpos.sy - cdr * 1.4, cdr * 0.42, 0, Math.PI * 2); ctx.fill();
}
