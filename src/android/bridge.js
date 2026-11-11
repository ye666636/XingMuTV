/**
 * 星幕剧场 Android TV 版：WebView 侧的 electronAPI 适配层。
 *
 * TV 界面代码只认 window.electronAPI；这里用原生 XM 桥（Java）补齐
 * 目录、搜索、详情、播放、观看记录、版本更新等能力。
 * 所有网络请求都走原生 OkHttp，绕开 WebView 的 CORS 限制。
 */
import {
  SITE, WEB_UA, WEB_REFERER,
  parseCatalog, parseRanking, parseEpisodeList, parseSearchResponse, extractPlayUrl,
} from './parsers.js';

// 电视与手机共用同一个 APK：电视固定 1600 CSS 宽度（大屏不放大），手机按 device-width 正常排版。
function applyViewport() {
  try {
    const tv = typeof window.XM.isTv === 'function' ? window.XM.isTv() : true;
    const value = tv ? 'width=1600' : 'width=device-width, initial-scale=1';
    const metas = document.querySelectorAll('meta[name="viewport"]');
    if (!metas.length) {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      meta.setAttribute('content', value);
      (document.head || document.documentElement).appendChild(meta);
    } else {
      metas.forEach(meta => meta.setAttribute('content', value));
    }
  } catch (_) { /* 老 WebView 退回 index.html 里的默认值 */ }
}
applyViewport();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyViewport);

const CATEGORIES = [
  { slug: 'real-drama', label: '真人剧' },
  { slug: 'comic-drama', label: '漫剧' },
  { slug: 'ai-drama', label: 'AI剧' },
  { slug: 'hot-drama', label: '综合热播榜', group: 'rank' },
  { slug: 'hot-real-drama', label: '真人热播榜', group: 'rank' },
  { slug: 'hot-comic-drama', label: '漫剧热播榜', group: 'rank' },
  { slug: 'hot-ai-drama', label: 'AI 热播榜', group: 'rank' },
];
const RANKINGS = new Set(['hot-drama', 'hot-real-drama', 'hot-comic-drama', 'hot-ai-drama']);
const HISTORY_KEY = 'xingmu:watch-history';
const REQUEST_TIMEOUT = 20000;

let seq = 0;
const pending = new Map();

window.__xmHttp = (id, status, body) => {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  if (status >= 200 && status < 400) {
    entry.resolve(body);
    return;
  }
  // Java 层把真实异常写成 {"error": "..."}，以前被丢掉，界面只显示「请求失败（HTTP 0）」，
  // 用户根本不知道是 DNS、TLS 还是设备时间的问题。这里透传并翻译成中文提示。
  let message = `请求失败（HTTP ${status}）`;
  try {
    const parsed = JSON.parse(body);
    if (parsed && parsed.error) message = String(parsed.error);
  } catch (_) { /* 非 JSON 错误体保留默认文案 */ }
  entry.reject(new Error(message));
};

// 设置页「网络诊断」的回显卡片：结果直接画在电视上，方便拍照反馈。
window.__xmDiagnose = (_id, payload) => {
  let lines;
  try { lines = JSON.parse(payload); } catch (_) { lines = [String(payload)]; }
  if (!Array.isArray(lines)) lines = [String(lines)];
  let box = document.getElementById('xm-diagnose');
  if (!box) {
    box = document.createElement('div');
    box.id = 'xm-diagnose';
    // 老内核不认 inset，必须写全四个方向，否则卡片会变成 0 尺寸（DOM 里有、屏幕上看不见）。
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;background:rgba(0,0,0,.92);' +
      'display:flex;align-items:center;justify-content:center;padding:40px;box-sizing:border-box;';
    const card = document.createElement('div');
    card.style.cssText = 'max-width:1400px;width:100%;background:#1c1c1e;border:1px solid #3a3a3c;' +
      'border-radius:16px;padding:32px;color:#f5f5f7;font:22px/1.8 -apple-system,"PingFang SC",sans-serif;' +
      'word-break:break-all;';
    box.appendChild(card);
    box.addEventListener('click', () => { if (box.parentNode) box.parentNode.removeChild(box); });
    document.body.appendChild(box);
  }
  const card = box.firstChild;
  while (card.firstChild) card.removeChild(card.firstChild);
  lines.forEach((line, i) => {
    const row = document.createElement('div');
    row.textContent = String(line);
    row.style.cssText = i === 0
      ? 'font-size:30px;font-weight:600;margin-bottom:20px;color:#7ddb95;'
      : 'padding:5px 0;border-bottom:1px solid #2c2c2e;';
    card.appendChild(row);
  });
  const hint = document.createElement('div');
  hint.textContent = '点击任意处 / 按返回键关闭';
  hint.style.cssText = 'margin-top:22px;font-size:18px;color:#8e8e93;';
  card.appendChild(hint);
};

