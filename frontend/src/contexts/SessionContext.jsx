import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { pendingSessionAdapter } from '../services/session-adapter.js';

const SessionContext = createContext(null);
const ROLES = ['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'];

export function SessionProvider({ adapter = pendingSessionAdapter, children }) {
  const [session, setSession] = useState({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setSession({ status: 'loading' });
    Promise.resolve().then(() => adapter.resolve({ signal: controller.signal }))
      .then((result) => {
        if (controller.signal.aborted || generation.current !== current) return;
        if (result?.status === 'authenticated' && !ROLES.includes(result.user?.role)) {
          throw new Error('Invalid session role');
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
  const invalidate = () => {
    ++generation.current;
    setSession({ status: 'guest' });
  };
  return <SessionContext.Provider value={{ ...session, invalidate,
    refresh: () => setRevision((value) => value + 1) }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider required');
  return session;
}
