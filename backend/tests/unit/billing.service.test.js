import { expect, test } from '@jest/globals';
import { createBillingService, paymentModeForOriginalVisitCount } from '../../src/services/billing/billing.service.js';

const date = value => new Date(value);

function setup({ bookingContext, visitContext, eligibility, existingIntent = null } = {}) {
  const calls = { findOwnedPaymentContext: [], findOwnedVisitBillingContext: [], replayIntent: [], createIntent: [], issueBill: [] };
  const ports = {
    bookings: {
      findOwnedPaymentContext: async input => { calls.findOwnedPaymentContext.push(input); return bookingContext; },
      findOwnedVisitBillingContext: async input => { calls.findOwnedVisitBillingContext.push(input); return visitContext; },
    },
    paymentIntents: {
      replayExistingIntent: async input => { calls.replayIntent.push(input); return existingIntent; },
      createOrReplayPending: async input => { calls.createIntent.push(input); return { id: 'intent-1', state: 'PENDING', ...input }; },
    },
    postpayEligibility: {
      resolve: async input => ({ ...eligibility, input }),
    },
    bills: {
      issueIfAbsent: async input => { calls.issueBill.push(input); return { id: 'bill-1', state: 'ISSUED', ...input }; },
    },
    clock: () => date('2026-10-14T03:00:00.000Z'),
  };
  return { service: createBillingService(ports), calls };
}

function prepayContext(overrides = {}) {
  return {
    bookingState: 'AWAITING_PAYMENT', version: 3,
    paymentTerms: {
      originalVisitCount: 3, paymentMode: 'PREPAY', quoteVersion: 7,
      quoteSnapshotVersion: 'quote-snapshot-7', amountVnd: 600000, currency: 'VND',
      paymentDeadlineAt: date('2026-10-14T04:00:00.000Z'), paymentState: 'UNPAID',
    },
    ...overrides,
  };
}

function postpayContexts(overrides = {}) {
  return {
    visitContext: {
      bookingState: 'COMPLETED', visitState: 'COMPLETED', version: 5,
      completedAt: date('2026-10-13T02:00:00.000Z'),
      paymentTerms: { originalVisitCount: 1, paymentMode: 'POSTPAY', quoteVersion: 2 },
      ...overrides.visit,
    },
    eligibility: {
      state: 'READY', holdRefs: [], snapshotVersion: 'bill-snapshot-2',
      amountVnd: 300000, currency: 'VND', dueAt: date('2026-10-15T02:00:00.000Z'),
      ...overrides.eligibility,
    },
  };
}

function errorWithCode(promise, code) {
  return expect(promise).rejects.toMatchObject({ code });
}

test.each([[1, 'POSTPAY'], [2, 'PREPAY'], [3, 'PREPAY']])(
  'payment mode comes from original visit count %s, not the remaining count', (originalVisitCount, mode) => {
    expect(paymentModeForOriginalVisitCount(originalVisitCount)).toBe(mode);
  },
);

test('multi-visit payment intent uses server snapshot and remains pending without dispatch', async () => {
  const { service, calls } = setup({ bookingContext: prepayContext() });
  const result = await service.createPrepaymentIntent({
    actorId: 'customer-1', bookingId: 'booking-1', quoteVersion: 7,
    expectedVersion: 3, idempotencyKey: 'payment-command-1',
  });
  expect(result).toMatchObject({ paymentMode: 'PREPAY', dispatchAllowed: false, intent: { state: 'PENDING' } });
  expect(calls.createIntent[0]).toMatchObject({ amountVnd: 600000, currency: 'VND', originalVisitCount: 3 });
  expect(calls.createIntent[0]).not.toHaveProperty('dispatch');
});

test('same-key retry returns the stored intent before current state, version, or deadline gates', async () => {
  const existingIntent = { id: 'intent-1', state: 'PAID' };
  const { service, calls } = setup({
    bookingContext: prepayContext({
      bookingState: 'COMPLETED',
      version: 4,
      paymentTerms: {
        ...prepayContext().paymentTerms,
        paymentState: 'PAID',
        paymentDeadlineAt: date('2026-10-14T02:00:00.000Z'),
      },
    }),
    existingIntent,
  });

  await expect(service.createPrepaymentIntent({
    actorId: 'customer-1', bookingId: 'booking-1', quoteVersion: 7,
    expectedVersion: 3, idempotencyKey: 'payment-command-1',
  })).resolves.toMatchObject({ intent: existingIntent, paymentMode: 'PREPAY', dispatchAllowed: false });
  expect(calls.replayIntent[0]).toEqual({
    actorId: 'customer-1', bookingId: 'booking-1', idempotencyKey: 'payment-command-1',
    expectedVersion: 3, quoteVersion: 7,
  });
  expect(calls.createIntent).toHaveLength(0);
});

test('a multi-visit booking never downgrades to postpay when only one visit remains', async () => {
  const { service, calls } = setup({ bookingContext: prepayContext({ remainingVisitCount: 1 }) });
  await service.createPrepaymentIntent({
    actorId: 'customer-1', bookingId: 'booking-1', quoteVersion: 7,
    expectedVersion: 3, idempotencyKey: 'stable-key',
  });
  expect(calls.createIntent[0].originalVisitCount).toBe(3);
  expect(calls.createIntent[0].remainingVisitCount).toBeUndefined();
});

