// 打包 APK 资源：把 Vite 的现代产物转换成「老电视 WebView 也能跑」的形态。
//
// 背景：小米电视 4C 一类 Android 5/6 设备，系统 WebView 停留在 Chromium 47~55。
// 它们不支持 <script type="module">、?. / ??、Object.entries、matchAll、CSS Grid、
// inset、aspect-ratio。直接把 Vite 产物塞进去就是一片白屏。
// 这里做四件事：ES module -> 单个 IIFE、语法降到 chrome49、注入 ES5 polyfill、
// 把 CSS 变量/inset/aspect-ratio 静态展开并给 Grid 加 flex 兜底。
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const presetEnv = require('@babel/preset-env');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist-react');
const assets = path.join(root, 'android', 'app', 'src', 'main', 'assets');
// 实测小米电视 4C 同代（Android 6.0 / AOSP WebView）是 Chromium 44.0.2403.119：
// 箭头函数、let/const、解构、async 全都不认。esbuild 只能降到 ES2015（它拒绝
// const -> var），所以两段式：esbuild 打 IIFE 并降级 async / ?. / ??，
// 再由 Babel preset-env 把剩下的 ES6+ 语法整体转成 ES5。
const TARGET = ['es2015'];

function toEs5(file) {
  const out = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    presets: [[presetEnv, { targets: { chrome: '44' }, modules: false }]],
    sourceType: 'script', compact: true, comments: false,
    configFile: false, babelrc: false, sourceMaps: false,
  });
  if (!out || !out.code) throw new Error('Babel 转译失败: ' + file);
  let code = out.code;
  // Babel 不会转换动态 import()，而 Chrome 44 连这个语法都无法解析。
  // 桌面版 avplayer 的懒加载在 TV 端用不到，换成 polyfills.js 提供的安全兜底。
  code = code.replace(/\bimport\s*\(/g, '__xmNoopImport(');
  // Babel 的 _createForOfIteratorHelper 只在 allowArrayLike 为真时才接受
  // NodeList/HTMLCollection 这类有 length 的对象，否则直接抛错。老内核里这些
  // 集合没有 Symbol.iterator，于是 React 挂载阶段就炸了。放宽条件：有 length
  // 就按数组遍历（原本会抛错的场景，现在只是正常工作）。
  code = code.replace(
    /\|\|([A-Za-z_$][\w$]*)&&([A-Za-z_$][\w$]*)&&"number"==typeof \2\.length/g,
    '||$2&&"number"==typeof $2.length'
  );
  fs.writeFileSync(file, code, 'utf8');
}

console.log('[1/6] 构建前端');
execSync('npx vite build', { cwd: root, stdio: 'inherit' });

console.log('[2/6] 清空 assets');
fs.rmSync(assets, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });

console.log('[3/6] 复制静态资源');
function copyTree(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) copyTree(path.join(from, entry), path.join(to, entry));
  } else {
    fs.copyFileSync(from, to);
  }
}
for (const entry of fs.readdirSync(dist)) {
  if (entry === 'index.html' || entry === 'software' || entry === 'assets') continue;
  copyTree(path.join(dist, entry), path.join(assets, entry));
}
const distAssets = path.join(dist, 'assets');
const outAssets = path.join(assets, 'assets');
fs.mkdirSync(outAssets, { recursive: true });
for (const entry of fs.readdirSync(distAssets)) {
  if (/\.(js|css)$/.test(entry)) continue; // JS/CSS 用下面生成的兼容版
  copyTree(path.join(distAssets, entry), path.join(outAssets, entry));
}

const jsFiles = fs.readdirSync(distAssets).filter(f => /^index-.*\.js$/.test(f));
// Chromium 44 连 BigInt 字面量的语法都不认（0n 会在解析期让整个脚本失败）。
// 这处来自 WebView 播放器 seek()，TV 端播放走原生 PlayerActivity，不会执行；
// 但字面量必须消掉，否则脚本一行都跑不起来。
for (const f of jsFiles) {
  const p = path.join(distAssets, f);
  const src = fs.readFileSync(p, 'utf8');
  const fixed = src.replace(/seek\(0n\)/g, 'seek(0)').replace(/\b0n\b/g, '0');
  if (fixed !== src) {
    fs.writeFileSync(p, fixed, 'utf8');
    console.log('  已消除 BigInt 字面量:', f);
  }
}
const entry = jsFiles.find(f => fs.readFileSync(path.join(distAssets, f), 'utf8').startsWith('import'));
const cssFile = fs.readdirSync(distAssets).find(f => /^index-.*\.css$/.test(f));
if (!entry || !cssFile) throw new Error('Vite 产物结构异常：找不到入口 JS 或 CSS');

console.log('[4/6] 打包普通脚本（IIFE + Babel 转 ES5）');
await build({
  entryPoints: [path.join(distAssets, entry)],
  outfile: path.join(assets, 'app.js'),
  bundle: true, format: 'iife', platform: 'browser', target: TARGET,
  minify: true, legalComments: 'none', logLevel: 'silent',
});
await build({
  entryPoints: [path.join(root, 'src', 'android', 'bridge.js')],
  outfile: path.join(assets, 'bridge.js'),
  bundle: true, format: 'iife', platform: 'browser', target: TARGET,
  minify: true, legalComments: 'none', logLevel: 'silent',
});
// esbuild 只降到 ES2015，剩下 const/let/箭头/解构/展开交给 Babel 转 ES5。
toEs5(path.join(assets, 'app.js'));
toEs5(path.join(assets, 'bridge.js'));
fs.copyFileSync(path.join(root, 'src', 'android', 'polyfills.js'), path.join(assets, 'polyfills.js'));
console.log('  app.js / bridge.js 已转 ES5');

