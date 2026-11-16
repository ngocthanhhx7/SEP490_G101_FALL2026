import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApiResource } from './useApiResource.js';

const unavailable = async () => ({ data: null });
export function useVisitBoardPages(api, tab, filters, enabled = true) {
  const load = useCallback(({ signal }) => api.visitBoard({ tab, ...filters }, { signal }), [api, tab, filters]);
  const first = useApiResource(enabled ? load : unavailable);
  const [extra, setExtra] = useState({ owner: null, items: [], cursor: null, status: 'idle' });
  const pending = useRef(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [first.data, api, tab, filters]);
  const mine = extra.owner === first.data ? extra : { items: [], status: 'idle' };
  const next = extra.owner === first.data ? extra.cursor : first.data?.nextCursor;
  const items = useMemo(() => [...new Map([...(first.data?.items ?? []), ...(extra.owner === first.data ? extra.items : [])]
    .map(row => [row.id, row])).values()], [first.data, extra]);

  async function loadMore() {
    if (!next || pending.current) return;
    const controller = new AbortController(), owner = first.data;
    pending.current = controller;
    const keep = { owner, items: mine.items, cursor: next };
    setExtra({ ...keep, status: 'loading' });
    try {
      const result = await api.visitBoard({ tab, ...filters, cursor: next }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.pending || !Array.isArray(result.data?.items)) throw new Error('Page unavailable');
      setExtra({ owner, items: [...keep.items, ...result.data.items], cursor: result.data.hasMore ? result.data.nextCursor : null, status: 'idle' });
    } catch {
      if (!controller.signal.aborted) setExtra({ ...keep, status: 'error' });
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }
  return { first, items, next, moreStatus: mine.status, loadMore };
}
