import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '../../src/services/api-client.js';
import { useApiResource } from '../../src/hooks/useApiResource.js';

test.each([[null, false, 'empty'], [[], false, 'empty'], [[{ id: 'synthetic' }], false, 'success'],
  [{ operationId: 'synthetic' }, true, 'pending']])
('resource state for %j pending=%s is %s', async (data, pending, status) => {
  const load = async () => ({ data, pending });
  const { result } = renderHook(() => useApiResource(load));
  expect(result.current.status).toBe('loading');
  await waitFor(() => expect(result.current.status).toBe(status));
});

test.each([[403, 'forbidden'], [503, 'error']])('failure %s maps to %s and retry clears stale data', async (code, status) => {
  const load = jest.fn().mockRejectedValueOnce(new ApiError('SYNTHETIC', code)).mockResolvedValueOnce({ data: [] });
  const { result } = renderHook(() => useApiResource(load));
  await waitFor(() => expect(result.current.status).toBe(status));
  act(() => result.current.retry());
  expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.status).toBe('empty'));
});

test('changing loader aborts old request and ignores its late result', async () => {
  let complete, oldSignal;
  const old = ({ signal }) => { oldSignal = signal; return new Promise((done) => { complete = done; }); };
  const next = async () => ({ data: ['current'] });
  const { result, rerender } = renderHook(({ load }) => useApiResource(load), { initialProps: { load: old } });
  await waitFor(() => expect(complete).toBeDefined());
  rerender({ load: next });
  await waitFor(() => expect(result.current.data).toEqual(['current']));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => complete({ data: ['stale'] }));
  expect(result.current.data).toEqual(['current']);
});
