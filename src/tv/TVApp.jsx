// 星幕剧场 TV 版：大屏外壳。
// 结构：左侧导航（首页 / 搜索 / 观看记录 / 账号 / 设置）+ 右侧内容区。
// 操作：方向键移动焦点，回车确认，Backspace 返回（遥控器返回键）。
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Home, Search, Clock, User, Settings } from '../components/icons';
import Player from '../components/Player';
import TVHome from './TVHome';
import TVSearch from './TVSearch';
import TVHistory from './TVHistory';
import TVAccount from './TVAccount';
import TVSettings from './TVSettings';
import TVDetail from './TVDetail';
import { installKeyboardMarker, hoverAllowed } from './focusGuard';
import './tv.css';

const NAV = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'history', label: '观看记录', icon: Clock },
  { id: 'account', label: '账号', icon: User },
  { id: 'settings', label: '设置', icon: Settings },
];

export default function TVApp() {
  const [page, setPage] = useState('home');
  const pageRef = useRef(page);
  pageRef.current = page;
  const [zone, setZone] = useState('content');
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const [railIndex, setRailIndex] = useState(0);
  const railIndexRef = useRef(0);
  railIndexRef.current = railIndex;
  const [detailItem, setDetailItem] = useState(null);
  const detailRef = useRef(null);
  detailRef.current = detailItem;
  const [playerTarget, setPlayerTarget] = useState(null);
  const [appInfo, setAppInfo] = useState(null);

  useEffect(() => {
    window.electronAPI.getAppInfo?.().then(setAppInfo).catch(() => {});
  }, []);

  useEffect(() => installKeyboardMarker(), []);

  // 主进程导航指令（播放、跳转观看记录等）
  useEffect(() => {
    if (!window.electronAPI.onNavigate) return undefined;
    return window.electronAPI.onNavigate((data) => {
      if (!data?.page) return;
      if (data.page === 'player') {
        if (data.payload) setPlayerTarget({ ...data.payload, ts: Date.now() });
        setDetailItem(null);
        setPage('player');
        setZone('content');
      }
    });
  }, []);

  const openRail = useCallback(() => setZone('rail'), []);

  // 全局返回键
  useEffect(() => {
    const onKeyDown = (event) => {
      if (detailRef.current) return;
      if (event.key !== 'Backspace' && event.key !== 'Escape') return;
      if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
      event.preventDefault();
      if (pageRef.current === 'player') { setPage('home'); return; }
      if (zoneRef.current === 'content') { setZone('rail'); return; }
      if (pageRef.current !== 'home') {
        setPage('home');
        setRailIndex(0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 导航栏按键
  useEffect(() => {
    const onKeyDown = (event) => {
      if (zoneRef.current !== 'rail' || detailRef.current) return;
      if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
      const { key } = event;
      if (key === 'ArrowUp') {
        event.preventDefault();
        setRailIndex(i => (i - 1 + NAV.length) % NAV.length);
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        setRailIndex(i => (i + 1) % NAV.length);
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        setZone('content');
      } else if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        const item = NAV[railIndexRef.current];
        if (!item) return;
        setPage(item.id);
        setZone('content');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const playSeries = useCallback(async (seriesId, vidIndex) => {
    try {
      let result = await window.electronAPI.playSeries({ seriesId, vidIndex, resume: vidIndex == null });
      if (!result?.success && result?.code === 'SERIES_NOT_FOUND') {
        const resolved = await window.electronAPI.searchResolve(seriesId);
        if (!resolved?.success) throw new Error(resolved?.error || '加载剧集失败，请重试');
        result = await window.electronAPI.playSeries({ seriesId, vidIndex, resume: vidIndex == null });
      }
      if (!result?.success) throw new Error(result?.error || '打开播放失败，请重试');
      setDetailItem(null);
    } catch (error) {
      window.alert?.(error.message || '播放失败，请重试');
    }
  }, []);

  const renderContent = () => {
    switch (page) {
      case 'search':
        return <TVSearch zoneActive={zone === 'content'} onRequestRail={openRail} onOpenDetail={setDetailItem} />;
      case 'history':
        return <TVHistory zoneActive={zone === 'content'} onRequestRail={openRail} onPlay={playSeries} />;
      case 'account':
        return <TVAccount zoneActive={zone === 'content'} onRequestRail={openRail} onPlay={playSeries} />;
      case 'settings':
        return <TVSettings zoneActive={zone === 'content'} onRequestRail={openRail} appInfo={appInfo} />;
      case 'player':
        return (
          <div className="tv-player">
            <Player
              portrait={false}
              episodesOpen={false}
              setEpisodesOpen={() => {}}
              actionsHidden
              active={page === 'player'}
              target={playerTarget}
              onSeriesSelected={() => {}}
              onFloatingChange={() => {}}
              onNavigate={() => setPage('home')}
            />
            <div className="tv-player-hint">返回 返回列表 · 空格 播放暂停 · ← → 快退快进 · ↑ ↓ 上下一集</div>
          </div>
        );
      case 'home':
      default:
        return <TVHome zoneActive={zone === 'content'} onRequestRail={openRail} onOpenDetail={setDetailItem} />;
    }
  };

  const current = NAV.find(item => item.id === page);

  return (
    <div className={`tv-app ${page === 'player' ? 'is-playing' : ''}`}>
      <aside className={`tv-rail ${zone === 'rail' ? 'is-focused' : ''}`}>
        <div className="tv-brand">
          <span className="tv-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8L12 3z" />
            </svg>
          </span>
          <span className="tv-brand-name">星幕剧场</span>
        </div>
        <nav className="tv-nav">
          {NAV.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`tv-nav-item ${page === item.id ? 'is-current' : ''} ${zone === 'rail' && railIndex === i ? 'is-focus' : ''}`}
                onMouseEnter={() => { if (!hoverAllowed()) return; setRailIndex(i); }}
                onClick={() => { setRailIndex(i); setPage(item.id); setZone('content'); }}
              >
                <Icon size={19} strokeWidth={1.6} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="tv-rail-foot">
          {appInfo?.version ? `v${appInfo.version}` : ''}
        </div>
      </aside>
      <main className="tv-content">
        {renderContent()}
      </main>
      {detailItem && (
        <TVDetail item={detailItem} onClose={() => setDetailItem(null)} onPlay={playSeries} />
      )}
    </div>
  );
}