console.log('[5/6] CSS 静态降级');
let css = fs.readFileSync(path.join(distAssets, cssFile), 'utf8');

// 5.1 CSS 变量：老内核不认 var()，把 :root 里定义的常量直接展开。
// 全文件收集（压缩后 :root 最后一条声明不带分号，且部分变量定义在其它选择器里）。
const vars = {};
for (const d of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+?)\s*[;}]/g)) {
  if (!vars[d[1]]) vars[d[1]] = d[2].trim();
}
css = css.replace(/var\(\s*(--[\w-]+)\s*(,[\s\S]*?)?\)/g,
  (all, name, fallback) => vars[name] || (fallback ? fallback.slice(1).trim() : all));

// 5.2 inset 简写：Chrome 87+ 才有。不展开的话 .tv-app 尺寸为 0，整个界面不可见。
function expandInset(all, prefix, value) {
  const p = value.trim().split(/\s+/);
  const t = p[0], r = p.length > 1 ? p[1] : p[0];
  const b = p.length > 2 ? p[2] : p[0], l = p.length > 3 ? p[3] : r;
  return prefix + 'top:' + t + ';right:' + r + ';bottom:' + b + ';left:' + l + ';';
}
css = css.replace(/(^|[;{}]\s*)inset\s*:\s*([^;}]+);/g, expandInset);

// 5.3 aspect-ratio：Chrome 88+ 才有。改成等比 padding，所有浏览器行为一致。
css = css.replace(/aspect-ratio\s*:\s*3\s*\/\s*4\s*;/g, 'height: 0; padding-bottom: 133.3333%;');

css += `
/* ===== 老电视 WebView 兼容层：Chrome 47~56 没有 Grid、flex gap、CSS 变量 ===== */
.tv-poster-art, .tv-sheet-art { position: relative; }
.tv-poster-art img, .tv-sheet-art img {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;
}
@supports not (display: grid) {
  .tv-grid { display: flex !important; flex-wrap: wrap; align-content: flex-start; justify-content: flex-start; }
  .tv-grid > * { flex: 0 0 15.6%; width: 15.6%; max-width: 15.6%; margin: 0 1.28% 26px 0; box-sizing: border-box; }
  .tv-grid > *:nth-child(6n) { margin-right: 0; }
  .tv-episode-grid { display: flex !important; flex-wrap: wrap; align-content: flex-start; justify-content: flex-start; }
  .tv-episode-grid > * { flex: 0 0 7.4%; width: 7.4%; max-width: 7.4%; margin: 0 0.92% 8px 0; box-sizing: border-box; }
  .tv-rail > * + *, .tv-segments > * + *, .tv-sheet-top > * + * { margin-left: 8px; }
}
@media (max-width: 820px) {
  @supports not (display: grid) {
    .tv-grid > * { flex: 0 0 47%; width: 47%; max-width: 47%; margin: 0 3% 20px 0; }
    .tv-grid > *:nth-child(6n) { margin-right: 3%; }
    .tv-grid > *:nth-child(2n) { margin-right: 0; }
    .tv-episode-grid > * { flex: 0 0 15%; width: 15%; max-width: 15%; margin: 0 2% 8px 0; }
  }
}
`;
fs.writeFileSync(path.join(assets, 'app.css'), css, 'utf8');

console.log('[6/6] 生成入口 HTML');
// 普通 <script>（不是 type=module），顺序：polyfill -> 原生桥 -> 界面。
// 放在 body 末尾，保证 #root 已存在、viewport meta 已解析。
fs.writeFileSync(path.join(assets, 'index.html'), `<!DOCTYPE html>
<!-- 星幕剧场：安卓电视 APK 的 WebView 界面（老内核兼容构建） -->
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1600" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: https: http:; media-src 'self' blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https: http:;" />
    <title>星幕剧场</title>
    <link rel="stylesheet" href="app.css" />
    <script>
      /* 老电视 WebView 出问题时不要把原因藏在一片白屏里：把错误显示在屏幕上并写进 logcat。 */
      (function () {
        window.addEventListener('error', function (event) {
          var message = (event.message || '未知错误') + ' @' +
            String(event.filename || '').split('/').pop() + ':' + event.lineno + ':' + event.colno;
          if (event.error && event.error.stack) message += ' | ' + event.error.stack;
          if (window.console && console.error) console.error('XMERROR ' + message);
          try {
            var box = document.getElementById('xm-fatal');
            if (!box) {
              box = document.createElement('pre');
              box.id = 'xm-fatal';
              box.style.cssText = 'position:fixed;z-index:99999;left:32px;right:32px;top:32px;' +
                'padding:24px;background:#1c1c1e;color:#ff8a80;border-radius:12px;' +
                'font:16px/1.7 monospace;white-space:pre-wrap;word-break:break-all;';
              document.body.appendChild(box);
            }
            box.textContent = '星幕剧场界面加载失败\\n' + message;
          } catch (ignored) {}
        });
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script src="polyfills.js"></script>
    <script src="bridge.js"></script>
    <script src="app.js"></script>
  </body>
</html>
`, 'utf8');

console.log('完成：', assets);
console.log('  产物：index.html / app.js / app.css / bridge.js / polyfills.js');
