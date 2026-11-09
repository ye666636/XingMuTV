import React, { useEffect, useRef, useState } from 'react';
import { X } from './icons';
import './AppUpdateNotice.css';

export default function AppUpdateNotice({ tvMode = false }) {
  const [release, setRelease] = useState(null);
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState({ supported: false, reason: '正在读取更新方式…', status: 'idle', percent: 0 });
  const currentState = useRef(state);
  const enabled = useRef(true);
  const actionPending = useRef(false);
  const actionGeneration = useRef(0);
  const openingRelease = useRef(false);
  const checkPending = useRef(false);
  const requestedManually = useRef(false);
  const dismissed = useRef(new Set());
  const checkNow = useRef(null);
  const closedAt = useRef(0);
  const dialogRef = useRef(null);
  const focusRef = useRef(0);

  useEffect(() => {
    let generation = 0, stateRevision = 0, active = true;
    checkPending.current = false;
    const receiveState = next => {
      if (!active || !next) return;
      stateRevision++;
      currentState.current = next;
      setState(next);
    };
    const check = async (manual = false) => {
      if (manual) { requestedManually.current = true; setVisible(true); setError(''); dismissed.current.clear(); }
      if (checkPending.current || ['checking', 'downloading', 'downloaded', 'installing'].includes(currentState.current.status)) return;
      checkPending.current = true;
      requestedManually.current = manual;
      const request = ++generation;
      const closure = closedAt.current;
      setChecking(true);
      try {
        const result = await window.electronAPI.checkAppUpdate();
        if (!active || request !== generation) return;
        enabled.current = result?.enabled === true;
        if (!enabled.current) {
          setRelease(null);
          if (requestedManually.current) setError(result?.error || '更新检测已关闭，请在设置中开启并保存后重试。');
          else setVisible(false);
          return;
        }
        if (result.error) {
          setRelease(null);
          setError(result.error);
          return;
        }
        setError('');
        setRelease(result.release || null);
        if (result.release) {
          if (closure !== closedAt.current) dismissed.current.add(result.release.version);
          else if (!dismissed.current.has(result.release.version)) setVisible(true);
        }
      } catch {
        if (active && request === generation) { setRelease(null); setError('检查更新失败，请确认网络连接后重试。'); }
      } finally {
        if (active && request === generation) { checkPending.current = false; setChecking(false); }
      }
    };
    checkNow.current = check;
    const manualCheck = () => check(true);
    window.addEventListener('hongguo-check-app-update', manualCheck);
    const unsubscribeState = window.electronAPI.onAppUpdateState(receiveState);
    const unsubscribePreference = window.electronAPI.onAppUpdatePreference(value => {
      generation++;
      checkPending.current = false;
      setChecking(false);
      enabled.current = value;
      if (value) check();
      else { actionGeneration.current++; actionPending.current = false; setPending(false); setVisible(false); setError(''); }
    });
    const revision = stateRevision;
    window.electronAPI.getAppUpdateState().then(next => {
      if (revision === stateRevision) receiveState(next);
    }).catch(() => {
      if (revision === stateRevision) receiveState({ supported: false, reason: '无法读取应用内更新状态，可前往 GitHub 手动下载。', status: 'idle', percent: 0 });
    });
    check();
    // 星幕剧场：GitHub 不会主动推送，客户端每 5 分钟轮询一次；窗口重新可见/获得焦点时补查，
    // 这样在 GitHub 发完新版后最多 5 分钟（切回应用时立即）就能弹出更新卡片。
    const timer = setInterval(() => check(), 5 * 60 * 1000);
    const recheck = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      active = false;
      generation++;
      checkNow.current = null;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
      window.removeEventListener('hongguo-check-app-update', manualCheck);
      unsubscribeState();
      unsubscribePreference();
    };
  }, []);

  const close = () => {
    closedAt.current++;
    if (release) dismissed.current.add(release.version);
    setVisible(false);
    setError('');
  };

  // TV 遥控器：弹窗出现时接管键盘，方向键切按钮、回车确认、返回键关闭，
  // 同时挡住 TV 外壳的全局按键处理，避免焦点被导航栏抢走。
  useEffect(() => {
    if (!tvMode || !visible) return undefined;
    document.body.classList.add('tv-update-open');
    const buttons = () => Array.from(dialogRef.current?.querySelectorAll('.app-update-actions button:not(:disabled)') || []);
    const paint = () => {
      const list = buttons();
      focusRef.current = Math.min(focusRef.current, Math.max(0, list.length - 1));
      list.forEach((button, i) => button.classList.toggle('is-focus', i === focusRef.current));
      list[focusRef.current]?.focus({ preventScroll: true });
    };
    paint();
    const onKeyDown = event => {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      const list = buttons();
      if (!list.length || !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Enter' || event.key === ' ') { list[focusRef.current]?.click(); return; }
      const step = (event.key === 'ArrowRight' || event.key === 'ArrowDown') ? 1 : -1;
      focusRef.current = (focusRef.current + step + list.length) % list.length;
      paint();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.classList.remove('tv-update-open');
      window.removeEventListener('keydown', onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvMode, visible, state.status, release]);

  const act = async kind => {
    if (kind === 'openAppUpdate') {
      if (!enabled.current || openingRelease.current) return;
      openingRelease.current = true;
      try {
        const result = await window.electronAPI.openAppUpdate();
        if (!result?.success && enabled.current) setError(result?.error || '无法打开发布页，请稍后重试。');
      } catch { if (enabled.current) setError('无法打开发布页，请稍后重试。'); }
      finally { openingRelease.current = false; }
      return;
    }
    const cancelling = kind === 'cancelAppUpdate';
    if (!enabled.current) return;
    if (cancelling) {
      if (actionPending.current === 'cancelAppUpdate' || !['checking', 'downloading'].includes(currentState.current.status) && actionPending.current !== 'downloadAppUpdate') return;
    } else if (actionPending.current || checkPending.current || ['checking', 'downloading', 'installing'].includes(currentState.current.status)) return;
    const request = ++actionGeneration.current;
    actionPending.current = kind;
    setPending(true);
    setError('');
    try {
      const result = await window.electronAPI[kind]();
      if (request !== actionGeneration.current) return;
      if (result?.state) { currentState.current = result.state; setState(result.state); }
      if (!result?.success && enabled.current) setError(result?.error || '更新操作失败，请稍后重试。');
    } catch {
      if (request === actionGeneration.current && enabled.current) setError('更新操作失败，请确认网络连接后重试。');
    } finally { if (request === actionGeneration.current) { actionPending.current = false; setPending(false); } }
  };

  if (!visible) return null;
  const downloading = state.status === 'downloading';
  const downloaded = state.status === 'downloaded' || state.status === 'error' && state.downloaded === true;
  const installing = state.status === 'installing';
  const busy = pending || checking || downloading || installing || state.status === 'checking';
  const version = (downloading || downloaded || installing || state.status === 'error') ? state.version || release?.version : release?.version;
  const updateError = error || state.error;
  const percent = Math.max(0, Math.min(100, Math.round(state.percent || 0)));
  const title = checking ? '正在检查更新…' : installing ? '正在重启安装…' : downloaded ? `新版 v${version} 已下载` : downloading ? `正在下载 v${version}` : version ? `发现新版本 v${version}` : '检查更新';
  return <section className="app-update-notice" ref={dialogRef} role="dialog" aria-label="软件更新" aria-describedby="app-update-description" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <button type="button" className="icon-btn app-update-close" aria-label="关闭更新提醒" title="关闭更新提醒" onClick={close}><X size={18} /></button>
    <h2 aria-live="polite">{title}</h2>
    <p id="app-update-description">{checking ? '正在查询正式新版，请稍候。' : installing ? '正在打开系统安装器…' : downloaded ? '新安装包已下载，点击后由系统安装器打开。首次安装需在系统设置里允许「安装未知来源应用」。' : downloading ? '关闭提醒后继续下载，下载完成点「立即安装」。' : version ? '下载新版安装包，完成后由系统安装器打开。关闭提醒可继续使用当前版本。' : updateError ? '可稍后重新检查。' : '已是最新版本。'}</p>
    {downloading && <div className="app-update-progress"><progress max="100" value={percent} aria-label="更新下载进度" /><span>{percent}%</span></div>}
    <div className="app-update-actions">
    {(version || downloaded) && <button type="button" className="btn btn-primary" disabled={busy || !enabled.current} onClick={() => act(downloaded ? 'installAppUpdate' : state.supported ? 'downloadAppUpdate' : 'openAppUpdate')}>
      {installing ? '正在重启…' : downloading ? '正在下载…' : pending ? '请稍候…' : downloaded ? '立即安装' : state.supported ? '下载更新' : '前往 GitHub 下载'}
    </button>}
    {(!version || updateError) && !busy && <button type="button" className="btn btn-outline" onClick={() => checkNow.current?.(true)}>重新检查</button>}
    {(downloading || state.status === 'checking' || pending && actionPending.current === 'downloadAppUpdate') && <button type="button" className="btn btn-outline" disabled={actionPending.current === 'cancelAppUpdate' || !enabled.current} onClick={() => act('cancelAppUpdate')}>取消下载</button>}
    {(state.supported || !version) && <button type="button" className="btn btn-outline" disabled={!enabled.current} onClick={() => act('openAppUpdate')}>前往发布页手动下载</button>}
    </div>
    {updateError && <p role="alert">{updateError}</p>}
  </section>;
}
