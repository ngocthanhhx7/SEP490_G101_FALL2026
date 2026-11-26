import { act, renderHook, waitFor } from '@testing-library/react';
import { useApiResource } from '../../src/hooks/useApiResource.js';

describe('FE-RESOURCE-01 useApiResource', () => {
  test.each([[{ data: { id: 'x' } }, 'success'], [{ data: null }, 'empty'], [{ data: [], pending: true }, 'pending']])('UTCID01 maps %j to %s', async (response, status) => {
    const load = jest.fn(() => Promise.resolve(response));
    const { result } = renderHook(() => useApiResource(load));
    expect(result.current.status).toBe('loading'); await waitFor(() => expect(result.current.status).toBe(status));
  });

  test('UTCID02 maps 403 to forbidden and other failure to error', async () => {
    const forbidden = jest.fn(() => Promise.reject({ status: 403, code: 'FORBIDDEN' }));
    const failed = jest.fn(() => Promise.reject({ status: 500, code: 'HTTP_ERROR' }));
    const { result, rerender } = renderHook(({ load }) => useApiResource(load), { initialProps: { load: forbidden } });
    await waitFor(() => expect(result.current.status).toBe('forbidden')); rerender({ load: failed });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'error', code: 'HTTP_ERROR' }));
  });

  test('UTCID03 retry runs the loader again', async () => {
    const load = jest.fn().mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: ['new'] }); const { result } = renderHook(() => useApiResource(load));
    await waitFor(() => expect(result.current.status).toBe('empty')); act(() => result.current.retry()); await waitFor(() => expect(result.current.data).toEqual(['new'])); expect(load).toHaveBeenCalledTimes(2);
  });

  test('UTCID04 aborts and ignores a stale loader on unmount', async () => {
    let resolve; let signal; const load = ({ signal: current }) => { signal = current; return new Promise(done => { resolve = done; }); };
    const { result, unmount } = renderHook(() => useApiResource(load)); await waitFor(() => expect(resolve).toBeDefined()); unmount(); expect(signal.aborted).toBe(true);
    await act(async () => resolve({ data: ['stale'] })); expect(result.current.status).toBe('loading');
  });
});