function httpGet(url, extra = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    try {
      // 10 秒兜底：原生请求异常时不让界面一直转圈。
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error('网络请求超时，请重试'));
      }, REQUEST_TIMEOUT + 5000);
      window.XM.http(url, JSON.stringify({ 'User-Agent': WEB_UA, Referer: WEB_REFERER, ...extra }), id);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

/* ===== 版本更新 =====
   AppUpdateNotice 组件只认 electronAPI 的这一组接口，这里用 GitHub Releases API + 原生下载补齐。
   GitHub 不会推送，组件本身每 5 分钟轮询一次。 */
const RELEASE_API = 'https://api.github.com/repos/ye666636/XingMuTV/releases/latest';
const RELEASE_PAGE = 'https://github.com/ye666636/XingMuTV/releases/latest';

let latestRelease = null;
let downloadedApk = '';
let updateState = { supported: true, reason: '', status: 'idle', percent: 0, version: null, error: '' };
const updateListeners = new Set();

function emitUpdate(patch) {
  updateState = { ...updateState, ...patch };
  for (const listener of updateListeners) { try { listener(updateState); } catch (_) { /* 忽略单个监听异常 */ } }
}

// 原生下载 APK 的进度与结果回调（XmBridge.downloadApk 调用）
window.__xmDownloadProgress = (percent, status, path, message) => {
  if (status === 'progress') emitUpdate({ status: 'downloading', percent, error: '' });
  else if (status === 'done') { downloadedApk = path || ''; emitUpdate({ status: 'downloaded', percent: 100, error: '' }); }
  else emitUpdate({ status: 'error', percent: 0, error: message || '下载失败，请重试' });
};

function versionParts(value) {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(value || ''));
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
}

function newerVersion(next, current) {
  const a = versionParts(next), b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

async function fetchLatestRelease() {
  let data = null;
  try {
    const body = await httpGet(RELEASE_API, {
      'User-Agent': 'XingMuTV-Android-Update-Check',
      Accept: 'application/vnd.github+json',
      Referer: RELEASE_PAGE,
    });
    data = JSON.parse(body);
  } catch (_) {
    // 有些网络/代理会拦 api.github.com（403/504）；GitHub 的 /releases/latest
    // 会 302 到具体 tag 页面，Java 侧跟随重定向后返回 HTML，从这里解析版本号。
    const html = await httpGet(RELEASE_PAGE, {
      'User-Agent': 'XingMuTV-Android-Update-Check',
      Accept: 'text/html',
    });
    const tagMatch = /\/ye666636\/XingMuTV\/releases\/tag\/(v?\d+\.\d+(?:\.\d+)?)/i.exec(html);
    if (!tagMatch) throw new Error('暂时无法检查更新，请检查网络后重试。');
    const rawTag = tagMatch[1];
    const version = rawTag.replace(/^v/, '');
    data = {
      tag_name: rawTag, draft: false, prerelease: false,
      assets: [{ name: 'XingMuTV-tv-' + version + '.apk',
        browser_download_url: `https://github.com/ye666636/XingMuTV/releases/download/${rawTag}/XingMuTV-tv-${version}.apk` }],
    };
  }
  if (!data || data.draft || data.prerelease) return null;
  const tag = String(data.tag_name || '').replace(/^v/, '');
  const apk = (Array.isArray(data.assets) ? data.assets : []).find(item => /\.apk$/i.test(item?.name || ''));
  if (!newerVersion(tag, window.XM.version()) || !apk?.browser_download_url) return null;
  return { version: tag, url: apk.browser_download_url, notes: String(data.body || '').slice(0, 500) };
}

const detailCache = new Map();

async function fetchDetail(seriesId) {
  const sid = String(seriesId);
  const cached = detailCache.get(sid);
  if (cached && Date.now() - cached.at < 60000) return cached.data;
  const html = await httpGet(`${SITE}/detail?series_id=${encodeURIComponent(sid)}`);
  const data = parseEpisodeList(html, sid);
  detailCache.set(sid, { at: Date.now(), data });
  return data;
}

function readHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (_) { return []; }
}

