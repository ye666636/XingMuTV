// 星幕剧场 TV 版：剧集详情页。封面 + 简介 + 选集，回车播放，返回键关闭。
import React, { useState, useEffect, useRef } from 'react';
import { Play } from '../components/icons';
import { hoverAllowed } from './focusGuard';

const COLS = 12;

export default function TVDetail({ item, onClose, onPlay }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState(-1);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const detailRef = useRef(detail);
  detailRef.current = detail;
  const [playing, setPlaying] = useState(false);
  const gridRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.searchResolve(item.series_id).then((res) => {
      if (cancelled) return;
      if (!res?.success) { setError(res?.error || '剧集信息加载失败'); setLoading(false); return; }
      setDetail(res.data);
      setLoading(false);
    }).catch((e) => {
      if (!cancelled) { setError(e.message || '剧集信息加载失败'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [item.series_id]);

  useEffect(() => {
    if (focus >= 0) gridRef.current?.children[focus]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [focus]);

  const playEpisode = async (vidIndex) => {
    if (playing) return;
    setPlaying(true);
    try { await onPlay?.(item.series_id, vidIndex); }
    finally { setPlaying(false); }
  };

  const playFirst = () => {
    const eps = detailRef.current?.episodes || [];
    const first = eps.find(e => !e.locked) || eps[0];
    if (first) playEpisode(first.vid_index);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (document.body.classList.contains('tv-update-open')) return; // 更新弹窗优先接管遥控器
      event.stopPropagation();
      const { key } = event;
      const eps = detailRef.current?.episodes || [];
      if (key === 'Backspace' || key === 'Escape') { event.preventDefault(); onClose?.(); return; }
      if (key === 'ArrowLeft') {
        event.preventDefault();
        if (focusRef.current === -1) return;
        if (focusRef.current % COLS === 0) setFocus(-1);
        else setFocus(i => i - 1);
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        if (focusRef.current === -1) { if (eps.length) setFocus(0); }
        else setFocus(i => Math.min(i + 1, eps.length - 1));
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        if (focusRef.current >= 0 && focusRef.current < COLS) setFocus(-1);
        else if (focusRef.current >= COLS) setFocus(i => i - COLS);
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        if (focusRef.current === -1) { if (eps.length) setFocus(0); }
        else setFocus(i => Math.min(i + COLS, eps.length - 1));
      } else if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        if (focusRef.current === -1) playFirst();
        else {
          const ep = eps[focusRef.current];
          if (ep && !ep.locked) playEpisode(ep.vid_index);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, onPlay, playing]);

  const episodes = detail?.episodes || [];
  const cover = detail?.cover || item.cover;

  return (
    <div className="tv-sheet-mask" onClick={onClose}>
      <div className="tv-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tv-sheet-top">
          <div className="tv-sheet-art">
            {cover
              ? <img src={cover} alt="" />
              : <span className="tv-list-fallback">{item.series_title?.slice(0, 1)}</span>}
          </div>
          <div className="tv-sheet-info">
            <h2 className="tv-sheet-title">{item.series_title}</h2>
            <p className="tv-sheet-meta">
              {loading ? '正在读取分集' : error ? error : `共 ${episodes.length} 集`}
            </p>
            {detail?.description && <p className="tv-sheet-desc">{detail.description}</p>}
            <button
              type="button"
              className={`tv-btn tv-btn--primary tv-play-action ${focus === -1 ? 'is-focus' : ''}`}
              disabled={loading || !!error || playing}
              onMouseEnter={() => { if (!hoverAllowed()) return; setFocus(-1); }}
              onClick={playFirst}
            >
              <Play size={18} strokeWidth={1.7} />
              <span>{playing ? '正在打开' : '播放第 1 集'}</span>
            </button>
            <p className="tv-sheet-hint">方向键选集 · 回车播放 · 返回键退出</p>
          </div>
        </div>
        {!!episodes.length && (
          <div className="tv-episode-grid" ref={gridRef}>
            {episodes.map((ep, i) => (
              <button
                key={ep.vid_index ?? i}
                type="button"
                className={`tv-episode ${ep.locked ? 'is-locked' : ''} ${focus === i ? 'is-focus' : ''}`}
                disabled={ep.locked || playing}
                onMouseEnter={() => { if (!hoverAllowed()) return; setFocus(i); }}
                onClick={() => !ep.locked && playEpisode(ep.vid_index)}
              >
                {ep.locked ? '—' : (ep.vid_index ?? i + 1)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
