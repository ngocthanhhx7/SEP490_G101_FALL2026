import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { pendingSessionAdapter } from '../services/session-adapter.js';

const SessionContext = createContext(null);
const ROLES = ['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'];

export function SessionProvider({ adapter = pendingSessionAdapter, children }) {
  const [session, setSession] = useState({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setSession({ status: 'loading' });
    Promise.resolve().then(() => adapter.resolve({ signal: controller.signal }))
      .then((result) => {
        if (controller.signal.aborted || generation.current !== current) return;
        if (result?.status === 'authenticated') {
          const roles = Array.isArray(result.user?.roles) ? result.user.roles : [result.user?.role];
          if (!roles.length || roles.some(role => !ROLES.includes(role))) throw new Error('Invalid session role');
        }
        if (!['guest', 'authenticated', 'pending'].includes(result?.status)) {
          throw new Error('Invalid session result');
        }
        setSession(result);
      }).catch(() => {
        if (!controller.signal.aborted && generation.current === current) setSession({ status: 'error' });
      });
    return () => controller.abort();
  }, [adapter, revision]);
  const invalidate = useCallback(() => {
    ++generation.current;
    setSession({ status: 'guest' });
  }, []);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const getCsrfToken = useCallback(() => adapterRef.current.getCsrfToken?.() ?? null, []);
  const logout = useCallback(async () => {
    const logoutAction = adapterRef.current.logout;
    if (typeof logoutAction !== 'function') {
      const error = new Error('Logout is not available in this session adapter');
      error.code = 'LOGOUT_NOT_AVAILABLE';
      throw error;
    }
    await logoutAction();
    invalidate();
  }, [invalidate]);
  const value = useMemo(() => ({ ...session, invalidate, refresh, getCsrfToken, logout }),
    [session, invalidate, refresh, getCsrfToken, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider required');
  return session;
}
