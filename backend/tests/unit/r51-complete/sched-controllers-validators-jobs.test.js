import { describe, expect, jest, test } from '@jest/globals';
import { createNeedsActionController } from '../../../src/controllers/needs-action.controller.js';
import { createVisitClosureController } from '../../../src/controllers/visit-closure.controller.js';
import { createVisitContactController } from '../../../src/controllers/visit-contact.controller.js';
import { createWithdrawalReviewController } from '../../../src/controllers/withdrawal-review.controller.js';
import { createVisitHandoverController } from '../../../src/controllers/visit-handover.controller.js';
import { visitBoardQuery, visitContactQuery } from '../../../src/validators/needs-action.validator.js';
import { visitClosureInput, visitClosureVerificationInput } from '../../../src/validators/visit-closure.validator.js';
import { withdrawalReviewInput } from '../../../src/validators/withdrawal-review.validator.js';
import { handoverConfirmationInput } from '../../../src/validators/visit-handover.validator.js';
import { startProductPickupExpiryWorker } from '../../../src/jobs/product-pickup-expiry.job.js';
import { startVisitCompletionMonitor } from '../../../src/jobs/visit-completion-monitor.job.js';
import { AppError } from '../../../src/utils/app-error.js';

const VID = '507f1f77bcf86cd799439011';
const HASH64 = 'b'.repeat(64);
const STAFF = { userId: '507f1f77bcf86cd799439099', state: 'ACTIVE', roles: ['STAFF'] };