function recordHistory(entry) {
  try {
    const list = readHistory().filter(row => String(row.series_id) !== String(entry.series_id));
    list.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 60)));
  } catch (_) { /* 存储满时忽略，不影响播放 */ }
}

async function browseList(options = {}) {
  const { category = 'real-drama', genre = '', page = 1 } = options || {};
  const ranking = RANKINGS.has(category);
  const pg = Math.max(1, Number.parseInt(page, 10) || 1);
  const url = `${SITE}/${ranking ? 'rank' : 'category'}/${category}${genre ? `/${genre}` : ''}${pg > 1 ? `?page=${pg}` : ''}`;
  const html = await httpGet(url);
  return (ranking ? parseRanking : parseCatalog)(html, category, pg, url);
}

async function searchAt(keyword, page) {
  const query = String(keyword || '').trim();
  if (!query) return { success: false, results: [], error: '请输入搜索词' };
  const url = `${SITE}/api/search/result?aid=8662&query=${encodeURIComponent(query)}&page=${page}`;
  const body = await httpGet(url, { Accept: 'application/json, text/plain, */*' });
  const parsed = parseSearchResponse(JSON.parse(body));
  return { success: true, ...parsed, keyword: query, channel: 'web', cursor: null };
}

const electronAPI = {
  isAndroid: true,
  getAppInfo: async () => ({ version: window.XM.version(), platform: 'android' }),
  diagnoseNetwork: async () => {
    if (typeof window.XM.diagnose === 'function') window.XM.diagnose(1);
    return { success: true };
  },
  browseCategories: async () => CATEGORIES,
  browseList: async (options) => {
    try { return await browseList(options); }
    catch (error) { return { success: false, results: [], error: error.message || '目录加载失败' }; }
  },
  searchSeries: async (keyword) => {
    try { return await searchAt(keyword, 1); }
    catch (error) { return { success: false, results: [], error: error.message || '搜索失败' }; }
  },
  searchSeriesMore: async (keyword, options = {}) => {
    try { return await searchAt(keyword, Number(options?.page) || 2); }
    catch (error) { return { success: false, results: [], error: error.message || '搜索失败' }; }
  },
  searchResolve: async (seriesId) => {
    try { return { success: true, data: await fetchDetail(seriesId) }; }
    catch (error) { return { success: false, error: error.message || '剧集信息加载失败' }; }
  },
  getSeriesEpisodes: async (seriesId) => {
    try { return { success: true, data: await fetchDetail(seriesId) }; }
    catch (error) { return { success: false, error: error.message || '分集加载失败' }; }
  },
  playSeries: async (payload = {}) => {
    const seriesId = String(payload.seriesId || '');
    if (!seriesId) return { success: false, error: '缺少剧集编号' };
    const detail = await fetchDetail(seriesId);
    const index = Math.max(1, Number(payload.vidIndex) || 1);
    const episode = detail.episodes[index - 1] || detail.episodes[0];
    if (!episode) return { success: false, error: '这部剧没有可播放的分集' };
    const html = await httpGet(`${SITE}/player/${encodeURIComponent(seriesId)}/${encodeURIComponent(episode.vid)}`);
    const media = extractPlayUrl(html, episode.vid, seriesId);
    recordHistory({
      series_id: seriesId, series_title: detail.series_title, cover: detail.cover,
      vid_index: index, total: detail.total, updated_at: Date.now(),
    });
    window.XM.play(JSON.stringify({
      url: media.url, userAgent: media.userAgent, referer: media.referer,
      title: detail.series_title, index, total: detail.total,
      seriesId, cover: detail.cover, vids: detail.episodes.map(item => item.vid),
      // 官网公开通道目前只放预览片（约 10 秒），完整片源要 App 通道 + 解密，先在界面上说明。
      preview: media.source === 'web',
    }));
    return { success: true };
  },
  getWatchHistory: async () => ({ success: true, results: readHistory() }),
  onNavigate: () => () => {},

  // 应用内更新（AppUpdateNotice 组件契约）
  getAppUpdateState: async () => updateState,
  onAppUpdateState: listener => { updateListeners.add(listener); return () => updateListeners.delete(listener); },
  onAppUpdatePreference: () => () => {},
  checkAppUpdate: async () => {
    try {
      latestRelease = await fetchLatestRelease();
      return { enabled: true, release: latestRelease ? { version: latestRelease.version, url: RELEASE_PAGE } : null, error: '' };
    } catch (error) {
      return { enabled: true, release: null, error: error.message || '暂时无法检查更新，请检查网络后重试。' };
    }
  },
  downloadAppUpdate: async () => {
    if (!latestRelease) return { success: false, error: '更新信息已失效，请重新检查更新。' };
    if (typeof window.XM.downloadApk !== 'function') return { success: false, error: '当前版本不支持应用内更新' };
    downloadedApk = '';
    emitUpdate({ status: 'downloading', version: latestRelease.version, percent: 0, error: '' });
    window.XM.downloadApk(latestRelease.url, latestRelease.version);
    return { success: true };
  },
  cancelAppUpdate: async () => {
    window.XM.cancelDownload?.();
    emitUpdate({ status: 'idle', percent: 0, error: '' });
    return { success: true };
  },
  installAppUpdate: async () => {
    if (!downloadedApk) return { success: false, error: '请先下载新版安装包。' };
    window.XM.installApk?.(downloadedApk);
    return { success: true };
  },
  openAppUpdate: async () => {
    window.XM.openRelease?.(RELEASE_PAGE);
    return { success: true };
  },
  // 电视端暂不接入红果账号，账号页给出明确说明而不是报错。
  getAccountStatus: async () => ({ success: true, signedIn: false, account: null, error: '电视版暂不支持红果账号扫码登录' }),
  startAccountLogin: async () => ({ success: false, error: '电视版暂不支持红果账号扫码登录' }),
  pollAccountLogin: async () => ({ success: false, error: '电视版暂不支持红果账号扫码登录' }),
  cancelAccountLogin: async () => ({ success: false, error: '电视版暂不支持红果账号扫码登录' }),
  logoutAccount: async () => ({ success: false, error: '电视版暂不支持红果账号扫码登录' }),
  getAccountHistory: async () => ({ success: false, signedIn: false, results: [], error: '电视版暂不支持红果账号扫码登录' }),
  playAccountHistory: async () => ({ success: false, error: '电视版暂不支持红果账号扫码登录' }),
  openAccountWebLogin: async () => ({ success: false, error: '电视版暂不支持红果账号扫码登录' }),
  onAccountUpdated: () => () => {},
};

