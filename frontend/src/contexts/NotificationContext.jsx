import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from './SessionContext.jsx';
import { createApiClient } from '../services/api-client.js';
import { createNotificationsApi } from '../services/notifications-api.js';

const NotificationContext = createContext(null);
const EMPTY = Object.freeze({ status: 'pending', items: [], unreadCount: null, toast: null });

export function NotificationProvider({ children }) {
  const session = useSession();
  const identity = session.status === 'authenticated' ? session.user?.id : null;
  const scope = identity ? identity + ':' + (session.user.roles || [session.user.role]).slice().sort().join(',') : 'guest';
  return <NotificationSession key={scope} active={Boolean(identity)} session={session}>{children}</NotificationSession>;
}

function NotificationSession({ children, active, session }) {
  const [state, setState] = useState(EMPTY);
  const [revision, setRevision] = useState(0);
  const baseline = useRef(null);
  const seen = useRef(new Set());
  const readKeys = useRef(new Map());
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const dismissToast = useCallback(() => setState(current => ({ ...current, toast: null })), []);
  const api = useMemo(() => {
    let request;
    return createNotificationsApi({ request: (...args) => {
      request ??= createApiClient({ getCsrfToken: session.getCsrfToken, onUnauthorized: session.invalidate });
      return request(...args);
    } });
  }, [session.getCsrfToken, session.invalidate]);

  useEffect(() => {
    if (!active) return undefined;
    let disposed = false, inFlight = false, queued = false;
    const controller = new AbortController();
    async function load() {
      if (document.hidden) return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      try {
        const response = await api.list({ limit: 5, signal: controller.signal });
        if (disposed) return;
        if (!Array.isArray(response.data?.items)) throw new Error('Invalid notification response');
        const items = response.data.items;
        const newest = items.reduce((value, item) => Math.max(value, Date.parse(item.createdAt) || 0), 0);
        // First load establishes history; only subsequently discovered unread records announce.
        const incoming = baseline.current === null ? [] : items.filter(item => !item.readAt
          && !seen.current.has(item.id) && (Date.parse(item.createdAt) || 0) >= baseline.current);
        baseline.current = Math.max(baseline.current ?? 0, newest);
        for (const item of items) seen.current.add(item.id);
        if (seen.current.size > 500) seen.current = new Set(items.map(item => item.id));
        setState(current => ({ status: 'success', items,
          unreadCount: response.data.unreadCount,
          toast: incoming.length ? { ...incoming[0], additional: incoming.length - 1 } : current.toast,
          readError: null }));
      } catch (error) {
        if (!disposed && !controller.signal.aborted) setState(current => ({ ...current,
          status: error.status === 403 ? 'forbidden' : 'error' }));
      } finally {
        inFlight = false;
        if (queued && !disposed) { queued = false; load(); }
      }
    }
    load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener('pwc:notifications-changed', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      disposed = true; controller.abort(); window.clearInterval(timer);
      window.removeEventListener('pwc:notifications-changed', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [active, api, revision]);

  const markRead = useCallback(async item => {
    if (!active || item.readAt) return;
    let key = readKeys.current.get(item.id);
    if (!key) { key = globalThis.crypto.randomUUID(); readKeys.current.set(item.id, key); }
    try {
      const response = await api.markRead(item.id, key);
      if (response.pending) throw new Error('Receipt pending');
      readKeys.current.delete(item.id);
      window.dispatchEvent(new window.Event('pwc:notifications-changed'));
    } catch {
      setState(current => ({ ...current, readError: 'Chưa xác nhận đã đọc. Bạn có thể thử lại trong trang thông báo.' }));
    }
  }, [active, api]);
  const value = useMemo(() => ({ ...state, refresh, dismissToast, markRead }), [state, refresh, dismissToast, markRead]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext) || EMPTY;
}
