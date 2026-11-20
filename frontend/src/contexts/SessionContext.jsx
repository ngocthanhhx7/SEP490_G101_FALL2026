import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { pendingSessionAdapter } from '../services/session-adapter.js';
import { SESSION_INVALIDATED_EVENT } from '../services/api-client.js';

const SessionContext = createContext(null);
import { isSingleRole } from '../utils/role-access.js';

function validateSession(result) {
  if (!['guest', 'authenticated', 'pending'].includes(result?.status)) throw new Error('Invalid session result');
  if (result.status === 'authenticated') {
    const roles = Array.isArray(result.user?.roles) ? result.user.roles : [result.user?.role];
    if (!isSingleRole(roles)) throw new Error('Invalid session role');
  }
  return result;
}

export function SessionProvider({ adapter = pendingSessionAdapter, foreground = false, children }) {
  const [session, setSession] = useState({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const resolution = useRef(null);
  const adapterRef = useRef(adapter);
  const [revalidation, setRevalidation] = useState('idle');
  const recheck = useRef(null);
  const blocked = useRef(false);
  adapterRef.current = adapter;
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    resolution.current = controller;
    recheck.current?.abort();
    recheck.current = null;
    blocked.current = false;
    setRevalidation('idle');
    setSession({ status: 'loading' });
    Promise.resolve().then(() => adapter.resolve({ signal: controller.signal }))
      .then((result) => {
        if (controller.signal.aborted || generation.current !== current) return;
        setSession(validateSession(result));
      }).catch(() => {
        if (!controller.signal.aborted && generation.current === current) setSession({ status: 'error' });
      });
    return () => controller.abort();
  }, [adapter, revision]);
  const invalidate = useCallback(() => {
    ++generation.current;
    resolution.current?.abort();
    recheck.current?.abort();
    recheck.current = null;
    blocked.current = false;
    setRevalidation('idle');
    setSession({ status: 'guest' });
  }, []);
  useEffect(() => {
    const handleInvalidated = () => invalidate();
    window.addEventListener(SESSION_INVALIDATED_EVENT, handleInvalidated);
    return () => window.removeEventListener(SESSION_INVALIDATED_EVENT, handleInvalidated);
  }, [invalidate]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  // A confirmed profile save may update presentation without unloading protected
  // routes or changing session identity, roles, credentials or permissions.
  const updateDisplayName = useCallback(profile => {
    if (typeof profile?.id !== 'string' || typeof profile.displayName !== 'string'
      || !profile.displayName.trim() || profile.displayName.length > 100) return;
    setSession(current => current.status === 'authenticated' && current.user?.id === profile.id
      ? { ...current, user: { ...current.user, displayName: profile.displayName } } : current);
  }, []);
  const revalidate = useCallback(async () => {
    if (session.status !== 'authenticated' || recheck.current) return;
    const current = generation.current;
    const controller = new AbortController();
    recheck.current = controller;
    blocked.current = true;
    setRevalidation('checking');
    try {
      const result = validateSession(await adapterRef.current.resolve({ signal: controller.signal }));
      if (controller.signal.aborted || generation.current !== current) return;
      if (result.status === 'pending') throw new Error('Session verification pending');
      blocked.current = false;
      setSession(previous => {
        const sameUser = result.status === 'authenticated'
          && previous.user?.id === result.user.id
          && (previous.user.roles ?? [previous.user.role])[0] === (result.user.roles ?? [result.user.role])[0]
          && previous.user.displayName === result.user.displayName;
        return sameUser ? previous : result;
      });
      setRevalidation('idle');
    } catch {
      if (!controller.signal.aborted && generation.current === current) setRevalidation('error');
    } finally {
      if (recheck.current === controller) recheck.current = null;
    }
  }, [session.status]);
  useEffect(() => {
    if (!foreground || session.status !== 'authenticated') return;
    const visible = () => { if (!document.hidden) revalidate(); };
    const resume = event => { if (event.persisted) visible(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    window.addEventListener('pageshow', resume);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
      window.removeEventListener('pageshow', resume);
    };
  }, [foreground, revalidate, session.status]);
  useEffect(() => () => recheck.current?.abort(), []);

  const getCsrfToken = useCallback(() => blocked.current ? null : adapterRef.current.getCsrfToken?.() ?? null, []);
  const requestLoginOtp = useCallback(async (input) => {
    const action = adapterRef.current.requestLoginOtp;
    if (typeof action !== 'function') {
      const error = new Error('Login is not available in this session adapter');
      error.code = 'LOGIN_NOT_AVAILABLE';
      throw error;
    }
    return action(input);
  }, []);
  const login = useCallback(async (input) => {
    const action = adapterRef.current.login;
    if (typeof action !== 'function') {
      const error = new Error('Login is not available in this session adapter');
      error.code = 'LOGIN_NOT_AVAILABLE';
      throw error;
    }
    const current = ++generation.current;
    resolution.current?.abort();
    const result = validateSession(await action(input));
    if (generation.current !== current) return { status: 'guest' };
    if (result.status === 'authenticated') setSession(result);
    return result;
  }, []);
  const logout = useCallback(async () => {
    const logoutAction = adapterRef.current.logout;
    if (typeof logoutAction !== 'function') {
      const error = new Error('Logout is not available in this session adapter');
      error.code = 'LOGOUT_NOT_AVAILABLE';
      throw error;
    }
    ++generation.current;
    resolution.current?.abort();
    await logoutAction();
    invalidate();
  }, [invalidate]);
  const value = useMemo(() => ({ ...session, invalidate, refresh, revalidation, revalidate, updateDisplayName, getCsrfToken,
    requestLoginOtp, login, logout }),
  [session, invalidate, refresh, revalidation, revalidate, updateDisplayName, getCsrfToken, requestLoginOtp, login, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession({ optional = false } = {}) {
  const session = useContext(SessionContext);
  if (!session && optional) return { status: 'guest', user: null };
  if (!session) throw new Error('SessionProvider required');
  return session;
}