function makeReq(overrides = {}) {
  const headers = new Map(Object.entries(overrides.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    auth: STAFF,
    params: { id: VID },
    query: {},
    body: {},
    correlationId: 'corr-1',
    get: k => headers.get(String(k).toLowerCase()),
    ...overrides
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    payload: null,
    set: jest.fn((k, v) => { res.headers[k] = v; return res; }),
    status: jest.fn((c) => { res.statusCode = c; return res; }),
    json: jest.fn((b) => { res.payload = b; return res; })
  };
  return res;
}

describe('Scheduling Controllers', () => {
  // ACTION-CTL-01
  test('ACTION-CTL-01-UTCID01 [N] forwards auth and query to needsAction service.list and wraps meta', async () => {
    const service = { list: jest.fn(async () => ({ tab: 'needs-action', items: [] })) };
    const res = makeRes();
    await createNeedsActionController(service).list(makeReq({ query: { tab: 'needs-action' } }), res);
    expect(res.payload.data.tab).toBe('needs-action');
    expect(service.list).toHaveBeenCalledWith(STAFF, { tab: 'needs-action' });
  });
  test('ACTION-CTL-01-UTCID02 [A] propagates FORBIDDEN AppError from service.list', async () => {
    const service = { list: jest.fn(async () => { throw new AppError(403, 'FORBIDDEN', 'Staff required'); }) };
    await expect(createNeedsActionController(service).list(makeReq(), makeRes())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // CLOSE-CTL-01..04
  test('CLOSE-CTL-01-UTCID01 [N] list returns service.needsAction(req.auth) envelope', async () => {
    const service = { needsAction: jest.fn(async () => ({ items: [{ id: VID }], hasMore: false })) };
    const res = makeRes();
    await createVisitClosureController(service).list(makeReq(), res);
    expect(res.payload.data.items).toHaveLength(1);
  });
  test('CLOSE-CTL-01-UTCID02 [A] list propagates 403 FORBIDDEN', async () => {
    const service = { needsAction: jest.fn(async () => { throw new AppError(403, 'FORBIDDEN', 'Denied'); }) };
    await expect(createVisitClosureController(service).list(makeReq(), makeRes())).rejects.toMatchObject({ status: 403 });
  });

  test('CLOSE-CTL-02-UTCID01 [N] details validates ObjectId param and calls service.details', async () => {
    const service = { details: jest.fn(async () => ({ id: VID, state: 'IN_PROGRESS' })) };
    const res = makeRes();
    await createVisitClosureController(service).details(makeReq(), res);
    expect(service.details).toHaveBeenCalledWith(STAFF, VID);
    expect(res.payload.data.id).toBe(VID);
  });
  test('CLOSE-CTL-02-UTCID02 [A] details rejects invalid non-hex24 id before calling service', async () => {
    const service = { details: jest.fn() };
    await expect(createVisitClosureController(service).details(makeReq({ params: { id: 'bad' } }), makeRes()))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(service.details).not.toHaveBeenCalled();
  });

  test('CLOSE-CTL-03-UTCID01 [N] close forwards auth, validated id, body, and idempotency-key', async () => {
    const service = { close: jest.fn(async () => ({ visitId: VID, state: 'STAFF_CLOSED', version: 2 })) };
    const res = makeRes();
    await createVisitClosureController(service).close(
      makeReq({ body: { expectedVersion: 1, reason: 'Quên checkout' }, headers: { 'idempotency-key': 'k-12345678' } }),
      res
    );
    expect(service.close).toHaveBeenCalledWith(STAFF, VID, { expectedVersion: 1, reason: 'Quên checkout' }, 'k-12345678');
    expect(res.payload.data.state).toBe('STAFF_CLOSED');
  });
  test('CLOSE-CTL-03-UTCID02 [A] close rejects invalid visit id parameter', async () => {
    const service = { close: jest.fn() };
    await expect(createVisitClosureController(service).close(makeReq({ params: { id: '123' } }), makeRes()))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  test('CLOSE-CTL-04-UTCID01 [N] verify forwards admin verification payload and idempotency-key', async () => {
    const service = { verify: jest.fn(async () => ({ visitId: VID, reviewState: 'VERIFIED' })) };
    const res = makeRes();
    await createVisitClosureController(service).verify(
      makeReq({ body: { outcome: 'NO_SERVICE' }, headers: { 'idempotency-key': 'v-12345678' } }),
      res
    );
    expect(service.verify).toHaveBeenCalledWith(STAFF, VID, { outcome: 'NO_SERVICE' }, 'v-12345678');
    expect(res.payload.data.reviewState).toBe('VERIFIED');
  });
  test('CLOSE-CTL-04-UTCID02 [A] verify rejects invalid visit id parameter', async () => {
    const service = { verify: jest.fn() };
    await expect(createVisitClosureController(service).verify(makeReq({ params: { id: 'bad' } }), makeRes()))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  // CONTACT-CTL-01
  test('CONTACT-CTL-01-UTCID01 [N] sets Cache-Control private, no-store and returns phone payload', async () => {
    const service = { read: jest.fn(async () => ({ party: 'sitter', displayName: 'Lan', phone: '0912345678' })) };
    const res = makeRes();
    await createVisitContactController(service).read(makeReq({ query: { party: 'sitter' } }), res);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.payload.data.phone).toBe('0912345678');
  });
  test('CONTACT-CTL-01-UTCID02 [A] rejects invalid visit id before service lookup', async () => {
    const service = { read: jest.fn() };
    await expect(createVisitContactController(service).read(makeReq({ params: { id: 'invalid' } }), makeRes()))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  // WITHDRAW-CTL-01..02
  test('WITHDRAW-CTL-01-UTCID01 [N] details returns 200 envelope from withdrawalReview service', async () => {
    const service = { details: jest.fn(async () => ({ visitId: VID, version: 1, reasonCode: 'EMERGENCY' })) };
    const res = makeRes();
    await createWithdrawalReviewController(service).details(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.data.reasonCode).toBe('EMERGENCY');
  });
  test('WITHDRAW-CTL-01-UTCID02 [A] details propagates 404 RESOURCE_NOT_FOUND', async () => {
    const service = { details: jest.fn(async () => { throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Missing'); }) };
    await expect(createWithdrawalReviewController(service).details(makeReq(), makeRes()))
      .rejects.toMatchObject({ status: 404 });
  });

  test('WITHDRAW-CTL-02-UTCID01 [N] decide forwards body and idempotency-key and returns 200', async () => {
    const service = { decide: jest.fn(async () => ({ visitId: VID, decision: 'RELEASE', version: 2 })) };
    const res = makeRes();
    await createWithdrawalReviewController(service).decide(
      makeReq({ body: { decision: 'RELEASE', expectedVersion: 1, reason: 'Duyệt' }, headers: { 'idempotency-key': 'w-12345678' } }),
      res
    );
    expect(service.decide).toHaveBeenCalledWith(STAFF, VID, { decision: 'RELEASE', expectedVersion: 1, reason: 'Duyệt' }, 'w-12345678');
    expect(res.statusCode).toBe(200);
  });
  test('WITHDRAW-CTL-02-UTCID02 [A] decide maps duplicate 11000 error to 409 VERSION_CONFLICT', async () => {
    const service = { decide: jest.fn(async () => { throw Object.assign(new Error('dup'), { code: 11000 }); }) };
    await expect(createWithdrawalReviewController(service).decide(makeReq(), makeRes()))
      .rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  });

  // HANDOVER-CTL-01
  test('HANDOVER-CTL-01-UTCID01 [N] get and confirm forward params, body, and Idempotency-Key with 200 status', async () => {
    const service = {
      get: jest.fn(async () => ({ visitId: VID, state: 'PENDING' })),
      confirm: jest.fn(async () => ({ visitId: VID, state: 'CONFIRMED', version: 2 }))
    };
    const ctl = createVisitHandoverController(service);
    const resGet = makeRes();
    await ctl.get(makeReq(), resGet);
    expect(resGet.payload.data.state).toBe('PENDING');

    const resConfirm = makeRes();
    await ctl.confirm(makeReq({ body: { expectedVersion: 1 }, headers: { 'Idempotency-Key': 'h-12345678' } }), resConfirm);
    expect(service.confirm).toHaveBeenCalledWith(STAFF, VID, { expectedVersion: 1 }, 'h-12345678');
    expect(resConfirm.payload.data.state).toBe('CONFIRMED');
  });
});

describe('Scheduling Validators', () => {
  // ACTION-IN-01
  test('ACTION-IN-01-UTCID01 [N] defaults tab to needs-action and normalizes search NFC/whitespace', () => {
    expect(visitBoardQuery({ search: '  Nguyễn   An  ', areaCode: 'HN_CAU_GIAY', reason: 'NO_SITTER_24H' }))
      .toEqual({ tab: 'needs-action', search: 'Nguyễn An', areaCode: 'HN_CAU_GIAY', reason: 'NO_SITTER_24H' });
  });
  test('ACTION-IN-01-UTCID02 [B] accepts visitId when tab=all and 2-char minimum search', () => {
    expect(visitBoardQuery({ tab: 'all', visitId: VID, search: 'An' }))
      .toEqual({ tab: 'all', visitId: VID, search: 'An' });
  });
  test('ACTION-IN-01-UTCID03 [A] rejects visitId on needs-action tab, unknown keys, or short search', () => {
    expect(() => visitBoardQuery({ visitId: VID })).toThrow(/All tab/);
    expect(() => visitBoardQuery({ unknownKey: '1' })).toThrow();
    expect(() => visitBoardQuery({ search: 'a' })).toThrow();
  });

  // ACTION-IN-02
  test('ACTION-IN-02-UTCID01 [N] accepts party=sitter and party=customer', () => {
    expect(visitContactQuery({ party: 'sitter' })).toEqual({ party: 'sitter' });
    expect(visitContactQuery({ party: 'customer' })).toEqual({ party: 'customer' });
  });
  test('ACTION-IN-02-UTCID02 [A] rejects missing party, extra query keys, or unsupported party value', () => {
    expect(() => visitContactQuery({})).toThrow();
    expect(() => visitContactQuery({ party: 'sitter', extra: '1' })).toThrow();
    expect(() => visitContactQuery({ party: 'admin' })).toThrow();
  });

  // CLOSE-IN-01
  test('CLOSE-IN-01-UTCID01 [N] trims closure reason and validates expectedVersion', () => {
    expect(visitClosureInput({ expectedVersion: 0, reason: '  Khách báo sitter đã về  ' }))
      .toEqual({ expectedVersion: 0, reason: 'Khách báo sitter đã về' });
  });
  test('CLOSE-IN-01-UTCID02 [B] accepts 1000-char reason and rejects 1001-char or blank reason', () => {
    expect(visitClosureInput({ expectedVersion: 5, reason: 'a'.repeat(1000) }).reason).toHaveLength(1000);
    expect(() => visitClosureInput({ expectedVersion: 5, reason: 'a'.repeat(1001) })).toThrow();
    expect(() => visitClosureInput({ expectedVersion: 5, reason: '   ' })).toThrow();
  });

  // CLOSE-IN-02
  test('CLOSE-IN-02-UTCID01 [N] validates SERVICE_PERFORMED with ISO UTC actualEndedAt and boolean reportsComplete', () => {
    const out = visitClosureVerificationInput({
      expectedVersion: 2,
      reason: 'Đã đối chiếu camera',
      outcome: 'SERVICE_PERFORMED',
      evidenceReference: 'CAM-2026-11-26',
      actualEndedAt: '2026-11-26T09:00:00.000Z',
      reportsComplete: true
    });
    expect(out.actualEndedAt).toBeInstanceOf(Date);
    expect(out.reportsComplete).toBe(true);
  });
  test('CLOSE-IN-02-UTCID02 [N] validates NO_SERVICE without worked-time fields and rejects actualEndedAt on NO_SERVICE', () => {
    expect(visitClosureVerificationInput({
      expectedVersion: 1,
      reason: 'Không thực hiện dịch vụ',
      outcome: 'NO_SERVICE',
      evidenceReference: 'CALL-LOG-01'
    })).toEqual({
      expectedVersion: 1,
      reason: 'Không thực hiện dịch vụ',
      outcome: 'NO_SERVICE',
      evidenceReference: 'CALL-LOG-01'
    });
    expect(() => visitClosureVerificationInput({
      expectedVersion: 1,
      reason: 'Không thực hiện',
      outcome: 'NO_SERVICE',
      evidenceReference: 'CALL-LOG-01',
      reportsComplete: false
    })).toThrow();
  });

  // WITHDRAW-IN-01
  test('WITHDRAW-IN-01-UTCID01 [N] accepts RELEASE and REJECT decisions with trimmed reason', () => {
    expect(withdrawalReviewInput({ expectedVersion: 1, decision: 'RELEASE', reason: '  Ốm đột xuất  ' }))
      .toEqual({ expectedVersion: 1, decision: 'RELEASE', reason: 'Ốm đột xuất' });
    expect(withdrawalReviewInput({ expectedVersion: 0, decision: 'REJECT', reason: 'Không hợp lệ' }).decision).toBe('REJECT');
  });
  test('WITHDRAW-IN-01-UTCID02 [A] rejects invalid decision enum, blank reason, or reason > 1000 chars', () => {
    expect(() => withdrawalReviewInput({ expectedVersion: 1, decision: 'APPROVE', reason: 'ok' })).toThrow();
    expect(() => withdrawalReviewInput({ expectedVersion: 1, decision: 'RELEASE', reason: '   ' })).toThrow();
    expect(() => withdrawalReviewInput({ expectedVersion: 1, decision: 'RELEASE', reason: 'x'.repeat(1001) })).toThrow();
  });

  // HANDOVER-IN-01
  test('HANDOVER-IN-01-UTCID01 [N] accepts valid expectedVersion, 64-hex careVersion, acknowledged=true, and schedulingKey', () => {
    const body = { expectedVersion: 2, careVersion: HASH64, acknowledged: true };
    expect(handoverConfirmationInput(body, 'handover-key-01')).toEqual(body);
  });
  test('HANDOVER-IN-01-UTCID02 [A] rejects acknowledged=false, non-sha256 careVersion, or short idempotency key', () => {
    expect(() => handoverConfirmationInput({ expectedVersion: 2, careVersion: HASH64, acknowledged: false }, 'handover-key-01')).toThrow();
    expect(() => handoverConfirmationInput({ expectedVersion: 2, careVersion: 'short', acknowledged: true }, 'handover-key-01')).toThrow();
    expect(() => handoverConfirmationInput({ expectedVersion: 2, careVersion: HASH64, acknowledged: true }, 'short')).toThrow();
  });
});

describe('Background Jobs (PICKUP-JOB-01 & COMPLETE-JOB-01)', () => {
  test('PICKUP-JOB-01-UTCID01 [N] returns null when disabled, runs batch on interval when enabled, and awaits in-flight run on stop()', async () => {
    jest.useFakeTimers();
    try {
      expect(startProductPickupExpiryWorker({ enabled: false, createService: jest.fn() })).toBeNull();

      let resolveBatch;
      const runBatch = jest.fn(() => new Promise(resolve => { resolveBatch = resolve; }));
      const logger = jest.fn();
      const worker = startProductPickupExpiryWorker({
        enabled: true,
        createService: () => ({ runBatch }),
        logger
      });

      jest.advanceTimersByTime(5 * 60_000);
      expect(runBatch).toHaveBeenCalledTimes(1);

      const stopPromise = worker.stop();
      resolveBatch({ cancelled: 2, failed: 0, kept: 0 });
      await stopPromise;
      expect(logger).toHaveBeenCalledWith(expect.objectContaining({ event: 'product_pickup_expiry_batch', cancelled: 2 }));
    } finally {
      jest.useRealTimers();
    }
  });

  test('COMPLETE-JOB-01-UTCID01 [N] ticks immediately, logs notified batches, and stops cleanly awaiting active batch', async () => {
    jest.useFakeTimers();
    try {
      const logger = jest.fn();
      const runBatch = jest.fn(async () => ({ notified: 1, reviewed: 1 }));
      const job = startVisitCompletionMonitor({ service: { runBatch }, logger, intervalMs: 1000 });
      await Promise.resolve();
      await Promise.resolve();
      expect(runBatch).toHaveBeenCalledTimes(1);
      await job.stop();
      jest.advanceTimersByTime(5000);
      expect(runBatch).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('COMPLETE-JOB-01-UTCID02 [A] throws TypeError when service.runBatch is missing or intervalMs < 1000', () => {
    expect(() => startVisitCompletionMonitor({ service: null })).toThrow(TypeError);
    expect(() => startVisitCompletionMonitor({ service: { runBatch: () => {} }, intervalMs: 500 })).toThrow(TypeError);
  });
});
