import { useCallback, useEffect, useRef, useState } from 'react';

export function usePayrollWorkspace(load) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const keys = useRef(new Map());
  const locked = useRef(false);
  const controller = useRef(null);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setState({ loading: true, data: null, error: null });
    try {
      const data = await load({ signal: current.signal });
      if (!current.signal.aborted) setState({ loading: false, data, error: null });
    } catch (error) {
      if (!current.signal.aborted) setState({ loading: false, data: null, error: error.code || 'NETWORK_ERROR' });
    }
  }, [load]);
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; controller.current?.abort(); }; }, [refresh]);
  const command = async (operation, body, execute) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setMessage(null);
    const fingerprint = JSON.stringify([operation, body]);
    if (!keys.current.has(fingerprint)) keys.current.set(fingerprint, `payroll:${globalThis.crypto.randomUUID()}`);
    try {
      await execute(keys.current.get(fingerprint));
      keys.current.delete(fingerprint);
      if (mounted.current) { setMessage('Đã lưu.'); await refresh(); }
      return true;
    } catch (error) {
      if (mounted.current) setMessage(`Chưa xác nhận được thao tác (${error.code || 'NETWORK_ERROR'}).`);
      return false;
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  return { ...state, busy, message, refresh, command };
}
