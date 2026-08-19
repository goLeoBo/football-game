import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 源码入口在 src/index.html，因此以 src 为 root。
// 构建产物输出到项目根的 dist/。
//
// 使用 viteSingleFile：把 JS/CSS 全部内联进单个 index.html。
// 视频（739KB）作为独立文件输出，浏览器流式加载 + 走 HTTP 缓存，
// 手机端无需一次性下载并解码整个 base64 视频，首屏更快。
//
// 注意：插件默认 useRecommendedBuildConfig 会把 assetsInlineLimit 强设为 () => true，
// 导致视频也被内联。这里关闭它，手动配置以达到“JS/CSS 单文件 + 视频外置”的效果。
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({ useRecommendedBuildConfig: false }),
  ],
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // 仅内联 ≤4KB 的小资源；739KB 的视频超出阈值 → 作为独立文件输出。
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    assetsDir: '', // 资源直接放 dist 根目录，便于相对路径引用
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
