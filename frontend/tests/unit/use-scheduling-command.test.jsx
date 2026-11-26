import { act, renderHook, waitFor } from '@testing-library/react';
import { useSchedulingCommand } from '../../src/hooks/useSchedulingCommand.js';

describe('FE-SCHED-CMD-01 useSchedulingCommand', () => {
  test('UTCID01 calls the command once, clears the key, and refreshes after success', async () => {
    const onSuccess = jest.fn(), work = jest.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useSchedulingCommand(onSuccess));
    await act(async () => result.current.execute(work));
    expect(work).toHaveBeenCalledTimes(1); expect(work.mock.calls[0][0]).toMatch(/^schedule:/);
    expect(result.current).toMatchObject({ busy: false, pending: false, message: 'Đã xác nhận.' }); expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('UTCID02 blocks a duplicate command while the first call is running', async () => {
    let settle; const work = jest.fn(() => new Promise(resolve => { settle = resolve; }));
    const { result } = renderHook(() => useSchedulingCommand());
    act(() => { result.current.execute(work); result.current.execute(work); });
    expect(work).toHaveBeenCalledTimes(1); await act(async () => settle({ ok: true }));
  });

  test('UTCID03 retains work and key after a pending response for retry', async () => {
    const work = jest.fn().mockResolvedValueOnce({ pending: true }).mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useSchedulingCommand());
    await act(async () => result.current.execute(work)); const key = work.mock.calls[0][0];
    expect(result.current.pending).toBe(true); await act(async () => result.current.retry());
    expect(work.mock.calls[1][0]).toBe(key);
  });

  test('UTCID04 retains work and key after an uncertain network failure', async () => {
    const work = jest.fn().mockRejectedValueOnce({ code: 'NETWORK_ERROR' }).mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useSchedulingCommand());
    await act(async () => result.current.execute(work)); const key = work.mock.calls[0][0];
    expect(result.current.message).toContain('Chưa nhận được xác nhận'); await act(async () => result.current.retry());
    expect(work.mock.calls[1][0]).toBe(key);
  });

  test('UTCID05 shows the mapped deterministic error and does not retain pending state', async () => {
    const { result } = renderHook(() => useSchedulingCommand());
    await act(async () => result.current.execute(() => Promise.reject({ code: 'CHECKLIST_REQUIRED', status: 422 })));
    await waitFor(() => expect(result.current).toMatchObject({ pending: false, message: 'Cần lưu đủ nội dung chăm sóc trước khi check-out.' }));
  });
});
