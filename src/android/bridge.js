/**
 * 星幕剧场 Android TV 版：WebView 侧的 electronAPI 适配层。
 *
 * 桌面版的界面代码只认 window.electronAPI；这里用原生 XM 桥（Java）补齐
 * TV 界面真正用到的那部分能力：目录、搜索、详情、播放、观看记录、账号占位。
 * 所有网络请求都走原生 OkHttp，绕开 WebView 的 CORS 限制。
 */
import {
  SITE, WEB_UA, WEB_REFERER,
  parseCatalog, parseRanking, parseEpisodeList, parseSearchResponse, extractPlayUrl,
} from './parsers.js';

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
  if (status >= 200 && status < 400) entry.resolve(body);
  else entry.reject(new Error(`请求失败（HTTP ${status}）`));
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
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    } catch (_) { /* 老 WebView 不支持构造事件时按未处理算 */ }
    const title = document.querySelector('.tv-page-title');
    const onHome = title && title.textContent.trim() === '发现';
    const overlay = document.querySelector('.tv-sheet, .tv-player');
    return onHome && !overlay ? 'exit' : 'handled';
  };
}

export default electronAPI;
