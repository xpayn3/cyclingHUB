/**
 * Build script — minifies JS + CSS for production.
 * Zero dependencies — uses esbuild via npx.
 *
 * Usage:
 *   node build.js          Build minified files into dist/
 *   node build.js clean     Remove dist/ directory
 *
 * Output:
 *   dist/index.html         (copied, script paths updated)
 *   dist/app.min.js         (minified app.js)
 *   dist/styles.min.css     (minified styles.css)
 *   dist/js/*.min.js        (minified modules)
 *   dist/sw.js              (minified service worker)
 *   dist/manifest.json      (copied)
 *   dist/icon-*.png         (copied)
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC  = __dirname;
const DIST = path.join(SRC, 'docs');

// ── Clean ──
if (process.argv[2] === 'clean') {
  fs.rmSync(DIST, { recursive: true, force: true });
  console.log('Cleaned dist/');
  process.exit(0);
}

// ── Setup dist/ ──
try { fs.rmSync(DIST, { recursive: true, force: true }); } catch (_) { /* EPERM on Windows — reuse existing dir */ }
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, 'js'), { recursive: true });

console.log('Building CycleIQ for production...\n');

// ── Minify JS files ──
const jsFiles = [
  { src: 'app.js',          out: 'app.min.js' },
  { src: 'sw.js',           out: 'sw.js' },
  { src: 'js/state.js',     out: 'js/state.min.js' },
  { src: 'js/weather.js',   out: 'js/weather.min.js' },
  { src: 'js/share.js',     out: 'js/share.min.js' },
  { src: 'js/routes.js',    out: 'js/routes.min.js' },
  { src: 'js/heatmap.js',   out: 'js/heatmap.min.js' },
  { src: 'js/workout.js',   out: 'js/workout.min.js' },
  { src: 'js/strava.js',       out: 'js/strava.min.js' },
  { src: 'js/import.js',       out: 'js/import.min.js' },
  { src: 'js/badges3d.js',     out: 'js/badges3d.min.js' },
  { src: 'js/pro-analysis.js', out: 'js/pro-analysis.min.js' },
];

let totalSrcJS = 0, totalMinJS = 0;
jsFiles.forEach(({ src, out }) => {
  const srcPath = path.join(SRC, src);
  if (!fs.existsSync(srcPath)) return;
  const outPath = path.join(DIST, out);
  try {
    execSync(`npx --yes esbuild "${srcPath}" --minify --outfile="${outPath}"`, { stdio: 'pipe' });
    const srcSize = fs.statSync(srcPath).size;
    const outSize = fs.statSync(outPath).size;
    totalSrcJS += srcSize;
    totalMinJS += outSize;
    const pct = ((1 - outSize / srcSize) * 100).toFixed(0);
    console.log(`  JS  ${src.padEnd(20)} ${fmtKB(srcSize)} -> ${fmtKB(outSize)}  (${pct}% smaller)`);
  } catch (e) {
    console.error(`  FAIL ${src}: ${e.message}`);
  }
});

// ── Minify CSS ──
let totalSrcCSS = 0, totalMinCSS = 0;
const cssSrc = path.join(SRC, 'styles.css');
const cssOut = path.join(DIST, 'styles.min.css');
try {
  execSync(`npx --yes esbuild "${cssSrc}" --minify --outfile="${cssOut}"`, { stdio: 'pipe' });
  const srcSize = fs.statSync(cssSrc).size;
  const outSize = fs.statSync(cssOut).size;
  totalSrcCSS = srcSize;
  totalMinCSS = outSize;
  const pct = ((1 - outSize / srcSize) * 100).toFixed(0);
  console.log(`  CSS styles.css${' '.repeat(12)} ${fmtKB(srcSize)} -> ${fmtKB(outSize)}  (${pct}% smaller)`);
} catch (e) {
  console.error(`  FAIL styles.css: ${e.message}`);
}

// ── Copy static assets ──
const copyFiles = ['manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'proxy.js'];
copyFiles.forEach(f => {
  const src = path.join(SRC, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST, f));
    console.log(`  COPY ${f}`);
  }
});

// ── Process index.html — update references to minified files ──
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html.replace(/href="styles\.css(\?[^"]*)?"/g, 'href="styles.min.css"');
html = html.replace(/src="app\.js(\?[^"]*)?"/g, 'src="app.min.js"');
// Update modulepreload and other references to js/*.js → js/*.min.js
html = html.replace(/href="js\/(\w+)\.js(\?[^"]*)?"/g, 'href="js/$1.min.js"');
// Update ES module imports inside HTML
html = html.replace(/"\.\/js\/(\w+)\.js"/g, '"./js/$1.min.js"');
fs.writeFileSync(path.join(DIST, 'index.html'), html);
console.log('  HTML index.html (references updated)');

// Patch import paths in all minified JS files (app.min.js + js/*.min.js)
const jsFilesToPatch = [path.join(DIST, 'app.min.js'), ...fs.readdirSync(path.join(DIST, 'js')).filter(f => f.endsWith('.min.js')).map(f => path.join(DIST, 'js', f))];
jsFilesToPatch.forEach(fp => {
  let code = fs.readFileSync(fp, 'utf8');
  const updated = code.replace(/(from|import)\s*["']\.\/(\w+)\.js["']/g, '$1"./$2.min.js"')
                      .replace(/(from|import)\s*["']\.\/js\/(\w+)\.js["']/g, '$1"./js/$2.min.js"')
                      .replace(/import\(["']\.\/js\/(\w+)\.js["']\)/g, 'import("./js/$1.min.js")')
                      .replace(/import\(["']\.\/(\w+)\.js["']\)/g, 'import("./$1.min.js")');
  if (updated !== code) fs.writeFileSync(fp, updated);
});

// Patch sw.js to reference minified files in precache list
let swMin = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
swMin = swMin.replace(/['"](\.?\/?)(styles)\.css['"]/g, '"$1$2.min.css"');
swMin = swMin.replace(/['"](\.?\/?)(app)\.js['"]/g, '"$1$2.min.js"');
swMin = swMin.replace(/['"](\.?\/?js\/)(\w+)\.js['"]/g, '"$1$2.min.js"');
fs.writeFileSync(path.join(DIST, 'sw.js'), swMin);

// ── Summary ──
const totalSrc = totalSrcJS + totalSrcCSS;
const totalMin = totalMinJS + totalMinCSS;
const pct = ((1 - totalMin / totalSrc) * 100).toFixed(0);
console.log(`\n  Total:  ${fmtKB(totalSrc)} -> ${fmtKB(totalMin)}  (${pct}% smaller)`);
console.log(`\n  Output: ${DIST}/`);
console.log('  Run:    cd dist && node proxy.js\n');

function fmtKB(bytes) {
  return (bytes / 1024).toFixed(0).padStart(5) + ' KB';
}
