// 星幕剧场 TV 版：设置。遥控器操作说明与版本信息。
import React, { useState, useEffect, useRef } from 'react';
import { hoverAllowed } from './focusGuard';

export default function TVSettings({ zoneActive, onRequestRail, appInfo }) {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;

  const rows = [
    { id: 'shortcut', title: '遥控器操作', desc: '方向键移动 · 回车确认 · 返回键退出 · ↑ ↓ 切集' },
    { id: 'version', title: '版本', desc: appInfo?.version ? `v${appInfo.version}` : 'v1.0.3' },
    { id: 'diagnose', title: '网络诊断', desc: '连不上网 / 搜不到节目时点这里，显示 DNS、TLS、设备时间检测结果' },
    { id: 'update', title: '检查更新', desc: '立即检查 GitHub 上的新版本 · 后台每 5 分钟自动检查' },
    { id: 'about', title: '关于', desc: '星幕剧场 · 家庭大屏短剧播放器' },
  ];

  const checkUpdate = () => window.dispatchEvent(new Event('hongguo-check-app-update'));
  const diagnose = () => window.electronAPI?.diagnoseNetwork?.();
  const actionFor = (id) => {
    if (id === 'diagnose') return diagnose;
    if (id === 'update') return checkUpdate;
    return undefined;
  };

  useEffect(() => {
    if (!zoneActive) return undefined;
    const onKeyDown = (event) => {
      const { key } = event;
      if (key === 'ArrowUp') { event.preventDefault(); if (indexRef.current === 0) onRequestRail?.(); else setIndex(i => i - 1); }
      else if (key === 'ArrowDown') { event.preventDefault(); setIndex(i => Math.min(i + 1, rows.length - 1)); }
      else if (key === 'ArrowLeft') { event.preventDefault(); onRequestRail?.(); }
      else if (key === 'Enter' || key === ' ') {
        const action = actionFor(rows[indexRef.current]?.id);
        if (action) { event.preventDefault(); action(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneActive, onRequestRail]);

  return (
    <div className="tv-page tv-settings">
      <header className="tv-page-head">
        <div>
          <h1 className="tv-page-title">设置</h1>
          <p className="tv-page-sub">操作说明与版本</p>
        </div>
      </header>
      <ul className="tv-settings-list">
        {rows.map((row, i) => (
          <li
            key={row.id}
            className={`tv-settings-row ${zoneActive && index === i ? 'is-focus' : ''} ${actionFor(row.id) ? 'is-action' : ''}`}
            onMouseEnter={() => { if (!hoverAllowed()) return; setIndex(i); }}
            onClick={actionFor(row.id)}
          >
            <span className="tv-settings-title">{row.title}</span>
            <span className="tv-settings-desc">{row.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
