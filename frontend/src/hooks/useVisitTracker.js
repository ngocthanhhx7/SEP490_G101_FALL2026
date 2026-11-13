import { useEffect, useState } from 'react';

const refreshMs = 30000;
const terminal = new Set(['REPORT_READY', 'CANCELLED', 'CLOSED']);

export function useVisitTracker(load) {
  const [view, setView] = useState({ data: null, error: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let stopped = false;
    let disposed = false;
    let timer;
    let controller;

    function pause() {
      window.clearTimeout(timer);
      controller?.abort();
      controller = null;
    }

    async function refresh() {
      if (document.hidden || stopped || disposed || controller) return;
      window.clearTimeout(timer);
      const request = new AbortController();
      controller = request;
      try {
        const data = await load(request.signal);
        if (disposed || request.signal.aborted) return;
        stopped = terminal.has(data.visit.status);
        setView({ data, error: null });
      } catch (error) {
        if (disposed || request.signal.aborted) return;
        stopped = [401, 403, 404].includes(error.status);
        setView(previous => ({ data: stopped ? null : previous.data, error }));
      } finally {
        if (controller === request) {
          controller = null;
          if (!document.hidden && !stopped && !disposed) timer = window.setTimeout(refresh, refreshMs);
        }
      }
    }

    function onVisibility() {
      if (document.hidden) pause();
      else void refresh();
    }

    void refresh();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      pause();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load, revision]);
  return { ...view, retry: () => setRevision(value => value + 1) };
}
