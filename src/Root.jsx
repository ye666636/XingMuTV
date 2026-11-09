// 星幕剧场：单一形态应用（TV 版）。启动即进入大屏界面。
import React, { useEffect } from 'react';
import TVApp from './tv/TVApp';

export default function Root() {
  // TV 版需要最大化窗口。
  useEffect(() => {
    window.electronAPI?.setDisplayMode?.('tv')?.catch?.(() => {});
  }, []);

  return <TVApp />;
}
