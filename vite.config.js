import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 源码入口在 src/index.html，因此以 src 为 root。
// 构建产物输出到项目根的 dist/。
//
// 使用 viteSingleFile：把 JS/CSS 全部内联进单个 index.html，
// 使其可通过 file:// 双击直接打开（离线单文件部署）。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // base64 视频体积较大，默认 500KB 内联阈值会触发告警，这里放大阈值
    // 让 Vite 直接内联资源，产物仍是单文件可部署（与原 football.html 一致）。
    assetsInlineLimit: 4096 * 1024,
  },
});
