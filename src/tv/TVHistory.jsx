// 星幕剧场 TV 版：观看记录。列表展示本机记录，回车续播。
import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight } from '../components/icons';
import { hoverAllowed } from './focusGuard';

export default function TVHistory({ zoneActive, onRequestRail, onPlay }) {
  const [rows, setRows] = useState([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const listRef = useRef(null);
  const openingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.getWatchHistory?.().then((result) => {
      if (cancelled) return;
      const list = Array.isArray(result?.results) ? result.results : [];
      setRows(list.filter(r => r?.series_id && r?.series_title));
      setLoading(false);
    }).catch((e) => {
      if (!cancelled) { setError(e.message || '观看记录加载失败'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [index]);

  const resume = async (row) => {
    if (openingRef.current) return;
    openingRef.current = true;
    try { await onPlay?.(row.series_id, row.vid_index || 1); }
    finally { openingRef.current = false; }
  };

  useEffect(() => {
    if (!zoneActive) return undefined;
    const onKeyDown = (event) => {
      const { key } = event;
      const count = rowsRef.current.length;
      if (!count) {
        if (key === 'ArrowLeft' || key === 'ArrowUp') { event.preventDefault(); onRequestRail?.(); }
        return;
      }
      if (key === 'ArrowUp') { event.preventDefault(); if (indexRef.current === 0) onRequestRail?.(); else setIndex(i => i - 1); }
      else if (key === 'ArrowDown') { event.preventDefault(); setIndex(i => Math.min(i + 1, count - 1)); }
      else if (key === 'ArrowLeft') { event.preventDefault(); onRequestRail?.(); }
      else if (key === 'Enter' || key === ' ') { event.preventDefault(); const row = rowsRef.current[indexRef.current]; if (row) resume(row); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneActive, onRequestRail, onPlay]);

  return (
    <div className="tv-page tv-history">
      <header className="tv-page-head">
        <div>
          <h1 className="tv-page-title">观看记录</h1>
          <p className="tv-page-sub">{rows.length ? `最近 ${rows.length} 部，按最近观看排序` : '本机观看记录'}</p>
        </div>
      </header>

      {error && <div className="tv-banner" role="alert"><span>{error}</span></div>}

      {!!rows.length && (
        <ul className="tv-account-list" ref={listRef}>
          {rows.map((row, i) => (
            <li key={row.series_id}>
              <button
                type="button"
                className={`tv-list-row ${zoneActive && index === i ? 'is-focus' : ''}`}
                onMouseEnter={() => { if (!hoverAllowed()) return; setIndex(i); }}
                onClick={() => resume(row)}
              >
                <span className="tv-list-art">
                  {row.cover ? <img src={row.cover} alt="" loading="lazy" /> : <span className="tv-list-fallback">{row.series_title?.slice(0, 1)}</span>}
                </span>
                <span className="tv-list-copy">
                  <span className="tv-list-title">{row.series_title}</span>
                  <span className="tv-list-meta">看到第 {row.vid_index || 1} 集{row.total ? ` / 共 ${row.total} 集` : ''}</span>
                </span>
                <span className="tv-list-time">
                  {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : ''}
                </span>
                <ChevronRight size={18} strokeWidth={1.6} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {loading && <div className="tv-hint-line">正在加载</div>}
      {!loading && !rows.length && !error && <div className="tv-hint-line">还没有观看记录，去首页挑一部</div>}
    </div>
  );
}
