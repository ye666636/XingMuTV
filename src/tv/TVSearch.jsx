// 星幕剧场 TV 版：搜索页。搜索框 + 热门词 + 结果海报墙 + 分页加载。
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search as SearchIcon } from '../components/icons';
import { hoverAllowed } from './focusGuard';

const COLS = 6;
const HOT_WORDS = ['都市', '逆袭', '甜宠', '战神', '古装', '穿越'];

export default function TVSearch({ zoneActive, onRequestRail, onOpenDetail }) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [row, setRow] = useState('input'); // input | grid | more
  const rowRef = useRef(row);
  rowRef.current = row;
  const [hotIndex, setHotIndex] = useState(-1);
  const hotIndexRef = useRef(-1);
  hotIndexRef.current = hotIndex;
  const [gridIndex, setGridIndex] = useState(0);
  const gridIndexRef = useRef(gridIndex);
  gridIndexRef.current = gridIndex;
  const inputRef = useRef(null);
  const gridRef = useRef(null);
  const searchingRef = useRef(false);

  // 分页状态：channel/cursor/page 由主进程原样回传，第 2 页起必须沿用第一页选中的通道
  const [paging, setPaging] = useState(null);
  const pagingRef = useRef(null);
  pagingRef.current = paging;
  const [meta, setMeta] = useState({ total: 0, totalPages: 0 });
  const [kwUsed, setKwUsed] = useState('');
  const [moreLoading, setMoreLoading] = useState(false);
  const moreLoadingRef = useRef(false);

  useEffect(() => {
    if (zoneActive && row === 'input' && hotIndex === -1) inputRef.current?.focus();
  }, [zoneActive, row, hotIndex]);

  useEffect(() => {
    if (!zoneActive) inputRef.current?.blur();
  }, [zoneActive]);

  const doSearch = useCallback(async (word) => {
    const kw = String(word || '').trim();
    if (!kw || searchingRef.current) return;
    searchingRef.current = true;
    setLoading(true);
    setError('');
    setPaging(null);
    setMeta({ total: 0, totalPages: 0 });
    try {
      const result = await window.electronAPI.searchSeries(kw, {});
      const list = Array.isArray(result?.results) ? result.results.filter(it => it?.series_id && it?.series_title) : [];
      if (!result?.success && !list.length) throw new Error(result?.error || '搜索失败，请稍后重试');
      setResults(list);
      setGridIndex(0);
      setKwUsed(kw);
      setMeta({ total: Number(result?.meta?.total) || list.length, totalPages: Number(result?.meta?.totalPages) || 0 });
      setPaging(result?.hasMore ? {
        channel: result.channel || null,
        cursor: result.cursor || null,
        page: Number(result.page) || 1,
      } : null);
      if (list.length) setRow('grid');
      else setError(`没有找到「${kw}」相关的短剧`);
      inputRef.current?.blur();
    } catch (e) {
      setError(e.message || '搜索失败，请稍后重试');
    } finally {
      searchingRef.current = false;
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const state = pagingRef.current;
    if (!state || moreLoadingRef.current) return;
    moreLoadingRef.current = true;
    setMoreLoading(true);
    setError('');
    const before = resultsRef.current.length;
    try {
      const res = await window.electronAPI.searchSeriesMore(kwUsed, {
        channel: state.channel,
        cursor: state.cursor,
        page: state.page + 1,
      });
      const additions = Array.isArray(res?.results)
        ? res.results.filter(it => it?.series_id && it?.series_title)
        : [];
      if (!res?.success && !additions.length) throw new Error(res?.error || '加载下一页失败');
      // 先同步合并，避免在 setResults 的 updater 里取长度（React 批处理时 updater 尚未执行）
      const prev = resultsRef.current;
      const seen = new Set(prev.map(it => String(it.series_id)));
      const merged = [...prev];
      for (const item of additions) {
        if (seen.has(String(item.series_id))) continue;
        seen.add(String(item.series_id));
        merged.push(item);
      }
      setResults(merged);
      setPaging(res?.hasMore ? {
        channel: res.channel || state.channel,
        cursor: res.cursor || null,
        page: Number(res.page) || state.page + 1,
      } : null);
      setMeta((m) => ({ ...m, total: Math.max(m.total, merged.length) }));
      // 焦点落到新一页的第一部
      if (merged.length > before) {
        setRow('grid');
        setGridIndex(before);
      }
    } catch (e) {
      setError(e.message || '加载下一页失败');
    } finally {
      moreLoadingRef.current = false;
      setMoreLoading(false);
    }
  }, [kwUsed]);

  useEffect(() => {
    if (row !== 'grid' || !gridRef.current) return;
    gridRef.current.children[gridIndex]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [gridIndex, row]);

  useEffect(() => {
    if (!zoneActive) return undefined;
    const onKeyDown = (event) => {
      const { key } = event;
      if (rowRef.current === 'input') {
        const typing = event.target === inputRef.current;
        if (hotIndexRef.current === -1 && typing) {
          if (key === 'ArrowDown') { event.preventDefault(); setHotIndex(0); inputRef.current?.blur(); }
          else if (key === 'ArrowUp') { event.preventDefault(); onRequestRail?.(); inputRef.current?.blur(); }
          else if (key === 'ArrowLeft' && !inputRef.current?.value) { event.preventDefault(); onRequestRail?.(); inputRef.current?.blur(); }
          else if (key === 'Enter') { event.preventDefault(); doSearch(inputRef.current?.value); }
          return;
        }
        if (key === 'ArrowLeft') { event.preventDefault(); if (hotIndexRef.current <= 0) { setHotIndex(-1); onRequestRail?.(); } else setHotIndex(i => i - 1); }
        else if (key === 'ArrowRight') { event.preventDefault(); setHotIndex(i => Math.min(i + 1, HOT_WORDS.length - 1)); }
        else if (key === 'ArrowUp') { event.preventDefault(); setHotIndex(-1); }
        else if (key === 'ArrowDown') { event.preventDefault(); if (resultsRef.current.length) { setRow('grid'); setGridIndex(0); } }
        else if (key === 'Enter' || key === ' ') {
          event.preventDefault();
          if (hotIndexRef.current === -1) inputRef.current?.focus();
          else { const w = HOT_WORDS[hotIndexRef.current]; setKeyword(w); doSearch(w); }
        }
        return;
      }
      const count = resultsRef.current.length;
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
      if (key === 'ArrowLeft') { event.preventDefault(); if (gridIndexRef.current % COLS === 0) onRequestRail?.(); else setGridIndex(i => i - 1); }
      else if (key === 'ArrowRight') { event.preventDefault(); setGridIndex(i => Math.min(i + 1, count - 1)); }
      else if (key === 'ArrowUp') { event.preventDefault(); if (gridIndexRef.current < COLS) { setRow('input'); setHotIndex(0); } else setGridIndex(i => i - COLS); }
      else if (key === 'ArrowDown') {
        event.preventDefault();
        const next = gridIndexRef.current + COLS;
        if (next > count - 1) { if (pagingRef.current || moreLoadingRef.current) setRow('more'); }
        else setGridIndex(next);
      }
      else if (key === 'Enter' || key === ' ') { event.preventDefault(); const item = resultsRef.current[gridIndexRef.current]; if (item) onOpenDetail?.(item); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoneActive, doSearch, loadMore, onOpenDetail, onRequestRail]);

  const totalLabel = !results.length
    ? '输入剧名，或从热门词开始'
    : paging
      ? (meta.total > results.length ? `已显示 ${results.length} / 共 ${meta.total} 部` : `已显示 ${results.length} 部`)
      : `${results.length} 部结果 · 已全部加载`;
  const nextPage = paging ? paging.page + 1 : 0;

  return (
    <div className="tv-page tv-search">
      <header className="tv-page-head tv-page-head--stack">
        <div>
          <h1 className="tv-page-title">搜索</h1>
          <p className="tv-page-sub">{totalLabel}</p>
        </div>
        <div className={`tv-search-field ${zoneActive && row === 'input' && hotIndex === -1 ? 'is-focus' : ''}`}>
          <SearchIcon size={20} strokeWidth={1.6} />
          <input
            ref={inputRef}
            type="text"
            placeholder="剧名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div className="tv-hotwords">
          {HOT_WORDS.map((w, i) => (
            <button
              key={w}
              type="button"
              className={`tv-hotword ${zoneActive && row === 'input' && hotIndex === i ? 'is-focus' : ''}`}
              onMouseEnter={() => { if (!hoverAllowed()) return; setRow('input'); setHotIndex(i); }}
              onClick={() => { setKeyword(w); doSearch(w); }}
            >
              {w}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="tv-banner" role="alert"><span>{error}</span></div>}

      <div className="tv-grid" ref={gridRef}>
        {results.map((item, i) => (
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

      {results.length > 0 && (
        <div className="tv-more-row">
          {paging ? (
            <button
              type="button"
              className={`tv-btn tv-more-btn ${zoneActive && row === 'more' ? 'is-focus' : ''}`}
              disabled={moreLoading}
              onMouseEnter={() => { if (!hoverAllowed()) return; setRow('more'); }}
              onClick={loadMore}
            >
              <span>{moreLoading ? '正在加载…' : '下一页'}</span>
              <span className="tv-more-count">第 {nextPage}{meta.totalPages ? ` / ${meta.totalPages}` : ''} 页</span>
            </button>
          ) : (
            <span className="tv-more-end">没有更多了</span>
          )}
        </div>
      )}
      {loading && <div className="tv-hint-line">正在搜索</div>}
    </div>
  );
}
