#!/usr/bin/env node
/**
 * 构建脚本：将 src/ 下的 HTML、CSS、TS 模块合并为可部署文件 dist/index.html
 *
 * TS 类型标注已在源码中预先剥离（由 /tmp/strip-ts.mjs 处理），
 * build.js 只需 concat，不做任何文本转换。
 *
 * 用法：
 *   node build.js          → 构建 dist/index.html
 *   npm run build          → 同上
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const MODULES = [
  'js/00-constants.ts', 'js/01-camera.ts', 'js/02-audio.ts',
  'js/03-input.ts', 'js/04-data.ts', 'js/05-entity.ts',
  'js/06-replay.ts', 'js/07-foul.ts', 'js/08-setpiece.ts',
  'js/09-lobpass.ts', 'js/10-ai.ts', 'js/11-physics.ts',
  'js/12-penalty.ts', 'js/13-worldcup.ts',
  'js/renderer/stadium.ts', 'js/renderer/field.ts',
  'js/renderer/player.ts', 'js/renderer/ball.ts',
  'js/renderer/ui.ts', 'js/14-game.ts', 'js/15-main.ts',
];

function readModules() {
  const parts = [];
  for (const rel of MODULES) {
    const full = path.join(SRC, rel);
    if (!fs.existsSync(full)) {
      console.warn(`⚠  跳过缺失: ${rel}`);
      continue;
    }
    parts.push(fs.readFileSync(full, 'utf-8').trim());
  }
  return parts.join('\n\n');
}

function build() {
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

  const template = fs.readFileSync(path.join(SRC, 'index.html'), 'utf-8');
  const css = fs.readFileSync(path.join(SRC, 'css', 'main.css'), 'utf-8');
  const js = readModules();

  const result = template
    .replace('<!-- INLINE_CSS -->', `<style>\n${css}\n</style>`)
    .replace('/* INLINE_JS */', `\n${js}\n`);

  const outPath = path.join(DIST, 'index.html');
  fs.writeFileSync(outPath, result, 'utf-8');

  const sizeKB = (Buffer.byteLength(result, 'utf-8') / 1024).toFixed(1);
  console.log(`✅ 构建完成 → ${outPath} (${sizeKB} KB)`);
}

build();
