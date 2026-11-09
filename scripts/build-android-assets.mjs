// 打包 APK 资源：vite 产物 + Android 桥接脚本 -> android/app/src/main/assets
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist-react');
const assets = path.join(root, 'android', 'app', 'src', 'main', 'assets');

console.log('[1/4] 构建前端');
execSync('npx vite build', { cwd: root, stdio: 'inherit' });

console.log('[2/4] 清空 assets');
fs.rmSync(assets, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });

console.log('[3/4] 复制前端产物');
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
  if (entry === 'software') continue; // 桌面版 FFmpeg 只在 Windows 用，安卓不需要（省 16MB）
  copyTree(path.join(dist, entry), path.join(assets, entry));
}

console.log('[4/4] 打包桥接脚本');
await build({
  entryPoints: [path.join(root, 'src', 'android', 'bridge.js')],
  outfile: path.join(assets, 'bridge.js'),
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
});

// bridge.js 必须是普通脚本，并且先于应用 bundle 执行（React 一挂载就会读 electronAPI）。
const indexPath = path.join(assets, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('bridge.js')) {
  html = html.replace('<head>', '<head>\n    <script src="bridge.js"></script>');
}
// 安卓版封面图、图片资源直连官网 https；桌面版原本只放行自定义协议。
html = html.replace(/connect-src 'self'[^"]*/, "connect-src 'self' https: http: hongguo-stream: hongguo-local:");
// 电视是 1080p/4K 大屏，按手机式的 device-width 渲染会让界面被放大得一塌糊涂，
// 这里固定 1600 CSS 宽度，由 WebView 等比缩放到整屏。
html = html.replace(/<meta\s+name="viewport"[^>]*>/, '<meta name="viewport" content="width=1600" />');
fs.writeFileSync(indexPath, html, 'utf8');
console.log('完成：', assets);