if (window.XM && !window.electronAPI) {
  window.electronAPI = electronAPI;
  // 遥控器返回键：先让界面按自己的规则处理（关弹窗 / 退出播放页 / 回导航栏），
  // 只有停在首页且没有浮层时才允许原生退出应用。
  window.__xmBack = () => {
    const diagnoseBox = document.getElementById('xm-diagnose');
    if (diagnoseBox && diagnoseBox.parentNode) {
      diagnoseBox.parentNode.removeChild(diagnoseBox);
      return 'handled';
    }
    // 详情页没有独立关闭按钮，靠点遮罩 / Escape 关。Chromium 44 的
    // KeyboardEvent 构造器不认 { key }，所以优先直接点遮罩最稳。
    const mask = document.querySelector('.tv-sheet-mask');
    if (mask) {
      mask.click();
      return 'handled';
    }
    try {
      const ev = document.createEvent('Event');
      ev.initEvent('keydown', true, true);
      try { Object.defineProperty(ev, 'key', { value: 'Escape' }); }
      catch (_) { try { ev.key = 'Escape'; } catch (ignored) {} }
      window.dispatchEvent(ev);
    } catch (_) { /* 老 WebView 不支持构造事件时按未处理算 */ }
    const title = document.querySelector('.tv-page-title');
    const onHome = title && title.textContent.trim() === '发现';
    const overlay = document.querySelector('.tv-sheet, .tv-player');
    return onHome && !overlay ? 'exit' : 'handled';
  };
}

export default electronAPI;
