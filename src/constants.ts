// ====== 场地与渲染常量 ======
export const FW = 1389, FH = 900;
export const SX = FW / 900, SY = FH / 560;
export const GOAL_H = 215;
export const GOAL_D = 24;
export const WALL = 12;
export const GRAVITY = 28;
export const BALL_BOUNCE = 0.55;
export const CAM_TILT = 0.82;
export const CAM_OFFSET_Y = 10;
export const PERSP = 0.00038;

export let scale = 1;
export let canvasOffsetX = 0, canvasOffsetY = 0;
export let camPanX = 0;

export function setScale(s: number) { scale = s; }
export function setCanvasOffset(cx: number, cy: number) { canvasOffsetX = cx; canvasOffsetY = cy; }
export function setCamPanX(x: number) { camPanX = x; }
export function getCamPanX() { return camPanX; }
