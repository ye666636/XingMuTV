// 星幕剧场 TV 版：键盘/鼠标焦点协调。
// 遥控器与键盘操作时，鼠标悬停不应抢走焦点（TV 盒子外接鼠标、PC 上测试都会遇到）。
const HOVER_LOCK_MS = 800;
let lockedUntil = 0;

export function markKeyboard() {
  lockedUntil = Date.now() + HOVER_LOCK_MS;
}

export function hoverAllowed() {
  return Date.now() >= lockedUntil;
}

/** 在 window 上监听键盘，标记键盘操作时间戳。 */
export function installKeyboardMarker() {
  const handler = () => markKeyboard();
  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
}
