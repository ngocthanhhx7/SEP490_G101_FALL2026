import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, jest, test } from '@jest/globals';
import { useGroomingBooking } from '../../../src/hooks/useGroomingBooking.js';
import { useUpcomingGrooming } from '../../../src/hooks/useUpcomingGrooming.js';
import { useVisitBoardPages } from '../../../src/hooks/useVisitBoardPages.js';
import { useVisitTracker } from '../../../src/hooks/useVisitTracker.js';

const OID1 = '507f1f77bcf86cd799439011';
const SVC1 = '507f1f77bcf86cd799439022';
const EMPTY_FILTERS = Object.freeze({});

describe('Frontend Step 3 Hooks', () => {
  // FE-GRM-HOOK-01
  test('FE-GRM-HOOK-01-UTCID01 [N] loads options/pets, fetches slots & quote, and confirms booking with idempotency key', async () => {
    const api = {
      options: jest.fn(async () => ({
        window: { firstDate: '2026-11-27', lastDate: '2026-12-03' },
        services: [{ id: SVC1, name: 'Tắm sấy', species: ['DOG'], bookable: true }],
        questions: []
      })),
      pets: jest.fn(async () => [{ id: OID1, name: 'Bơ', species: 'DOG' }]),
      slots: jest.fn(async () => ({ slots: [{ startAt: '2026-11-27T02:00:00.000Z', time: '09:00', state: 'AVAILABLE' }] })),
      quote: jest.fn(async () => ({ subtotalVnd: 200000, totalVnd: 200000, pets: [], tier: { discountVnd: 0 } })),
      book: jest.fn(async () => ({ id: 'ap1', code: 'GR-0001' }))
    };
    const { result } = renderHook(() => useGroomingBooking({ api, serviceId: SVC1 }));
    await waitFor(() => expect(result.current.date).toBe('2026-11-27'));

    act(() => { result.current.togglePet({ id: OID1, species: 'DOG' }); });
    act(() => {
      result.current.answer(OID1, 'biteOrScratch', 'NO');
      result.current.answer(OID1, 'skinCondition', 'NO');
    });
    await waitFor(() => expect(result.current.slots.status).toBe('success'));
    await waitFor(() => expect(result.current.priceReady).toBe(true));

    act(() => { result.current.chooseTime('2026-11-27T02:00:00.000Z'); });
    expect(result.current.canConfirm).toBe(true);

    await act(async () => { await result.current.confirm(); });
    expect(result.current.booked).toEqual({ id: 'ap1', code: 'GR-0001' });
    expect(api.book).toHaveBeenCalledWith(
      expect.objectContaining({ expectedTotalVnd: 200000 }),
      expect.stringMatching(/^grooming:/)
    );
  });

  test('FE-GRM-HOOK-01-UTCID02 [A] resets selected time and reloads slots when book fails with GROOMING_SLOT_TAKEN', async () => {
    const api = {
      options: jest.fn(async () => ({
        window: { firstDate: '2026-11-27', lastDate: '2026-12-03' },
        services: [{ id: SVC1, name: 'Tắm sấy', species: ['DOG'], bookable: true }],
        questions: []
      })),
      pets: jest.fn(async () => [{ id: OID1, name: 'Bơ', species: 'DOG' }]),
      slots: jest.fn(async () => ({ slots: [{ startAt: '2026-11-27T02:00:00.000Z', time: '09:00', state: 'AVAILABLE' }] })),
      quote: jest.fn(async () => ({ subtotalVnd: 200000, totalVnd: 200000, pets: [], tier: { discountVnd: 0 } })),
      book: jest.fn(async () => { throw Object.assign(new Error('taken'), { code: 'GROOMING_SLOT_TAKEN' }); })
    };
    const { result } = renderHook(() => useGroomingBooking({ api, serviceId: SVC1 }));
    await waitFor(() => expect(result.current.date).toBe('2026-11-27'));
    act(() => {
      result.current.togglePet({ id: OID1, species: 'DOG' });
      result.current.answer(OID1, 'biteOrScratch', 'NO');
      result.current.answer(OID1, 'skinCondition', 'NO');
    });
    await waitFor(() => expect(result.current.priceReady).toBe(true));
    await waitFor(() => expect(result.current.slots.status).toBe('success'));
    act(() => { result.current.chooseTime('2026-11-27T02:00:00.000Z'); });

    await act(async () => { await result.current.confirm(); });
    expect(result.current.time).toBe('');
    expect(result.current.notice).toBeTruthy();
  });

  // FE-GRM-UPCOMING-01
  test('FE-GRM-UPCOMING-01-UTCID01 [N] loads upcoming appointments, blocks <2h cancel inline, and cancels >=2h appointment', async () => {
    const nearItem = { id: 'a-near', slot: { startAt: '2026-11-26T09:30:00.000Z' }, shop: { hotline: '19001000' } };
    const farItem = { id: 'a-far', slot: { startAt: '2026-11-26T14:00:00.000Z' }, shop: { hotline: '19001000' } };
    const api = {
      listAppointments: jest.fn(async () => ({
        serverNow: '2026-11-26T08:00:00.000Z',
        items: [nearItem, farItem]
      })),
      cancelAppointment: jest.fn(async () => ({ id: 'a-far', status: 'CANCELLED' }))
    };
    const { result } = renderHook(() => useUpcomingGrooming({ api }));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.items).toHaveLength(2);

    act(() => { result.current.requestCancel(nearItem); });
    expect(result.current.pendingCancel).toBeNull();
    expect(result.current.inlineErrors['a-near']).toContain('19001000');

    act(() => { result.current.requestCancel(farItem); });
    expect(result.current.pendingCancel).toEqual(farItem);
    await act(async () => { await result.current.confirmCancel(); });
    expect(result.current.items.map(i => i.id)).toEqual(['a-near']);
    expect(result.current.toastMessage).toBeTruthy();
  });

  test('FE-GRM-UPCOMING-01-UTCID02 [B] transitions silently to disabled status when grooming API returns 404', async () => {
    const api = {
      listAppointments: jest.fn(async () => { throw Object.assign(new Error('off'), { status: 404 }); }),
      cancelAppointment: jest.fn()
    };
    const { result } = renderHook(() => useUpcomingGrooming({ api }));
    await waitFor(() => expect(result.current.status).toBe('disabled'));
    expect(result.current.items).toEqual([]);
  });

  // FE-VISIT-PAGES-01
  test('FE-VISIT-PAGES-01-UTCID01 [N] loads first page and deduplicates appended cursor items on loadMore', async () => {
    const api = {
      visitBoard: jest.fn(async ({ cursor }) => ({
        data: cursor
          ? { items: [{ id: 'v1', name: 'dup' }, { id: 'v2', name: 'second' }], hasMore: false, nextCursor: null }
          : { items: [{ id: 'v1', name: 'first' }], hasMore: true, nextCursor: 'cur-1' }
      }))
    };
    const { result } = renderHook(() => useVisitBoardPages(api, 'needs-action', EMPTY_FILTERS));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.next).toBe('cur-1');

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.items.map(i => i.id)).toEqual(['v1', 'v2']);
    expect(result.current.next).toBeNull();
  });

  test('FE-VISIT-PAGES-01-UTCID02 [A] sets moreStatus=error and preserves cursor when loadMore fails', async () => {
    const api = {
      visitBoard: jest.fn(async ({ cursor }) => {
        if (cursor) throw new Error('network');
        return { data: { items: [{ id: 'v1' }], hasMore: true, nextCursor: 'cur-1' } };
      })
    };
    const { result } = renderHook(() => useVisitBoardPages(api, 'all', EMPTY_FILTERS));
    await waitFor(() => expect(result.current.next).toBe('cur-1'));

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.moreStatus).toBe('error');
    expect(result.current.next).toBe('cur-1');
  });

  // FE-VISIT-TRACK-01
  test('FE-VISIT-TRACK-01-UTCID01 [N] polls active visit and stops polling once terminal REPORT_READY is reached', async () => {
    jest.useFakeTimers();
    try {
      let calls = 0;
      const load = jest.fn(async () => {
        calls += 1;
        return { visit: { status: calls === 1 ? 'IN_PROGRESS' : 'REPORT_READY' } };
      });
      const { result, unmount } = renderHook(() => useVisitTracker(load));
      await waitFor(() => expect(result.current.data?.visit.status).toBe('IN_PROGRESS'));

      await act(async () => { await jest.advanceTimersByTimeAsync(30000); });
      await waitFor(() => expect(result.current.data?.visit.status).toBe('REPORT_READY'));

      await act(async () => { await jest.advanceTimersByTimeAsync(60000); });
      expect(load).toHaveBeenCalledTimes(2);
      unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test('FE-VISIT-TRACK-01-UTCID02 [A] clears data and stops polling on HTTP 404 error, then reloads on retry()', async () => {
    let failNow = true;
    const load = jest.fn(async () => {
      if (failNow) throw Object.assign(new Error('missing'), { status: 404 });
      return { visit: { status: 'CANCELLED' } };
    });
    const { result } = renderHook(() => useVisitTracker(load));
    await waitFor(() => expect(result.current.error?.status).toBe(404));
    expect(result.current.data).toBeNull();

    failNow = false;
    act(() => { result.current.retry(); });
    await waitFor(() => expect(result.current.data?.visit.status).toBe('CANCELLED'));
  });
});
