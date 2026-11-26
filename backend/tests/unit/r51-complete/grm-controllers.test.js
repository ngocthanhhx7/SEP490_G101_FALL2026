import { describe, expect, jest, test } from '@jest/globals';
import { createGroomingBookingController } from '../../../src/controllers/grooming-booking.controller.js';
import { AppError } from '../../../src/utils/app-error.js';

const AUTH_CUST = { userId: '507f1f77bcf86cd799439011', state: 'ACTIVE', roles: ['CUSTOMER'] };
const APPT_ID = '507f1f77bcf86cd799439022';

function makeReq(overrides = {}) {
  const headers = new Map(Object.entries(overrides.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    auth: AUTH_CUST,
    params: {},
    query: {},
    body: {},
    requestId: overrides.correlationId ?? '11111111-2222-3333-4444-555555555555',
    get: (k) => headers.get(String(k).toLowerCase()),
    ...overrides
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    payload: null,
    status: jest.fn((code) => { res.statusCode = code; return res; }),
    json: jest.fn((body) => { res.payload = body; return res; })
  };
  return res;
}

describe('GRM-CTL-05 listAppointments (15 UTCs)', () => {
  test('GRM-CTL-05-UTCID01 [N] returns 200 envelope with paginated appointments for default query', async () => {
    const service = { listAppointments: jest.fn(async () => ({ items: [{ id: APPT_ID }], page: 1, limit: 20, total: 1 })) };
    const ctl = createGroomingBookingController(service);
    const res = makeRes();
    await ctl.listAppointments(makeReq({ query: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.data.total).toBe(1);
    expect(service.listAppointments).toHaveBeenCalledWith(AUTH_CUST, {});
  });

  test('GRM-CTL-05-UTCID02 [N] forwards status=BOOKED and upcoming=true query parameters', async () => {
    const service = { listAppointments: jest.fn(async () => ({ items: [], page: 1, limit: 20, total: 0, serverNow: '2026-11-26T08:00:00Z' })) };
    const ctl = createGroomingBookingController(service);
    const res = makeRes();
    await ctl.listAppointments(makeReq({ query: { status: 'BOOKED', upcoming: 'true' } }), res);
    expect(res.statusCode).toBe(200);
    expect(service.listAppointments).toHaveBeenCalledWith(AUTH_CUST, { status: 'BOOKED', upcoming: 'true' });
  });

  test('GRM-CTL-05-UTCID03 [B] forwards boundary page=1 and limit=1', async () => {
    const service = { listAppointments: jest.fn(async () => ({ items: [], page: 1, limit: 1, total: 0 })) };
    const res = makeRes();
    await createGroomingBookingController(service).listAppointments(makeReq({ query: { page: '1', limit: '1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.data.limit).toBe(1);
  });

  test('GRM-CTL-05-UTCID04 [B] forwards upper boundary limit=50', async () => {
    const service = { listAppointments: jest.fn(async () => ({ items: [], page: 1, limit: 50, total: 0 })) };
    const res = makeRes();
    await createGroomingBookingController(service).listAppointments(makeReq({ query: { page: '1', limit: '50' } }), res);
    expect(res.payload.data.limit).toBe(50);
  });

  test('GRM-CTL-05-UTCID05 [N] forwards status=CANCELLED filter', async () => {
    const service = { listAppointments: jest.fn(async () => ({ items: [], page: 1, limit: 20, total: 0 })) };
    const res = makeRes();
    await createGroomingBookingController(service).listAppointments(makeReq({ query: { status: 'CANCELLED' } }), res);
    expect(service.listAppointments).toHaveBeenCalledWith(AUTH_CUST, { status: 'CANCELLED' });
  });

  test('GRM-CTL-05-UTCID06 [N] includes correlationId in response meta envelope', async () => {
    const service = { listAppointments: jest.fn(async () => ({ items: [], page: 1, limit: 20, total: 0 })) };
    const res = makeRes();
    await createGroomingBookingController(service).listAppointments(makeReq({ correlationId: 'corr-abc' }), res);
    expect(res.payload.meta).toMatchObject({ correlationId: 'corr-abc', schemaVersion: 1 });
  });

  test('GRM-CTL-05-UTCID07 [A] propagates 401 UNAUTHENTICATED when req.auth is missing', async () => {
    const service = { listAppointments: jest.fn(async () => { throw new AppError(401, 'UNAUTHENTICATED', 'Auth required'); }) };
    await expect(createGroomingBookingController(service).listAppointments(makeReq({ auth: undefined }), makeRes()))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  test('GRM-CTL-05-UTCID08 [A] propagates 403 FORBIDDEN for non-customer role', async () => {
    const service = { listAppointments: jest.fn(async () => { throw new AppError(403, 'FORBIDDEN', 'Customer required'); }) };
    await expect(createGroomingBookingController(service).listAppointments(makeReq({ auth: { roles: ['STAFF'] } }), makeRes()))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  test('GRM-CTL-05-UTCID09 [A] propagates 422 VALIDATION_FAILED on unknown query field', async () => {
    const service = { listAppointments: jest.fn(async () => { throw new AppError(422, 'VALIDATION_FAILED', 'Unknown query field'); }) };
    await expect(createGroomingBookingController(service).listAppointments(makeReq({ query: { foo: '1' } }), makeRes()))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('GRM-CTL-05-UTCID10 [A] propagates 422 VALIDATION_FAILED on invalid status enum', async () => {
    const service = { listAppointments: jest.fn(async () => { throw new AppError(422, 'VALIDATION_FAILED', 'Unknown status'); }) };
    await expect(createGroomingBookingController(service).listAppointments(makeReq({ query: { status: 'INVALID' } }), makeRes()))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('GRM-CTL-05-UTCID11 [A] propagates 422 VALIDATION_FAILED on limit=0 below minimum', async () => {
    const service = { listAppointments: jest.fn(async () => { throw new AppError(422, 'VALIDATION_FAILED', 'Invalid limit'); }) };
    await expect(createGroomingBookingController(service).listAppointments(makeReq({ query: { limit: '0' } }), makeRes()))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('GRM-CTL-05-UTCID12 [A] propagates 422 VALIDATION_FAILED on limit=51 above maximum', async () => {
    const service = { listAppointments: jest.fn(async () => { throw new AppError(422, 'VALIDATION_FAILED', 'Invalid limit'); }) };
    await expect(createGroomingBookingController(service).listAppointments(makeReq({ query: { limit: '51' } }), makeRes()))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('GRM-CTL-05-UTCID13 [A] propagates 422 VALIDATION_FAILED on invalid upcoming flag', async () => {
    const service = { listAppointments: jest.fn(async () => { throw new AppError(422, 'VALIDATION_FAILED', 'Valid upcoming flag required'); }) };
    await expect(createGroomingBookingController(service).listAppointments(makeReq({ query: { upcoming: 'maybe' } }), makeRes()))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('GRM-CTL-05-UTCID14 [A] maps Mongoose ValidationError to 422 VALIDATION_FAILED via controllerAction', async () => {
    const service = { listAppointments: jest.fn(async () => { throw Object.assign(new Error('bad'), { name: 'ValidationError' }); }) };
    await expect(createGroomingBookingController(service).listAppointments(makeReq(), makeRes()))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('GRM-CTL-05-UTCID15 [A] maps duplicate key 11000 error to 409 VERSION_CONFLICT via controllerAction', async () => {
    const service = { listAppointments: jest.fn(async () => { throw Object.assign(new Error('dup'), { code: 11000 }); }) };
    await expect(createGroomingBookingController(service).listAppointments(makeReq(), makeRes()))
      .rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  });
});

describe('GRM-CTL-06 readAppointment (15 UTCs)', () => {
  test('GRM-CTL-06-UTCID01 [N] returns 200 with appointment view for valid owned appointment id', async () => {
    const service = { readAppointment: jest.fn(async () => ({ id: APPT_ID, code: 'GR-0001', status: 'BOOKED' })) };
    const res = makeRes();
    await createGroomingBookingController(service).readAppointment(makeReq({ params: { id: APPT_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.data).toEqual({ id: APPT_ID, code: 'GR-0001', status: 'BOOKED' });
    expect(service.readAppointment).toHaveBeenCalledWith(AUTH_CUST, APPT_ID);
  });

  test('GRM-CTL-06-UTCID02 [N] returns 200 for uppercase 24-hex ObjectId parameter', async () => {
    const upper = APPT_ID.toUpperCase();
    const service = { readAppointment: jest.fn(async () => ({ id: APPT_ID, code: 'GR-0002', status: 'CANCELLED' })) };
    const res = makeRes();
    await createGroomingBookingController(service).readAppointment(makeReq({ params: { id: upper } }), res);
    expect(service.readAppointment).toHaveBeenCalledWith(AUTH_CUST, upper);
    expect(res.statusCode).toBe(200);
  });

  test('GRM-CTL-06-UTCID03 [N] returns 200 for COMPLETED appointment with pricing details', async () => {
    const service = { readAppointment: jest.fn(async () => ({ id: APPT_ID, status: 'COMPLETED', pricing: { totalVnd: 180000 } })) };
    const res = makeRes();
    await createGroomingBookingController(service).readAppointment(makeReq({ params: { id: APPT_ID } }), res);
    expect(res.payload.data.pricing.totalVnd).toBe(180000);
  });

  test('GRM-CTL-06-UTCID04 [N] preserves correlationId and schemaVersion=1 in meta', async () => {
    const service = { readAppointment: jest.fn(async () => ({ id: APPT_ID })) };
    const res = makeRes();
    await createGroomingBookingController(service).readAppointment(makeReq({ params: { id: APPT_ID }, correlationId: 'c-99' }), res);
    expect(res.payload.meta).toMatchObject({ correlationId: 'c-99', schemaVersion: 1 });
  });

  test('GRM-CTL-06-UTCID05 [B] forwards lowest valid 24-zero hex ObjectId to service', async () => {
    const zeroId = '0'.repeat(24);
    const service = { readAppointment: jest.fn(async () => ({ id: zeroId })) };
    const res = makeRes();
    await createGroomingBookingController(service).readAppointment(makeReq({ params: { id: zeroId } }), res);
    expect(service.readAppointment).toHaveBeenCalledWith(AUTH_CUST, zeroId);
  });

  test('GRM-CTL-06-UTCID06 [B] forwards highest valid 24-f hex ObjectId to service', async () => {
    const maxId = 'f'.repeat(24);
    const service = { readAppointment: jest.fn(async () => ({ id: maxId })) };
    const res = makeRes();
    await createGroomingBookingController(service).readAppointment(makeReq({ params: { id: maxId } }), res);
    expect(service.readAppointment).toHaveBeenCalledWith(AUTH_CUST, maxId);
  });

  test('GRM-CTL-06-UTCID07 [A] propagates 404 RESOURCE_NOT_FOUND when appointment does not exist', async () => {
    const service = { readAppointment: jest.fn(async () => { throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Appointment not found'); }) };
    await expect(createGroomingBookingController(service).readAppointment(makeReq({ params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  test('GRM-CTL-06-UTCID08 [A] propagates 404 RESOURCE_NOT_FOUND when appointment belongs to another customer', async () => {
    const service = { readAppointment: jest.fn(async () => { throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Appointment not found'); }) };
    await expect(createGroomingBookingController(service).readAppointment(makeReq({ params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  test('GRM-CTL-06-UTCID09 [A] propagates 404 RESOURCE_NOT_FOUND for malformed non-ObjectId parameter', async () => {
    const service = { readAppointment: jest.fn(async () => { throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Appointment not found'); }) };
    await expect(createGroomingBookingController(service).readAppointment(makeReq({ params: { id: 'not-hex' } }), makeRes()))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  test('GRM-CTL-06-UTCID10 [A] propagates 401 UNAUTHENTICATED when actor is unauthenticated', async () => {
    const service = { readAppointment: jest.fn(async () => { throw new AppError(401, 'UNAUTHENTICATED', 'Auth required'); }) };
    await expect(createGroomingBookingController(service).readAppointment(makeReq({ auth: null, params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  test('GRM-CTL-06-UTCID11 [A] propagates 403 FORBIDDEN when actor is STAFF instead of CUSTOMER', async () => {
    const service = { readAppointment: jest.fn(async () => { throw new AppError(403, 'FORBIDDEN', 'Customer required'); }) };
    await expect(createGroomingBookingController(service).readAppointment(makeReq({ auth: { roles: ['STAFF'] }, params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  test('GRM-CTL-06-UTCID12 [A] propagates 403 FORBIDDEN when customer account is LOCKED or synthetic', async () => {
    const service = { readAppointment: jest.fn(async () => { throw new AppError(403, 'FORBIDDEN', 'Customer required'); }) };
    await expect(createGroomingBookingController(service).readAppointment(makeReq({ auth: { state: 'LOCKED', roles: ['CUSTOMER'] }, params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  test('GRM-CTL-06-UTCID13 [A] maps StrictModeError to 422 VALIDATION_FAILED', async () => {
    const service = { readAppointment: jest.fn(async () => { throw Object.assign(new Error('strict'), { name: 'StrictModeError' }); }) };
    await expect(createGroomingBookingController(service).readAppointment(makeReq({ params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('GRM-CTL-06-UTCID14 [A] maps Mongo duplicate key 11000 to 409 VERSION_CONFLICT', async () => {
    const service = { readAppointment: jest.fn(async () => { throw Object.assign(new Error('dup'), { code: 11000 }); }) };
    await expect(createGroomingBookingController(service).readAppointment(makeReq({ params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  });

  test('GRM-CTL-06-UTCID15 [A] rethrows unexpected repository Error unchanged', async () => {
    const service = { readAppointment: jest.fn(async () => { throw new Error('db down'); }) };
    await expect(createGroomingBookingController(service).readAppointment(makeReq({ params: { id: APPT_ID } }), makeRes()))
      .rejects.toThrow('db down');
  });
});

describe('GRM-CTL-07 cancelAppointment (6 UTCs)', () => {
  test('GRM-CTL-07-UTCID01 [N] returns 200 and cancelled appointment view on valid cancellation', async () => {
    const service = { cancelAppointment: jest.fn(async () => ({ id: APPT_ID, status: 'CANCELLED' })) };
    const res = makeRes();
    await createGroomingBookingController(service).cancelAppointment(makeReq({ params: { id: APPT_ID }, body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.data.status).toBe('CANCELLED');
    expect(service.cancelAppointment).toHaveBeenCalledWith(AUTH_CUST, APPT_ID, {});
  });

  test('GRM-CTL-07-UTCID02 [B] forwards undefined body cleanly when client sends empty POST', async () => {
    const service = { cancelAppointment: jest.fn(async () => ({ id: APPT_ID, status: 'CANCELLED' })) };
    const res = makeRes();
    await createGroomingBookingController(service).cancelAppointment(makeReq({ params: { id: APPT_ID }, body: undefined }), res);
    expect(service.cancelAppointment).toHaveBeenCalledWith(AUTH_CUST, APPT_ID, undefined);
  });

  test('GRM-CTL-07-UTCID03 [A] propagates 409 GROOMING_CANCEL_TOO_LATE when < 2 hours before startAt', async () => {
    const service = { cancelAppointment: jest.fn(async () => { throw new AppError(409, 'GROOMING_CANCEL_TOO_LATE', 'Too late'); }) };
    await expect(createGroomingBookingController(service).cancelAppointment(makeReq({ params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 409, code: 'GROOMING_CANCEL_TOO_LATE' });
  });

  test('GRM-CTL-07-UTCID04 [A] propagates 409 GROOMING_APPOINTMENT_NOT_CANCELLABLE when status is not BOOKED', async () => {
    const service = { cancelAppointment: jest.fn(async () => { throw new AppError(409, 'GROOMING_APPOINTMENT_NOT_CANCELLABLE', 'Not cancellable'); }) };
    await expect(createGroomingBookingController(service).cancelAppointment(makeReq({ params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 409, code: 'GROOMING_APPOINTMENT_NOT_CANCELLABLE' });
  });

  test('GRM-CTL-07-UTCID05 [A] propagates 404 RESOURCE_NOT_FOUND for unknown appointment', async () => {
    const service = { cancelAppointment: jest.fn(async () => { throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Not found'); }) };
    await expect(createGroomingBookingController(service).cancelAppointment(makeReq({ params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  test('GRM-CTL-07-UTCID06 [A] propagates 403 FORBIDDEN for non-customer actor', async () => {
    const service = { cancelAppointment: jest.fn(async () => { throw new AppError(403, 'FORBIDDEN', 'Customer required'); }) };
    await expect(createGroomingBookingController(service).cancelAppointment(makeReq({ auth: { roles: ['ADMIN'] }, params: { id: APPT_ID } }), makeRes()))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
