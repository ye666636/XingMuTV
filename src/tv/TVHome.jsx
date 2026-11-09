// 星幕剧场 TV 版：首页。分类分段控件 + 海报墙，方向键导航 + 分页加载。
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { hoverAllowed } from './focusGuard';

const COLS = 6;
const cache = { categories: null, lists: {}, meta: {} };

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const id = String(item.series_id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

export default function TVHome({ zoneActive, onRequestRail, onOpenDetail }) {
  const [categories, setCategories] = useState(cache.categories || []);
  const [catIndex, setCatIndex] = useState(0);
  const catIndexRef = useRef(catIndex);
  catIndexRef.current = catIndex;
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [page, setPage] = useState(1);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [hasMore, setHasMore] = useState(false);
  const hasMoreRef = useRef(false);
  hasMoreRef.current = hasMore;
  // 官网目录返回 total/totalPages，App 目录只返回 hasMore；统一记在这里用于显示进度
  const [meta, setMeta] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [row, setRow] = useState('cats');
  const rowRef = useRef(row);
  rowRef.current = row;
  const [gridIndex, setGridIndex] = useState(0);
  const gridIndexRef = useRef(gridIndex);
  gridIndexRef.current = gridIndex;
  const loadingRef = useRef(false);
  const gridRef = useRef(null);

  useEffect(() => {
    if (cache.categories) return;
    window.electronAPI.browseCategories?.().then((cats) => {
      if (Array.isArray(cats) && cats.length) {
        cache.categories = cats;
        setCategories(cats);
      }
    }).catch(() => {});
  }, []);

  const loadList = useCallback(async (slug, pg, append) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const cacheKey = `${slug}:${pg}`;
      if (!append && cache.lists[cacheKey]) {
        const cachedMeta = cache.meta[cacheKey] || { total: 0, totalPages: 0, more: true };
        setItems(cache.lists[cacheKey]);
        setHasMore(cachedMeta.more !== false);
        setMeta({ total: cachedMeta.total, totalPages: cachedMeta.totalPages });
        return cache.lists[cacheKey];
      }
      // 固定走官网目录通道（catalogChannel: 'web'）：URL 分页、无游标会话，
      // 不会出现 App 目录「分页记录已失效」（App 会话只有 2 分钟有效期）。
      const result = await window.electronAPI.browseList({
        category: slug,
        page: pg,
        forceRefresh: !append && pg === 1,
        catalogChannel: 'web',
      });
      const list = Array.isArray(result?.results) ? result.results.filter(it => it?.series_id && it?.series_title) : [];
      if (!result?.success && !list.length) throw new Error(result?.error || '片单加载失败，请稍后重试');
      const totalPages = Number(result?.totalPages) || 0;
      const total = Number(result?.total) || 0;
      const more = list.length > 0 && (totalPages ? pg < totalPages : result?.hasMore !== false);
      if (!append) {
        cache.lists[cacheKey] = list;
        cache.meta[cacheKey] = { total, totalPages, more };
      }
      setItems(prev => (append ? dedupe([...prev, ...list]) : list));
      setPage(pg);
      setHasMore(more);
      setMeta({ total, totalPages });
      return list;
    } catch (e) {
      setError(e.message || '片单加载失败，请稍后重试');
      return null;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const cat = categories[catIndexRef.current];
    if (!cat || loadingRef.current || !hasMoreRef.current) return;
    const before = itemsRef.current.length;
    const added = await loadList(cat.slug, pageRef.current + 1, true);
    if (added && added.length) {
      setRow('grid');
      setGridIndex(before);
    }
  }, [categories, loadList]);

  useEffect(() => {
    const cat = categories[catIndex];
    if (!cat) return;
    setGridIndex(0);
    setRow('cats');
    setHasMore(false);
    setMeta({ total: 0, totalPages: 0 });
    loadList(cat.slug, 1, false);
  }, [categories, catIndex, loadList]);

  useEffect(() => {
    if (row !== 'grid' || !gridRef.current) return;
    gridRef.current.children[gridIndex]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [gridIndex, row]);

  useEffect(() => {
    if (!zoneActive) return undefined;
    const onKeyDown = (event) => {
      const { key } = event;
      if (rowRef.current === 'cats') {
        if (key === 'ArrowLeft') {
          event.preventDefault();
          if (catIndexRef.current === 0) onRequestRail?.();
          else setCatIndex(i => i - 1);
        } else if (key === 'ArrowRight') {
          event.preventDefault();
          setCatIndex(i => Math.min(i + 1, categories.length - 1));
        } else if (key === 'ArrowDown' || key === 'Enter') {
          event.preventDefault();
          if (itemsRef.current.length) setRow('grid');
        }
        return;
      }
      const count = itemsRef.current.length;
      if (rowRef.current === 'more') {
        if (key === 'ArrowUp') {
          event.preventDefault();
          const col = gridIndexRef.current % COLS;
          const lastRowStart = Math.floor((count - 1) / COLS) * COLS;
          setGridIndex(Math.min(lastRowStart + col, count - 1));
          setRow('grid');
        } else if (key === 'Enter' || key === ' ') {
          event.preventDefault();
          loadMore();
        }
        return;
      }
      if (key === 'ArrowLeft') {
        event.preventDefault();
        if (gridIndexRef.current % COLS === 0) setRow('cats');
        else setGridIndex(i => Math.max(0, i - 1));
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        if (gridIndexRef.current + 1 < count) setGridIndex(i => i + 1);
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        if (gridIndexRef.current < COLS) setRow('cats');
        else setGridIndex(i => i - COLS);
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        const next = gridIndexRef.current + COLS;
        if (next >= count) { if (hasMoreRef.current) setRow('more'); }
        else setGridIndex(next);
      } else if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        const item = itemsRef.current[gridIndexRef.current];
        if (item) onOpenDetail?.(item);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoneActive, categories, loadList, loadMore, onOpenDetail, onRequestRail]);

  const currentCat = categories[catIndex];

  return (
    <div className="tv-page tv-home">
      <header className="tv-page-head">
        <div>
          <h1 className="tv-page-title">发现</h1>
          <p className="tv-page-sub">
            {currentCat
              ? (meta.total > items.length
                  ? `${currentCat.label} · 已显示 ${items.length} / 共 ${meta.total} 部`
                  : `${currentCat.label} · ${items.length} 部`)
              : '正在读取片单'}
          </p>
        </div>
        <div className="tv-segmented" role="tablist" aria-label="分类">
          {categories.map((cat, i) => (
            <button
              key={cat.slug}
              type="button"
              role="tab"
              aria-selected={catIndex === i}
              className={`tv-segment ${catIndex === i ? 'is-current' : ''} ${zoneActive && row === 'cats' && catIndex === i ? 'is-focus' : ''}`}
              onMouseEnter={() => { if (!hoverAllowed()) return; setCatIndex(i); }}
              onClick={() => { setCatIndex(i); setRow('grid'); }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="tv-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="tv-banner-action" onClick={() => { const cat = categories[catIndexRef.current]; if (cat) loadList(cat.slug, 1, false); }}>重试</button>
        </div>
      )}

      <div className="tv-grid" ref={gridRef}>
        {items.map((item, i) => (
          <button
            key={`${item.series_id}-${i}`}
            type="button"
            className={`tv-poster ${zoneActive && row === 'grid' && gridIndex === i ? 'is-focus' : ''}`}
            onMouseEnter={() => { if (!hoverAllowed()) return; setRow('grid'); setGridIndex(i); }}
            onClick={() => onOpenDetail?.(item)}
          >
            <span className="tv-poster-art">
              {item.cover
                ? <img src={item.cover} alt={item.series_title} loading="lazy" />
                : <span className="tv-poster-fallback">{item.series_title?.slice(0, 1)}</span>}
            </span>
            <span className="tv-poster-name">{item.series_title}</span>
          </button>
        ))}

      </div>

      {items.length > 0 && (
        <div className="tv-more-row">
          {hasMore ? (
            <button
              type="button"
              className={`tv-btn tv-more-btn ${zoneActive && row === 'more' ? 'is-focus' : ''}`}
              disabled={loading}
              onMouseEnter={() => { if (!hoverAllowed()) return; setRow('more'); }}
              onClick={loadMore}
            >
              <span>{loading ? '正在加载…' : '下一页'}</span>
              <span className="tv-more-count">第 {page + 1}{meta.totalPages ? ` / ${meta.totalPages}` : ''} 页</span>
            </button>
          ) : (
            <span className="tv-more-end">没有更多了</span>
          )}
        </div>
      )}

      {loading && <div className="tv-hint-line">正在加载</div>}
      {!loading && !items.length && !error && <div className="tv-hint-line">这个分类暂时没有片单</div>}
    </div>
  );
}
