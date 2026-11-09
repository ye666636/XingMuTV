/**
 * 星幕剧场 Android TV 版：官网页面解析器。
 *
 * 这些函数与桌面版 src/native/catalog.js、src/native/hongguo.js、
 * src/native/hongguo-search.js 中的实现保持一致（GPL-3.0，同源项目），
 * 只保留纯字符串/JSON 解析部分，不依赖 Node 与 Electron，方便在 WebView 里跑。
 */

export const SITE = 'https://hongguoduanju.com';
export const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
export const WEB_REFERER = `${SITE}/`;

export function readRouterData(html) {
  const match = String(html).match(/(?:window\.)?_ROUTER_DATA\s*=\s*(\{)/);
  if (!match) throw new Error('来源页面未返回目录数据，请重试');
  const start = match.index + match[0].length - 1;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  throw new Error('来源目录数据不完整，请重试');
}

export function publicMetadata(item) {
  const episode_label = typeof item?.episode_right_text === 'string' ? item.episode_right_text.trim().slice(0, 80) : '';
  const completion_status = /^(?:全\s*\d+\s*集|已完结|完结)$/.test(episode_label) ? 'completed'
    : /连载|更新至\s*\d+\s*集/.test(episode_label) ? 'ongoing' : 'unknown';
  const raw = Number(item?.first_visible_time);
  const timestamp = raw < 1e12 ? raw * 1000 : raw;
  const published_at = Number.isFinite(timestamp) && timestamp > 0 && timestamp <= Date.now() ? timestamp : null;
  return { episode_label, completion_status, published_at };
}

export function parseCatalog(html, category, page, sourceUrl) {
  const router = readRouterData(html);
  const data = Object.values(router.loaderData || {}).find(value => value?.categoryRoute?.contentType === category);
  if (!data || data.isSuccess === false || !Array.isArray(data.recommendList)) {
    throw new Error('来源目录暂不可用，请重试');
  }
  const pageTitle = data.seo?.title || '';
  if (category === 'comic') {
    return { success: true, results: [], page: 1, total: 0, totalPages: 0, genres: [], pageTitle, sourceUrl,
      unsupported: true, emptyMessage: '漫画属于图文阅读，暂不支持视频播放。' };
  }
  const seen = new Set();
  const results = data.recommendList.filter(item => {
    if (!/^\d{6,}$/.test(item?.series_id) || typeof item.series_name !== 'string' || !item.series_name.trim() || seen.has(String(item.series_id))) return false;
    seen.add(String(item.series_id));
    return true;
  }).map(item => ({
    series_id: String(item.series_id), series_title: item.series_name.trim(), cover: item.series_cover || '',
    episode_count: Number(item.episode_cnt) || 0,
    tags: Array.isArray(item.tags) ? item.tags.filter(tag => typeof tag === 'string').slice(0, 4) : [],
    ...publicMetadata(item),
    url: `${SITE}/detail?series_id=${item.series_id}`,
  }));
  const genres = (Array.isArray(data.selectorList) ? data.selectorList : []).flatMap(row => Array.isArray(row?.items) ? row.items : [])
    .filter(item => /^[a-z0-9-]+$/.test(item?.selector_item_id) && typeof item.show_name === 'string')
    .map(item => ({ slug: item.selector_item_id, label: item.show_name }));
  return { success: true, results, page: Number(data.pagination?.pageNum) || page,
    total: Number(data.pagination?.total) || 0, totalPages: Number(data.pagination?.totalPages) || 0,
    genres, pageTitle, sourceUrl };
}

function decodeHtml(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|quot|apos|amp|lt|gt);/gi, (entity, key) => {
    if (key[0] !== '#') return ({ quot: '"', apos: "'", amp: '&', lt: '<', gt: '>' })[key.toLowerCase()];
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

export function parseRanking(html, category, page, sourceUrl) {
  const text = value => decodeHtml(String(value).replace(/<[^>]*>/g, ' ')).trim();
  let data;
  for (const script of String(html).matchAll(/<script\b([^>]*)>/gi)) {
    if (!/data-fn-name=["']mergeLoaderData["']/.test(script[1])) continue;
    const encoded = script[1].match(/data-fn-args=(?:"([^"]*)"|'([^']*)')/);
    if (!encoded) continue;
    try {
      const args = JSON.parse(decodeHtml(encoded[1] ?? encoded[2]));
      if (args[0] !== `rank_${category}/page` || !Array.isArray(args[1])) continue;
      const content = args[1].find(item => item.key === 'content' && item.routerDataFnName === 'p');
      if (content?.routerDataFnArgs?.[0]) data = JSON.parse(content.routerDataFnArgs[0]);
    } catch (_) { /* 流式响应有时只有渲染好的卡片 */ }
  }
  const seen = new Set();
  const normalize = item => {
    const id = String(item.seriesId || '');
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const rank = Number(item.rank);
    if (!/^\d{6,}$/.test(id) || !title || !Number.isSafeInteger(rank) || rank < 1 || seen.has(id)) return null;
    seen.add(id);
    return { series_id: id, series_title: title,
      cover: typeof item.cover === 'string' && /^https?:\/\//.test(item.cover) ? item.cover : '',
      episode_count: Array.isArray(item.episodeVids) ? item.episodeVids.length : 0,
      tags: Array.isArray(item.tags) ? item.tags.filter(tag => typeof tag === 'string').slice(0, 4) : [],
      rank, heat: typeof item.heatText === 'string' ? item.heatText.trim() : '',
      ...publicMetadata(item),
      url: `${SITE}/detail?series_id=${id}` };
  };
  let results = data?.isSuccess !== false && Array.isArray(data?.rankList) ? data.rankList.map(normalize).filter(Boolean) : [];
  if (!results.length) {
    for (const match of String(html).matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
      const article = match[1];
      const heading = article.match(/<h2\b[^>]*\bid=["']rank-title-(\d+)["'][^>]*>([\s\S]*?)<\/h2>/i);
      if (!heading || !article.includes(`/detail?series_id=${heading[1]}`)) continue;
      const cover = article.match(/<img\b[^>]*\bsrc=(?:"([^"]*)"|'([^']*)')/i);
      const tags = article.match(/<p\b[^>]*class=["'][^"']*pc-categories-[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
      const item = normalize({ seriesId: heading[1], title: text(heading[2]),
        rank: article.match(/<span\b[^>]*>\s*(\d+)\s*<\/span>/i)?.[1],
        heatText: text(article).match(/[\d.,]+\s*[万亿]?\s*热度/)?.[0] || '',
        cover: cover ? decodeHtml(cover[1] ?? cover[2]) : '',
        tags: tags ? Array.from(tags[1].matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi), tag => text(tag[1])) : [],
      });
      if (item) results.push(item);
    }
  }
  if (!results.length) throw new Error('来源榜单暂不可用，请重试');
  const nav = String(html).match(/<nav\b[^>]*aria-label=["']榜单分页["'][^>]*>([\s\S]*?)<\/nav>/i)?.[1] || '';
  const current = Number(data?.pagination?.pageNum) || Number(nav.match(/aria-current=["']page["'][^>]*>(\d+)/)?.[1]) || page;
  const pages = Array.from(nav.matchAll(/href=["']([^"']+)["']/g), match => {
    try {
      const url = new URL(decodeHtml(match[1]), SITE);
      return url.origin === SITE && url.pathname === `/rank/${category}` ? Number(url.searchParams.get('page')) || 1 : 0;
    } catch (_) { return 0; }
  });
  return { success: true, results, page: current, total: 0,
    totalPages: Number(data?.pagination?.totalPages) || Math.max(current, ...pages),
    genres: [], pageTitle: text(String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''), sourceUrl };
}

export function parseEpisodeList(html, seriesId) {
  const router = readRouterData(html);
  const data = router.loaderData?.['player_(series_id)/page']
    ?? router.loaderData?.['player_(series_id)/(vid)/page']
    ?? router.loaderData?.detail_page;
  const detail = data?.seriesDetail;
  if (!data || data.isSuccess === false || !/^\d{1,30}$/.test(String(detail?.series_id || '')) ||
      String(detail.series_id) !== String(seriesId) ||
      (data.series_id != null && String(data.series_id) !== String(seriesId))) {
    throw new Error('官网返回的剧集与请求不一致');
  }
  if (!Array.isArray(detail.vid_list)) throw new Error('官网页面未找到分集数据');
  const vids = detail.vid_list.map(String);
  if (!vids.length) throw new Error('官网分集列表为空');
  const seriesTitle = typeof detail.series_name === 'string' ? detail.series_name : '未命名短剧';
  const cover = typeof detail.series_cover === 'string' ? detail.series_cover : '';
  const accessible = detail.accessible_episode_cnt;
  const webAccessibleEpisodes = accessible != null && /^\d+$/.test(String(accessible))
    ? Math.min(Number(accessible), vids.length) : null;
  const episodes = vids.map((vid, i) => ({
    vid, vid_index: i + 1, title: '', series_id: String(seriesId), series_title: seriesTitle, cover,
    web_available: webAccessibleEpisodes === null ? null : i < webAccessibleEpisodes,
  }));
  return {
    series_id: String(seriesId), series_title: seriesTitle, cover: cover || (episodes[0] && episodes[0].cover) || '',
    total: episodes.length, web_accessible_episodes: webAccessibleEpisodes, episodes,
    description: typeof detail.series_intro === 'string' ? detail.series_intro : '',
    source: 'web',
  };
}

function cleanUrl(value) {
  return String(value || '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/\\u0026/gi, '&').replace(/&amp;/g, '&');
}
function cleanText(value) {
  return String(value || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').trim();
}
function safeCover(value) {
  const url = cleanUrl(value);
  return /^https?:\/\//i.test(url) ? url : '';
}
function episodeCountOf(video) {
  const count = Number(video?.episode_cnt);
  if (Number.isInteger(count) && count > 0) return count;
  const right = String(video?.episode_right_text || '');
  const match = right.match(/(\d+)\s*集/);
  return match ? Number(match[1]) : 0;
}
function tagsOf(video) {
  const list = Array.isArray(video?.tags) ? video.tags : Array.isArray(video?.category_list) ? video.category_list : [];
  const tags = [];
  for (const item of list) {
    const label = typeof item === 'string' ? item : item?.name || item?.tag_name || item?.title;
    const text = String(label || '').trim();
    if (text && !tags.includes(text)) tags.push(text);
    if (tags.length >= 4) break;
  }
  return tags;
}

export function parseSearchResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('搜索返回异常数据');
  if (typeof payload.code === 'string') throw new Error(`搜索服务暂不可用（${payload.message || payload.code}）`);
  if (!Array.isArray(payload.searchList)) throw new Error('搜索返回异常数据');
  const results = [];
  const seen = new Set();
  for (const item of payload.searchList) {
    const videoData = item?.video_data;
    const video = videoData && typeof videoData === 'object' && Object.keys(videoData).length ? videoData : item;
    const seriesId = String(video?.series_id || item?.series_id || item?.keyword || '').trim();
    const title = cleanText(video?.series_name || video?.series_title || item?.name || video?.title || '');
    if (!/^\d{6,}$/.test(seriesId) || !title || seen.has(seriesId)) continue;
    seen.add(seriesId);
    results.push({
      series_id: seriesId, series_title: title,
      cover: safeCover(video?.series_cover || video?.cover || ''),
      episode_count: episodeCountOf(video), tags: tagsOf(video),
      description: cleanText(video?.series_intro || ''),
      url: `${SITE}/detail?series_id=${seriesId}`,
    });
  }
  if (!results.length && payload.searchList.length > 0) throw new Error('搜索返回的条目无法识别');
  const total = Number(payload.totalCount);
  const totalPages = Number(payload.totalPages);
  const page = Number(payload.pageNum);
  return {
    results,
    total: Number.isFinite(total) && total >= 0 ? total : results.length,
    totalPages: Number.isFinite(totalPages) && totalPages >= 0 ? totalPages : 0,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    hasMore: payload.hasMore === true,
  };
}

function normalizeVideoUrl(raw) {
  return String(raw || '').replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&')
    .replace(/([?&])Range=[^&]*/gi, '$1').replace(/[?&]$/, '');
}

function isPublicMediaUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    return host.includes('.') && !/(^|\.)(localhost|local|internal|lan|home)$/.test(host);
  } catch (_) { return false; }
}

/** 从 /player/{sid}/{vid} 页面里取出与当前分集绑定的 VideoObject.contentUrl。 */
export function extractPlayUrl(html, vid, sid) {
  const router = readRouterData(html);
  const data = router.loaderData?.['player_(series_id)/(vid)/page'] ?? router.loaderData?.['player_(series_id)/page'];
  const actualSid = String(data?.series_id || '');
  if (!data || data.isSuccess === false || String(data.vid) !== String(vid) || !/^\d+$/.test(actualSid) ||
      (sid && actualSid !== String(sid)) || data.publicVideoSeo?.available !== true) {
    throw new Error('官网未提供这一集的可播放片源');
  }
  const matchesPlayer = (value, videoUrl) => {
    try {
      const target = new URL(value);
      return target.origin === SITE && !target.username && !target.password &&
        (target.pathname === `/player/${actualSid}/${String(vid)}` ||
          (target.pathname === `/player/${actualSid}` && videoUrl.origin === SITE &&
            videoUrl.pathname.startsWith(`/video/public/${String(vid)}/`)));
    } catch (_) { return false; }
  };
  for (const script of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\btype\s*=\s*["']application\/ld\+json["']/i.test(script[1])) continue;
    let video;
    try { video = JSON.parse(script[2]); } catch (_) { continue; }
    if (video?.['@type'] !== 'VideoObject') continue;
    let videoUrl;
    try { videoUrl = new URL(normalizeVideoUrl(video.contentUrl)); } catch (_) { continue; }
    if (!matchesPlayer(video.url, videoUrl) || (video['@id'] && !matchesPlayer(video['@id'], videoUrl))) continue;
    if (!isPublicMediaUrl(videoUrl.href)) continue;
    return { url: videoUrl.href, userAgent: WEB_UA, referer: WEB_REFERER, source: 'web' };
  }
  throw new Error('官网页面里没有找到这一集的播放地址');
}
