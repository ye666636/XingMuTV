// 生成安卓用 PNG 图标与电视横幅（不引第三方库，直接写最小 PNG）。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');

const BG = [11, 11, 13];
const FG = [245, 245, 247];

function starPolygon(cx, cy, outer, inner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return pts;
}

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(width, height, draw) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = draw(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }
  return encodePng(width, height, raw);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcTable = chunk.crcTable || (chunk.crcTable = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return table;
  })());
  let crc = -1;
  for (const byte of Buffer.concat([typeBuf, data])) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE((crc ^ -1) >>> 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

function drawIcon(size) {
  const cx = size / 2;
  const cy = size * 0.47;
  const star = starPolygon(cx, cy, size * 0.30, size * 0.125);
  const barY = size * 0.80;
  return (x, y) => {
    const inStar = inPolygon(x, y, star);
    const inBar = y >= barY && y <= barY + size * 0.035 && Math.abs(x - cx) <= size * 0.22;
    return inStar || inBar ? [...FG, 255] : [...BG, 255];
  };
}

function drawBanner(width, height) {
  const cx = width * 0.5;
  const cy = height * 0.44;
  const star = starPolygon(cx, cy, height * 0.30, height * 0.125);
  const barY = height * 0.76;
  return (x, y) => {
    const inStar = inPolygon(x, y, star);
    const inBar = y >= barY && y <= barY + height * 0.03 && Math.abs(x - cx) <= width * 0.16;
    return inStar || inBar ? [...FG, 255] : [...BG, 255];
  };
}

const icons = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];
for (const [folder, size] of icons) {
  const dir = path.join(res, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), render(size, size, drawIcon(size)));
}

const bannerDir = path.join(res, 'drawable-xhdpi');
fs.mkdirSync(bannerDir, { recursive: true });
fs.writeFileSync(path.join(bannerDir, 'tv_banner.png'), render(320, 180, drawBanner(320, 180)));
console.log('图标与横幅已生成');
