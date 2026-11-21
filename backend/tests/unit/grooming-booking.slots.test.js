import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createGroomingBookingController } from '../../src/controllers/grooming-booking.controller.js';
import { AppError } from '../../src/utils/app-error.js';

const now = '2026-11-18T10:00:00.000Z';

describe('GRM-CTL-02 - slots', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date(now)));
  afterEach(() => jest.useRealTimers());
  const cases = [
    ["UTCID01", "N", "maps request and preserves service DTO", {}],
    ["UTCID02", "B", "preserves empty slots unchanged", {"data": {"date": "2026-11-19", "slots": []}}],
    ["UTCID03", "A", "preserves null service result", {"data": null}],
    ["UTCID04", "A", "preserves undefined service result at json boundary", {"noData": true}],
    ["UTCID05", "A", "passes missing auth and propagates service forbidden error", {"noAuth": true, "error": [403, "FORBIDDEN", "Customer required"]}],
    ["UTCID06", "A", "passes null body to service without defaulting", {"nullBody": true, "error": [422, "VALIDATION_FAILED", "Invalid fields"]}],
    ["UTCID07", "A", "propagates synchronous service Error unchanged", {"sync": true, "error": "offline"}],
    ["UTCID08", "A", "propagates rejected service Promise unchanged", {"error": "offline"}],
    ["UTCID09", "A", "maps duplicate key to 409 VERSION_CONFLICT", {"raw": {"code": 11000}, "mapped": [409, "VERSION_CONFLICT", "Record already exists"]}],
    ["UTCID10", "A", "maps ValidationError to 422 VALIDATION_FAILED", {"raw": {"name": "ValidationError"}, "mapped": [422, "VALIDATION_FAILED", "Data does not match the schema"]}],
    ["UTCID11", "A", "maps StrictModeError to 422 VALIDATION_FAILED", {"raw": {"name": "StrictModeError"}, "mapped": [422, "VALIDATION_FAILED", "Data does not match the schema"]}],
    ["UTCID12", "N", "waits for service before sending HTTP response", {"deferred": true}],
    ["UTCID13", "N", "does not fabricate missing correlation ID", {"noRequestId": true}],
    ["UTCID14", "N", "preserves synchronously returned service DTO", {"syncResult": true}],
    ["UTCID15", "A", "preserves domain error status code message and details", {"error": [404, "RESOURCE_NOT_FOUND", "Owned pet unavailable"]}]
  ];

  test.each(cases)('%s [%s] - %s', async (_utc, _type, _title, scenario) => {
    const auth = Object.freeze({ userId: 'customer-1', state: 'ACTIVE', roles: ['CUSTOMER'] });
    const req = { auth, requestId: 'controller-test', body: {"pets": [{"petId": "abcdef0123456789abcdef01", "serviceIds": ["abcdef0123456789abcdef02"]}], "date": "2026-11-19"} };
    if (scenario.noAuth) delete req.auth;
    if (scenario.nullAuth) req.auth = null;
    if (scenario.nullBody) req.body = null;
    if (scenario.noRequestId) delete req.requestId;
    
    // Unused request fields must never influence this service call.
    for (const field of ["params", "query", "headers"]) {
      Object.defineProperty(req, field, { get() { throw new Error(`Unexpected ${field} access`); } });
    }
    const data = scenario.noData ? undefined : Object.hasOwn(scenario, 'data') ? scenario.data : {"date": "2026-11-19", "slots": [{"startAt": "2026-11-19T02:00:00.000Z", "time": "09:00", "state": "AVAILABLE"}, {"startAt": "2026-11-19T03:00:00.000Z", "time": "10:00", "state": "FULL"}]};
    const beforeData = globalThis.structuredClone(data);
    const beforeBody = globalThis.structuredClone(req.body);
    const error = scenario.raw ? Object.assign(new Error('private database detail'), scenario.raw)
      : Array.isArray(scenario.error) ? new AppError(...scenario.error, { reason: 'synthetic' }) : new Error(scenario.error ?? 'unused');
    const port = jest.fn().mockResolvedValue(data);
    if (scenario.syncResult) port.mockReturnValue(data);
    let resolve;
    if (scenario.deferred) port.mockReturnValue(new Promise(done => { resolve = done; }));
    if (scenario.error || scenario.raw) {
      if (scenario.sync) port.mockImplementation(() => { throw error; });
      else port.mockRejectedValue(error);
    }
    const controller = createGroomingBookingController({ slots: port });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    const pending = controller.slots(req, res);

    expect(port.mock.calls).toEqual([[req.auth, req.body]]);
    expect(port.mock.calls[0][0]).toBe(req.auth);
    expect(port.mock.calls[0][1]).toBe(req.body);
    expect(req.body).toEqual(beforeBody);
    
    if (scenario.error || scenario.raw) {
      if (scenario.mapped) {
        const [status, code, message] = scenario.mapped;
        await expect(pending).rejects.toMatchObject({ name: 'AppError', status, code, message, details: {} });
      } else await expect(pending).rejects.toBe(error);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      return;
    }
    if (scenario.deferred) {
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      resolve(data);
    }
    await expect(pending).resolves.toBe(res);
    expect(res.status.mock.calls).toEqual([[200]]);
    expect(res.json.mock.calls).toEqual([[{ data, meta: { schemaVersion: 1, serverNow: now, correlationId: req.requestId } }]]);
    expect(res.json.mock.calls[0][0].data).toBe(data);
    expect(data).toEqual(beforeData);
    expect(res.status.mock.invocationCallOrder[0]).toBeLessThan(res.json.mock.invocationCallOrder[0]);
  });
});
