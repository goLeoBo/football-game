#!/usr/bin/env node
/**
 * 构建脚本：将 src/ 下的 HTML、CSS、JS 模块合并为单个可部署文件 dist/index.html
 *
 * 用法：
 *   node build.js          → 构建 dist/index.html
 *   npm run build          → 同上
 *   npm run dev            → 构建并提示完成
 *   npm run start          → 构建并用 serve 启动本地预览
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// TS 模块加载顺序（顺序很重要，因为模块间有依赖）
const TS_MODULES = [
  'js/00-constants.ts',
  'js/01-camera.ts',
  'js/02-audio.ts',
  'js/03-input.ts',
  'js/04-data.ts',
  'js/05-entity.ts',
  'js/06-replay.ts',
  'js/07-foul.ts',
  'js/08-setpiece.ts',
  'js/09-lobpass.ts',
  'js/10-ai.ts',
  'js/11-physics.ts',
  'js/12-penalty.ts',
  'js/13-worldcup.ts',
  'js/renderer/stadium.ts',
  'js/renderer/field.ts',
  'js/renderer/player.ts',
  'js/renderer/ball.ts',
  'js/renderer/ui.ts',
  'js/14-game.ts',
  'js/15-main.ts',
];

// 读取模块，确保每个模块独立成段
function readModules() {
  const parts = [];
  for (const rel of TS_MODULES) {
    const full = path.join(SRC, rel);
    if (!fs.existsSync(full)) {
      console.warn(`⚠  跳过缺失模块: ${rel}`);
      continue;
    }
    const code = fs.readFileSync(full, 'utf-8');
    // 每个模块首尾各空一行，方便阅读编译产物
    parts.push(code.trim());
  }
  return parts.join('\n\n');
}

// 读取 HTML 模板
function readTemplate() {
  const tpl = fs.readFileSync(path.join(SRC, 'index.html'), 'utf-8');
  return tpl;
}

// 读取 CSS
function readCSS() {
  return fs.readFileSync(path.join(SRC, 'css', 'main.css'), 'utf-8');
}

// 组装最终 HTML
function build() {
  if (!fs.existsSync(DIST)) {
    fs.mkdirSync(DIST, { recursive: true });
  }

  const template = readTemplate();
  const css = readCSS();
  const js = readModules();

  // 替换模板中的占位符
  const result = template
    .replace('<!-- INLINE_CSS -->', `<style>\n${css}\n</style>`)
    .replace('/* INLINE_JS */', `\n${js}\n`);

  const outPath = path.join(DIST, 'index.html');
  fs.writeFileSync(outPath, result, 'utf-8');

  const sizeKB = (Buffer.byteLength(result, 'utf-8') / 1024).toFixed(1);
  console.log(`✅ 构建完成 → ${outPath} (${sizeKB} KB)`);
  console.log('   用浏览器打开 dist/index.html 即可游玩');
}

build();