test.each([0, -100, 12.5, Number.MAX_SAFE_INTEGER + 1])(
  'zero or noninteger server payment snapshot %s fails closed', async amountVnd => {
    const { service, calls } = setup({ bookingContext: prepayContext({
      paymentTerms: { ...prepayContext().paymentTerms, amountVnd },
    }) });
    await errorWithCode(service.createPrepaymentIntent({
      actorId: 'customer-1', bookingId: 'booking-1', quoteVersion: 7,
      expectedVersion: 3, idempotencyKey: 'payment-command-1',
    }), 'DECISION_REQUIRED');
    expect(calls.createIntent).toHaveLength(0);
  },
);

test('one-visit postpay bill is issued only from completed, hold-free server snapshot', async () => {
  const contexts = postpayContexts();
  const { service, calls } = setup(contexts);
  const result = await service.issuePostpayBill({
    actorId: 'customer-1', bookingId: 'booking-1', visitId: 'visit-1',
    expectedVersion: 5, idempotencyKey: 'bill-command-1',
  });
  expect(result.bill).toMatchObject({ state: 'ISSUED', amountVnd: 300000, currency: 'VND' });
  expect(calls.issueBill[0]).toMatchObject({ dueAt: contexts.eligibility.dueAt, holdRefs: [] });
  expect(calls.issueBill[0]).not.toHaveProperty('paymentState');
});

test('open holds keep the bill unissued', async () => {
  const contexts = postpayContexts({ eligibility: { state: 'READY', holdRefs: ['case-1'] } });
  const { service, calls } = setup(contexts);
  await errorWithCode(service.issuePostpayBill({
    actorId: 'customer-1', bookingId: 'booking-1', visitId: 'visit-1',
    expectedVersion: 5, idempotencyKey: 'bill-command-1',
  }), 'DECISION_REQUIRED');
  expect(calls.issueBill).toHaveLength(0);
});

test('incomplete visit or multi-visit booking cannot receive a postpay bill', async () => {
  const incomplete = postpayContexts({ visit: { visitState: 'IN_PROGRESS' } });
  const first = setup(incomplete);
  await errorWithCode(first.service.issuePostpayBill({
    actorId: 'customer-1', bookingId: 'booking-1', visitId: 'visit-1',
    expectedVersion: 5, idempotencyKey: 'bill-command-1',
  }), 'INVALID_STATE');

  const multi = postpayContexts({ visit: { paymentTerms: { originalVisitCount: 2, paymentMode: 'PREPAY' } } });
  const second = setup(multi);
  await errorWithCode(second.service.issuePostpayBill({
    actorId: 'customer-1', bookingId: 'booking-1', visitId: 'visit-1',
    expectedVersion: 5, idempotencyKey: 'bill-command-1',
  }), 'INVALID_STATE');
  expect(second.calls.issueBill).toHaveLength(0);
});

test('ownership mismatch and stale versions fail before writing', async () => {
  const notOwned = setup({ bookingContext: null });
  await errorWithCode(notOwned.service.createPrepaymentIntent({
    actorId: 'other-customer', bookingId: 'booking-1', quoteVersion: 7,
    expectedVersion: 3, idempotencyKey: 'payment-command-1',
  }), 'RESOURCE_NOT_FOUND');
  expect(notOwned.calls.createIntent).toHaveLength(0);

  const stale = setup({ bookingContext: prepayContext({ version: 4 }) });
  await errorWithCode(stale.service.createPrepaymentIntent({
    actorId: 'customer-1', bookingId: 'booking-1', quoteVersion: 7,
    expectedVersion: 3, idempotencyKey: 'payment-command-1',
  }), 'VERSION_CONFLICT');
  expect(stale.calls.createIntent).toHaveLength(0);
});

test('missing timing/rounding decisions block a payment command without inventing a deadline', async () => {
  const { service, calls } = setup({ bookingContext: prepayContext({
    paymentTerms: { ...prepayContext().paymentTerms, paymentDeadlineAt: null, quoteSnapshotVersion: null },
  }) });
  const error = service.createPrepaymentIntent({
    actorId: 'customer-1', bookingId: 'booking-1', quoteVersion: 7,
    expectedVersion: 3, idempotencyKey: 'payment-command-1',
  });
  await expect(error).rejects.toMatchObject({ code: 'DECISION_REQUIRED', details: { decisionIds: ['FIN-01-TIME', 'FIN-02-ALLOC'] } });
  expect(calls.createIntent).toHaveLength(0);
});

test('idempotency key and original quote snapshot are passed to atomic repositories', async () => {
  const { service, calls } = setup({ bookingContext: prepayContext() });
  await service.createPrepaymentIntent({
    actorId: 'customer-1', bookingId: 'booking-1', quoteVersion: 7,
    expectedVersion: 3, idempotencyKey: 'same-logical-payment',
  });
  await service.createPrepaymentIntent({
    actorId: 'customer-1', bookingId: 'booking-1', quoteVersion: 7,
    expectedVersion: 3, idempotencyKey: 'same-logical-payment',
  });
  expect(calls.createIntent).toHaveLength(2);
  expect(calls.createIntent[0]).toMatchObject({ idempotencyKey: 'same-logical-payment', quoteSnapshotVersion: 'quote-snapshot-7' });
});

test('invalid service ports fail at composition time', () => {
  expect(() => createBillingService({})).toThrow(TypeError);
});
