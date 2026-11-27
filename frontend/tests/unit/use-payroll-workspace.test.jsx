import { act, renderHook, waitFor } from '@testing-library/react';
import { usePayrollWorkspace } from '../../src/hooks/usePayrollWorkspace.js';

describe('FE-PAYROLL-01 usePayrollWorkspace', () => {
  test('UTCID01 loads workspace data on render', async () => {
    const load = jest.fn().mockResolvedValue({ periods: [] }); const { result } = renderHook(() => usePayrollWorkspace(load));
    await waitFor(() => expect(result.current).toMatchObject({ loading: false, data: { periods: [] }, error: null }));
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('UTCID02 exposes the API error code when loading fails', async () => {
    const load = jest.fn(() => Promise.reject({ code: 'FORBIDDEN' }));
    const { result } = renderHook(() => usePayrollWorkspace(load));
    await waitFor(() => expect(result.current).toMatchObject({ loading: false, error: 'FORBIDDEN' }));
  });

  test('UTCID03 aborts an in-flight loader when unmounted', async () => {
    let signal; const load = jest.fn(({ signal: current }) => { signal = current; return new Promise(() => {}); });
    const { unmount } = renderHook(() => usePayrollWorkspace(load)); await waitFor(() => expect(signal).toBeDefined());
    unmount(); expect(signal.aborted).toBe(true);
  });

  test('UTCID04 refreshes and reports success after a confirmed command', async () => {
    const load = jest.fn().mockResolvedValue({ cycle: 1 }); const execute = jest.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => usePayrollWorkspace(load)); await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.command('approve', { id: 'p1' }, execute));
    expect(execute.mock.calls[0][0]).toMatch(/^payroll:/); expect(result.current.message).toBe('Đã lưu.'); expect(load).toHaveBeenCalledTimes(2);
  });

  test('UTCID05 retains the operation key after an unconfirmed command for retry', async () => {
    const execute = jest.fn().mockRejectedValueOnce({ code: 'NETWORK_ERROR' }).mockResolvedValueOnce({ ok: true });
    const load = jest.fn(() => Promise.resolve({}));
    const { result } = renderHook(() => usePayrollWorkspace(load)); await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.command('approve', { id: 'p1' }, execute)); const key = execute.mock.calls[0][0];
    expect(result.current.message).toContain('NETWORK_ERROR'); await act(async () => result.current.command('approve', { id: 'p1' }, execute)); expect(execute.mock.calls[1][0]).toBe(key);
  });
});
