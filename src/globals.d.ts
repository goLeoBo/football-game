/**
 * 为浏览器游戏的 DOM 相关 API 放宽类型检查
 * 避免原有 JS 代码在 strict null checks 下的数百个 TS 错误
 */

// EventTarget 支持 closest
interface EventTarget {
    closest(selector: string): HTMLElement | null;
}

// Window 扩展
interface Window {
    webkitAudioContext?: typeof AudioContext;
}

// CanvasRenderingContext2D 扩展
interface CanvasRenderingContext2D {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
}
