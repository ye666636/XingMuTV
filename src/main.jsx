// 星幕剧场：界面入口。根组件 Root 负责模式选择页与 TV / 电脑 / 手机三端调度。
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
