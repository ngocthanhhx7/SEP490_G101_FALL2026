import { createVisitClosureApi } from '../../src/services/visit-closure-api.js';
import { createEmployeeSchedulingApi } from '../../src/services/employee-scheduling-api.js';

const body = { expectedVersion: 4, reason: 'Đã gọi xác nhận.' };
const closed = { data: { visitId: 'visit-1', state: 'STAFF_CLOSED', version: 5 } };

describe('visit closure API client', () => {
  test('reads the closable visits and the dialog data from the closure paths', async () => {
    const request = jest.fn().mockResolvedValue({ data: {} });
    const api = createVisitClosureApi(request);
    const signal = new AbortController().signal;
    await api.closableVisits({ signal });
    await api.closureDetails('visit/1', { signal });
    expect(request).toHaveBeenNthCalledWith(1, '/employee-scheduling/closable-visits', { signal });
    expect(request).toHaveBeenNthCalledWith(2, '/employee-scheduling/visits/visit%2F1/closure', { signal });
  });

  test('closeVisit posts the body with the Idempotency-Key to the closures path', async () => {
    const request = jest.fn().mockResolvedValue(closed);
    const result = await createVisitClosureApi(request).closeVisit('visit-1', body, 'closure:key-1');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/employee-scheduling/visits/visit-1/closures', { method: 'POST', body, idempotencyKey: 'closure:key-1' });
    expect(result).toBe(closed);
  });

  test('closeVisit accepts the CANCELLED response of a visit without a check-in photo', async () => {
    const cancelled = { data: { visitId: 'visit-1', state: 'CANCELLED', version: 5, chargeAmount: 0 } };
    const request = jest.fn().mockResolvedValue(cancelled);
    await expect(createVisitClosureApi(request).closeVisit('visit-1', body, 'closure:key-5')).resolves.toBe(cancelled);
  });

  test('closeVisit returns a 202 or pending result unchanged so the caller can retry the same key', async () => {
    const pending = { status: 202, pending: true, data: null };
    const request = jest.fn().mockResolvedValue(pending);
    await expect(createVisitClosureApi(request).closeVisit('visit-1', body, 'closure:key-2')).resolves.toBe(pending);
  });

  test.each([
    ['another visit', { data: { visitId: 'other', state: 'STAFF_CLOSED', version: 5 } }],
    ['another state', { data: { visitId: 'visit-1', state: 'COMPLETED', version: 5 } }],
    ['a version that did not advance by one', { data: { visitId: 'visit-1', state: 'STAFF_CLOSED', version: 7 } }],
    ['no data', { data: null }]
  ])('closeVisit rejects a response for %s as INVALID_RESPONSE', async (_name, response) => {
    const request = jest.fn().mockResolvedValue(response);
    await expect(createVisitClosureApi(request).closeVisit('visit-1', body, 'closure:key-3')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('the scheduling API exposes the closure calls', async () => {
    const request = jest.fn().mockResolvedValue(closed);
    const api = createEmployeeSchedulingApi(request);
    await api.closeVisit('visit-1', body, 'closure:key-4');
    expect(request).toHaveBeenCalledWith('/employee-scheduling/visits/visit-1/closures', { method: 'POST', body, idempotencyKey: 'closure:key-4' });
  });
});
