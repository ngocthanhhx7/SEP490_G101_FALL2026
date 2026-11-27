import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createEmployeeSchedulingController } from '../../src/controllers/employee-scheduling.controller.js';
import { AppError } from '../../src/utils/app-error.js';

const visitId = 'abcdef0123456789abcdef01';
const actor = Object.freeze({ userId: 'staff-1', state: 'ACTIVE', roles: ['STAFF'] });
const now = '2026-11-18T10:00:00.000Z';

describe('EMP-CTL-01 - dispatchDetails', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date(now)));
  afterEach(() => jest.useRealTimers());

  const cases = [
    ['UTCID01', 'N', 'maps actor and visit ID; preserves detail object', {}],
    ['UTCID02', 'B', 'accepts exactly 24 uppercase hex characters unchanged', { id: visitId.toUpperCase() }],
    ['UTCID03', 'B', 'rejects 23-character ID before calling service', { id: 'a'.repeat(23), invalid: true }],
    ['UTCID04', 'B', 'rejects 25-character ID before calling service', { id: 'a'.repeat(25), invalid: true }],
    ['UTCID05', 'A', 'rejects non-hex ID before calling service', { id: 'g'.repeat(24), invalid: true }],
    ['UTCID06', 'A', 'rejects missing params.id before calling service', { id: undefined, invalid: true }],
    ['UTCID07', 'A', 'rejects numeric ID before calling service', { id: 123, invalid: true }],
    ['UTCID08', 'A', 'passes missing auth to service and propagates forbidden error', { noAuth: true, error: [403, 'FORBIDDEN', 'Staff required'] }],
    ['UTCID09', 'A', 'preserves null service result without inventing data', { data: null }],
    ['UTCID10', 'A', 'preserves undefined service result at json boundary', { data: undefined }],
    ['UTCID11', 'N', 'waits for pending service before sending response', { deferred: true }],
    ['UTCID12', 'A', 'propagates not-found AppError with details by identity', { error: [404, 'RESOURCE_NOT_FOUND', 'Dispatch visit unavailable'] }],
    ['UTCID13', 'A', 'propagates synchronous service exception', { sync: true, error: 'offline' }],
    ['UTCID14', 'A', 'propagates rejected service Promise without responding', { error: 'offline' }],
    ['UTCID15', 'N', 'does not fabricate missing correlation ID', { noRequestId: true }]
  ];

  test.each(cases)('%s [%s] - %s', async (_utc, _type, _title, scenario) => {
    const req = { auth: actor, params: { id: visitId }, requestId: 'controller-test' };
    if (Object.hasOwn(scenario, 'id')) req.params.id = scenario.id;
    if (scenario.noAuth) delete req.auth;
    if (scenario.noRequestId) delete req.requestId;
    // These request fields are outside this controller's contract.
    for (const field of ['body', 'query', 'headers']) {
      Object.defineProperty(req, field, { get() { throw new Error(`Unexpected ${field} access`); } });
    }
    const data = Object.hasOwn(scenario, 'data') ? scenario.data : Object.freeze({ id: visitId, bookingId: 'booking-1', petNames: ['Milo'], dispatchState: 'SYSTEM_SEARCHING' });
    const error = Array.isArray(scenario.error)
      ? new AppError(...scenario.error, { visitId }) : new Error(scenario.error ?? 'unused');
    const details = jest.fn().mockResolvedValue(data);
    let resolve;
    if (scenario.deferred) details.mockReturnValue(new Promise(done => { resolve = done; }));
    if (scenario.error) {
      if (scenario.sync) details.mockImplementation(() => { throw error; });
      else details.mockRejectedValue(error);
    }
    const res = { json: jest.fn().mockReturnThis() };
    const controller = createEmployeeSchedulingController({ dispatch: { details } });

    const pending = controller.dispatchDetails(req, res);

    if (scenario.invalid) {
      await expect(pending).rejects.toMatchObject({ name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'Invalid identifier', details: {} });
      expect(details).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      return;
    }
    expect(details.mock.calls).toEqual([[req.auth, req.params.id]]);
    expect(details.mock.calls[0][0]).toBe(req.auth);
    if (scenario.error) {
      await expect(pending).rejects.toBe(error);
      expect(res.json).not.toHaveBeenCalled();
      return;
    }
    if (scenario.deferred) {
      expect(res.json).not.toHaveBeenCalled();
      resolve(data);
    }
    await expect(pending).resolves.toBe(res);
    expect(res.json.mock.calls).toEqual([[{ data, meta: { schemaVersion: 1, serverNow: now, correlationId: req.requestId } }]]);
    expect(res.json.mock.calls[0][0].data).toBe(data);
  });
});
