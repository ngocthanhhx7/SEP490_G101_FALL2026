import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GROOMING_CANCEL_MIN_LEAD_MINUTES, MSG158, msg159
} from '../constants/grooming-messages.js';
import { createGroomingBookingApi } from '../services/grooming-booking-api.js';

const CANCEL_LEAD_MS = GROOMING_CANCEL_MIN_LEAD_MINUTES * 60000;

// Reads upcoming shop grooming appointments and manages customer cancellation
// (R3 7.2.1, GBR-40, MSG157-MSG159). Fails silently when shop grooming is disabled (404).
export function useUpcomingGrooming({ enabled = true, getCsrfToken, createApi = createGroomingBookingApi, api: injectedApi = null, limit = 20 } = {}) {
  const api = useMemo(() => injectedApi ?? createApi({ getCsrfToken: getCsrfToken ?? (() => null) }), [injectedApi, createApi, getCsrfToken]);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle');
  const [pendingCancel, setPendingCancel] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [inlineErrors, setInlineErrors] = useState({});
  const [reloadTick, setReloadTick] = useState(0);
  const clockOffsetRef = useRef(0);
  const busyRef = useRef(false);

  const reload = useCallback(() => {
    setReloadTick(tick => tick + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setStatus('idle');
      return undefined;
    }
    if (!injectedApi && typeof globalThis.fetch !== 'function') {
      setItems([]);
      setStatus('disabled');
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setStatus('loading');
    api.listAppointments({ upcoming: true, limit, signal: controller.signal }).then(data => {
      if (!active) return;
      if (typeof data.serverNow === 'string' && Number.isFinite(Date.parse(data.serverNow))) {
        clockOffsetRef.current = Date.parse(data.serverNow) - Date.now();
      }
      setItems(data.items ?? []);
      setStatus('success');
    }).catch(error => {
      if (!active || error?.name === 'AbortError' || error?.code === 'ABORTED') return;
      if (error?.status === 404 || error?.status === 401 || error?.status === 403) {
        setItems([]);
        setStatus('disabled');
        return;
      }
      setItems([]);
      setStatus('error');
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, enabled, injectedApi, limit, reloadTick]);

  const requestCancel = useCallback(appointment => {
    if (!appointment || busyRef.current) return;
    setToastMessage('');
    const nowMs = Date.now() + clockOffsetRef.current;
    const startMs = Date.parse(appointment.slot.startAt);
    if (Number.isFinite(startMs) && startMs - nowMs < CANCEL_LEAD_MS) {
      setInlineErrors(prev => ({ ...prev, [appointment.id]: msg159(appointment.shop?.hotline) }));
      return;
    }
    setInlineErrors(prev => {
      if (!prev[appointment.id]) return prev;
      const next = { ...prev };
      delete next[appointment.id];
      return next;
    });
    setPendingCancel(appointment);
  }, []);

  const closeCancelDialog = useCallback(() => {
    if (busyRef.current) return;
    setPendingCancel(null);
  }, []);

  const confirmCancel = useCallback(async () => {
    if (!pendingCancel || busyRef.current) return;
    const target = pendingCancel;
    busyRef.current = true;
    setCancellingId(target.id);
    try {
      await api.cancelAppointment(target.id);
      setPendingCancel(null);
      setItems(prev => prev.filter(item => item.id !== target.id));
      setInlineErrors(prev => {
        if (!prev[target.id]) return prev;
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
      setToastMessage(MSG158);
    } catch (error) {
      setPendingCancel(null);
      if (error?.code === 'GROOMING_CANCEL_TOO_LATE') {
        const hotline = error.details?.hotline ?? target.shop?.hotline ?? null;
        setInlineErrors(prev => ({ ...prev, [target.id]: msg159(hotline) }));
      } else if (error?.code === 'GROOMING_APPOINTMENT_NOT_CANCELLABLE') {
        setInlineErrors(prev => ({ ...prev, [target.id]: error.serverMessage || 'Lịch hẹn này không còn huỷ được.' }));
        reload();
      } else {
        setInlineErrors(prev => ({ ...prev, [target.id]: error?.serverMessage || 'Chưa huỷ được lịch hẹn. Vui lòng thử lại.' }));
      }
    } finally {
      busyRef.current = false;
      setCancellingId(null);
    }
  }, [api, pendingCancel, reload]);

  return {
    items,
    status,
    pendingCancel,
    cancellingId,
    toastMessage,
    inlineErrors,
    requestCancel,
    closeCancelDialog,
    confirmCancel,
    reload
  };
}
