import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/** Bundle TS → JS only (no HTML wrapping) */
async function bundleJS() {
  const result = await esbuild.build({
    entryPoints: [resolve(__dirname, 'src/main.ts')],
    bundle: true,
    minify: false,
    target: 'es2020',
    format: 'iife',
    write: false,
    sourcemap: false,
    outfile: 'dist/bundle.js',
  });
  return result.outputFiles![0].text;
}

/** Wrap bundled JS into the HTML template */
function wrapHTML(bundledJS: string) {
  const htmlTemplate = readFileSync(resolve(__dirname, 'football.html'), 'utf-8');
  const startMarker = /<script>[\s\S]*<\/script>/;
  const outputHTML = htmlTemplate.replace(startMarker, `<script>\n${bundledJS}\n</script>`);
  if (!existsSync('dist')) mkdirSync('dist');
  writeFileSync(resolve(__dirname, 'dist/football.html'), outputHTML);
  console.log(`✅ Built dist/football.html (${(outputHTML.length / 1024).toFixed(0)}KB)`);
}

/** Full build: bundle + wrap */
async function build() {
  const js = await bundleJS();
  wrapHTML(js);
}

async function main() {
  if (watch) {
    const ctx = await esbuild.context({
      entryPoints: [resolve(__dirname, 'src/main.ts')],
      bundle: true,
      minify: false,
      target: 'es2020',
      format: 'iife',
      sourcemap: false,
      write: true,
      outfile: 'dist/bundle.js',
      plugins: [{
        name: 'wrap-html',
        setup(b) {
          b.onEnd(async () => {
            const js = readFileSync(resolve(__dirname, 'dist/bundle.js'), 'utf-8');
            if (js.trim()) wrapHTML(js);
          });
        },
      }],
    });
    await ctx.watch();
    console.log('👀 Watching for changes...');
  } else {
    await build();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
