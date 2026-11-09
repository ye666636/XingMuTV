// 星幕剧场：WebView 界面入口，启动即进入唯一的 TV 大屏界面。
import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from './Root';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { initializePosterSize } from './theme';

initializePosterSize();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
