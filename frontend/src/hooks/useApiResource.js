import { useEffect, useRef, useState } from 'react';

// load must be stable (module export or useCallback). Keep private data in memory.
export function useApiResource(load) {
  const [state, setState] = useState({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setState({ status: 'loading' });
    Promise.resolve().then(() => load({ signal: controller.signal })).then((result) => {
      if (controller.signal.aborted || generation.current !== current) return;
      const empty = result.data === null || (Array.isArray(result.data) && result.data.length === 0);
      setState({ status: result.pending ? 'pending' : empty ? 'empty' : 'success',
        data: result.data, meta: result.meta });
    }).catch((error) => {
      if (controller.signal.aborted || generation.current !== current) return;
      setState({ status: error.status === 403 ? 'forbidden' : 'error', code: error.code });
    });
    return () => controller.abort();
  }, [load, revision]);
  return { ...state, retry: () => setRevision((value) => value + 1) };
}
