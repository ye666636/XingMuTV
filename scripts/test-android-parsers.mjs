// 用 Node 直接验证 Android 版解析器是否与官网当前结构一致（不进模拟器，先保数据链路）。
import { parseCatalog, parseEpisodeList, parseSearchResponse, extractPlayUrl, SITE, WEB_UA, WEB_REFERER } from '../src/android/parsers.js';

const headers = { 'User-Agent': WEB_UA, Referer: WEB_REFERER };

async function get(url, extra = {}) {
  const res = await fetch(url, { headers: { ...headers, ...extra }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function main() {
  const catUrl = `${SITE}/category/real-drama`;
  const cat = parseCatalog(await get(catUrl), 'real-drama', 1, catUrl);
  console.log('目录:', cat.results.length, '部 | 总数', cat.total, '| 页数', cat.totalPages);
  console.log('  示例:', cat.results.slice(0, 3).map(i => `${i.series_id} ${i.series_title}`).join(' / '));

  const search = parseSearchResponse(JSON.parse(await get(`${SITE}/api/search/result?aid=8662&query=${encodeURIComponent('都市')}&page=1`, { Accept: 'application/json' })));
  console.log('搜索 都市:', search.results.length, '条 | total', search.total, '| pages', search.totalPages, '| hasMore', search.hasMore);

  const sid = cat.results[0].series_id;
  const detail = parseEpisodeList(await get(`${SITE}/detail?series_id=${sid}`), sid);
  console.log('详情:', detail.series_title, '|', detail.total, '集');

  const vid = detail.episodes[0].vid;
  const media = extractPlayUrl(await get(`${SITE}/player/${sid}/${vid}`), vid, sid);
  console.log('播放地址:', media.url.slice(0, 110));
}

main().catch((error) => { console.error('失败:', error.message); process.exitCode = 1; });
