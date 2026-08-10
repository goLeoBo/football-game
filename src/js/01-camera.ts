// =================================================================
// 01-camera.js — 电视转播视角投影 & 镜头跟随
// 绿茵对决 · 足球游戏
//
// 模拟摄像机从球场一侧高处斜视，带透视压缩效果。
// project() 把世界坐标 → 屏幕坐标，返回深度缩放比 dscale。
// =================================================================

const CAM_TILT = 0.48;       // y 压缩比（越低越侧视，转播视角 0.45~0.55）
const CAM_OFFSET_Y = 90;     // 顶部留白
const PERSP = 0.00038;       // 透视强度：远端 x 向中心压缩
let camPanX = 0;             // 镜头水平偏移，跟随球
let canvasOffsetX = 0, canvasOffsetY = 0;

// 屏幕偏移量（供渲染器读取）
let screenOX = 0, screenOY = 0;

/**
 * 世界坐标 → 屏幕坐标
 * @param {number} x - 世界 x (0 ~ FW)
 * @param {number} y - 世界 y (0 ~ FH)
 * @param {number} z - 高度（用于 z 轴偏移）
 * @returns {{ sx: number, sy: number, depth: number, dscale: number }}
 *   dscale 表示深度缩放比（远端 ≈0.82，近端 ≈1.0），渲染时乘以此值得到透视正确的大小
 */
function project(x, y, z = 0) {
    const dscale = 1 - (FH * 0.5 - y) * PERSP;
    const cx = FW / 2 + camPanX;
    const sx = cx + (x - cx) * dscale;
    const sy = y * CAM_TILT + CAM_OFFSET_Y - z * (1 - CAM_TILT) * 0.8;
    return { sx, sy, depth: y, dscale };
}

// 窗口 resize：自适应窗口，优先适配宽度
function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    const visH = FH * CAM_TILT + CAM_OFFSET_Y + 30;
    scale = Math.min(W / FW, H / visH);
    canvasOffsetX = (W - FW * scale) / 2;
    canvasOffsetY = (H - visH * scale) / 2;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * canvasOffsetX, dpr * canvasOffsetY);
    screenOX = canvasOffsetX;
    screenOY = canvasOffsetY;
}

window.addEventListener('resize', resize);
resize();

// 镜头平滑跟随球
function updateCamera(dt) {
    const target = clamp((ball.x - FW / 2) * 0.25, -FW * 0.12, FW * 0.12);
    camPanX += (target - camPanX) * Math.min(1, dt * 2.5);
}
