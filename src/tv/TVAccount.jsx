// 星幕剧场 TV 版：红果账号。扫码登录、APP 观看记录同步、退出登录。
// 登录接口与电脑版一致（getAccountStatus / startAccountLogin / pollAccountLogin / getAccountHistory …）。
import React, { useEffect, useRef, useState } from 'react';
import { User, RefreshCw, ChevronRight } from '../components/icons';
import { hoverAllowed } from './focusGuard';

export default function TVAccount({ zoneActive, onRequestRail, onPlay }) {
  const [account, setAccount] = useState(null);
  const [rows, setRows] = useState([]);
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [zone, setZone] = useState('actions');
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const [actionIndex, setActionIndex] = useState(0);
  const actionIndexRef = useRef(0);
  actionIndexRef.current = actionIndex;
  const [listIndex, setListIndex] = useState(0);
  const listIndexRef = useRef(0);
  listIndexRef.current = listIndex;
  const request = useRef(0);
  const historyRequest = useRef(0);
  const generation = useRef(0);
  const pollTimer = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const listRef = useRef(null);

  const loadHistory = async (refresh = false) => {
    const version = ++historyRequest.current;
    setHistoryLoading(true);
    try {
      const result = await window.electronAPI.getAccountHistory?.({ refresh });
      if (version !== historyRequest.current) return;
      if (!result?.success) throw new Error(result?.error || 'APP 观看记录加载失败');
      setRows(result.signedIn ? result.results || [] : []);
      if (result.warning) setStatus(result.warning);
    } catch (failure) {
      if (version === historyRequest.current) setError(failure.message || 'APP 观看记录加载失败，请重试');
    } finally {
      if (version === historyRequest.current) setHistoryLoading(false);
    }
  };

  const load = async () => {
    const version = ++request.current;
    try {
      const result = await window.electronAPI.getAccountStatus?.();
      if (version !== request.current) return;
      if (!result?.success) throw new Error(result?.error || '账号状态读取失败');
      setAccount(result.account || null);
      setError(result.error || '');
      if (result.signedIn) await loadHistory();
      else { historyRequest.current++; setRows([]); }
    } catch (failure) {
      if (version === request.current) setError(failure.message || '账号状态读取失败，请重试');
    } finally {
      if (version === request.current) setLoading(false);
    }
  };

  const schedulePoll = (loginId, token) => {
    clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(async () => {
      if (token !== generation.current) return;
      try {
        const result = await window.electronAPI.pollAccountLogin?.(loginId);
        if (token !== generation.current) return;
        if (!result?.success) throw new Error(result?.error || '扫码状态读取失败');
        if (result.status === 'signed-in') {
          generation.current++;
          setBusy(false); setQr(null); setAccount(result.account || null);
          setStatus(result.storageWarning || '登录成功，已同步 APP 观看记录');
          loadHistory();
          return;
        }
        if (result.status === 'cancelled') { setBusy(false); setQr(null); setStatus('已取消'); return; }
        if (result.status === 'expired') { setBusy(false); setQr(null); setError('二维码已过期，请重新获取'); return; }
        setStatus('等待手机确认');
        schedulePoll(loginId, token);
      } catch (failure) {
        if (token === generation.current) {
          setBusy(false); setQr(null);
          setError(failure.message || '扫码登录未完成，请重试');
        }
      }
    }, 1000);
  };

  const beginLogin = async () => {
    const token = ++generation.current;
    setBusy(true); setError(''); setStatus('正在获取二维码');
    try {
      const result = await window.electronAPI.startAccountLogin?.();
      if (token !== generation.current) return;
      if (!result?.success) throw new Error(result?.error || '二维码获取失败');
      setQr({ id: result.loginId, image: result.image });
      setStatus(`手机红果 App 扫码确认，二维码约 ${result.expiresIn} 秒有效`);
      schedulePoll(result.loginId, token);
    } catch (failure) {
      if (token === generation.current) {
        setBusy(false); setQr(null);
        setError(failure.message || '二维码获取失败，请重试');
      }
    }
  };

  const cancelLogin = async () => {
    generation.current++;
    clearTimeout(pollTimer.current);
    const id = qr?.id;
    setQr(null); setBusy(false); setStatus('');
    if (id) await window.electronAPI.cancelAccountLogin?.(id).catch(() => {});
  };

  const logout = async () => {
    setBusy(true); setError(''); setStatus('');
    try {
      const result = await window.electronAPI.logoutAccount?.();
      if (!result?.success) throw new Error(result?.error || '退出账号失败');
      historyRequest.current++;
      setAccount(null); setRows([]);
      setStatus('已退出账号，本机记录不受影响');
    } catch (failure) { setError(failure.message || '退出账号失败，请重试'); }
    finally { setBusy(false); }
  };

  const openWebLogin = async () => {
    try {
      const result = await window.electronAPI.openAccountWebLogin?.();
      if (!result?.success) throw new Error(result?.error || '打开官网登录失败');
    } catch (failure) { setError(failure.message); }
  };

  const openRow = async (row) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await window.electronAPI.playAccountHistory?.(row.series_id);
      if (!result?.success) throw new Error(result?.error || '打开观看记录失败');
    } catch (failure) { setError(failure.message || '打开观看记录失败，请重试'); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => window.electronAPI.onAccountUpdated?.(result => {
    if (result?.error) setError(result.error);
    else load();
  }), []);
  useEffect(() => () => {
    generation.current++;
    clearTimeout(pollTimer.current);
    request.current++;
    historyRequest.current++;
  }, []);

  const actions = account
    ? [
        { id: 'refresh', label: '刷新记录', icon: RefreshCw, run: async () => { setBusy(true); try { await loadHistory(true); } finally { setBusy(false); } } },
        { id: 'logout', label: '退出账号', run: logout },
      ]
    : qr
      ? [{ id: 'cancel', label: '取消扫码', run: cancelLogin }]
      : [
          { id: 'login', label: busy ? '正在获取二维码' : '扫码登录', run: beginLogin },
          { id: 'web', label: '官网登录', run: openWebLogin },
        ];

  useEffect(() => {
    if (!zoneActive) return undefined;
    const onKeyDown = (event) => {
      const { key } = event;
      const acts = actions.length;
      if (zoneRef.current === 'actions') {
        if (key === 'ArrowLeft') { event.preventDefault(); if (actionIndexRef.current === 0) onRequestRail?.(); else setActionIndex(i => i - 1); }
        else if (key === 'ArrowRight') { event.preventDefault(); setActionIndex(i => Math.min(i + 1, acts - 1)); }
        else if (key === 'ArrowDown') { event.preventDefault(); if (rowsRef.current.length) { setZone('list'); setListIndex(0); } }
        else if (key === 'ArrowUp') { event.preventDefault(); onRequestRail?.(); }
        else if (key === 'Enter' || key === ' ') { event.preventDefault(); actions[actionIndexRef.current]?.run?.(); }
        return;
      }
      const count = rowsRef.current.length;
      if (key === 'ArrowUp') { event.preventDefault(); if (listIndexRef.current === 0) setZone('actions'); else setListIndex(i => i - 1); }
      else if (key === 'ArrowDown') { event.preventDefault(); setListIndex(i => Math.min(i + 1, count - 1)); }
      else if (key === 'ArrowLeft') { event.preventDefault(); }
      else if (key === 'Enter' || key === ' ') { event.preventDefault(); const row = rowsRef.current[listIndexRef.current]; if (row) openRow(row); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneActive, account, qr, busy, onRequestRail]);

  useEffect(() => {
    if (zone === 'list') listRef.current?.children[listIndex]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [listIndex, zone]);

  if (loading) return <div className="tv-page"><div className="tv-hint-line">正在读取账号</div></div>;

  return (
    <div className="tv-page tv-account">
      <header className="tv-page-head">
        <div>
          <h1 className="tv-page-title">{account ? account.nickname || '红果账号' : '红果账号'}</h1>
          <p className="tv-page-sub">
            {account
              ? `已登录 · APP 观看记录 ${rows.length} 部`
              : '扫码登录后，可在电视上同步手机里的观看记录'}
          </p>
        </div>
      </header>

      {account && (
        <div className="tv-account-actions">
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                disabled={busy}
                className={`tv-btn ${action.id === 'refresh' ? 'tv-btn--primary' : ''} ${zoneActive && zone === 'actions' && actionIndex === i ? 'is-focus' : ''}`}
                onMouseEnter={() => { if (!hoverAllowed()) return; setZone('actions'); setActionIndex(i); }}
                onClick={() => action.run?.()}
              >
                {Icon && <Icon size={17} strokeWidth={1.7} />}
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {status && <p className="tv-account-status" role="status">{status}</p>}
      {error && <div className="tv-banner" role="alert"><span>{error}</span></div>}

      {!account && (
        <div className="tv-login-panel">
          <div className="tv-login-card">
            {qr ? (
              <>
                <div className="tv-qr"><img src={qr.image} alt="红果登录二维码" /></div>
                <p className="tv-login-note">手机红果 App › 我的 › 扫一扫</p>
              </>
            ) : (
              <>
                <span className="tv-login-icon"><User size={28} strokeWidth={1.4} /></span>
                <h2 className="tv-login-title">扫码登录红果账号</h2>
                <p className="tv-login-note">用手机红果 App 扫码，登录后在电视上接着看</p>
              </>
            )}
            <div className="tv-login-actions">
              {actions.map((action, i) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={busy && action.id !== 'cancel'}
                  className={`tv-btn ${action.id === 'login' ? 'tv-btn--primary' : ''} ${zoneActive && zone === 'actions' && actionIndex === i ? 'is-focus' : ''}`}
                  onMouseEnter={() => { if (!hoverAllowed()) return; setZone('actions'); setActionIndex(i); }}
                  onClick={() => action.run?.()}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {account && (
        <>
          <div className="tv-section-head">
            <h2>APP 观看记录</h2>
            <span>{historyLoading ? '同步中' : `最近 ${rows.length} 部`}</span>
          </div>
          {historyLoading && !rows.length && <div className="tv-hint-line">正在同步观看记录</div>}
          {!historyLoading && !rows.length && <div className="tv-hint-line">APP 还没有观看记录</div>}
          {!!rows.length && (
            <ul className="tv-account-list" ref={listRef}>
              {rows.map((row, i) => (
                <li key={row.series_id}>
                  <button
                    type="button"
                    className={`tv-list-row ${zoneActive && zone === 'list' && listIndex === i ? 'is-focus' : ''}`}
                    onMouseEnter={() => { if (!hoverAllowed()) return; setZone('list'); setListIndex(i); }}
                    onClick={() => openRow(row)}
                  >
                    <span className="tv-list-art">
                      {row.cover ? <img src={row.cover} alt="" loading="lazy" /> : <span className="tv-list-fallback">{row.series_title?.slice(0, 1)}</span>}
                    </span>
                    <span className="tv-list-copy">
                      <span className="tv-list-title">{row.series_title}</span>
                      <span className="tv-list-meta">看到第 {row.vid_index || '?'} 集{row.total ? ` / 共 ${row.total} 集` : ''}</span>
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
        </>
      )}
    </div>
  );
}
