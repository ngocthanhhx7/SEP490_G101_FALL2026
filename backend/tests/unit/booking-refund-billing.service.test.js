import { describe, expect, jest, test } from '@jest/globals';
import { Types } from 'mongoose';
import { createBookingRefundBilling } from '../../src/services/complaints/booking-refund-billing.service.js';

function fakeConnection({ payments = [], refunds = [] } = {}) {
  const storedRefunds = [...refunds];
  const makeCursor = rows => ({
    limit(n) {
      return { toArray: async () => rows.slice(0, n) };
    }
  });
  return {
    storedRefunds,
    db: {
      collection(name) {
        if (name === 'payments') {
          return { find: jest.fn(() => makeCursor(payments)) };
        }
        if (name === 'refunds') {
          return {
            find: jest.fn(() => makeCursor(storedRefunds)),
            findOne: jest.fn(async query => storedRefunds.find(r => r._id === query._id) ?? null),
            insertOne: jest.fn(async doc => { storedRefunds.push(doc); return { insertedId: doc._id }; }),
            updateMany: jest.fn(async (filter, update) => {
              let modifiedCount = 0;
              for (const row of storedRefunds) {
                if (String(row.bookingId) === String(filter.bookingId)
                  && row.sourceRef?.type === filter['sourceRef.type']
                  && row.sourceRef?.id === filter['sourceRef.id']
                  && row.state === filter.state) {
                  Object.assign(row, update.$set);
                  modifiedCount++;
                }
              }
              return { modifiedCount };
            })
          };
        }
        throw new Error('Unexpected collection ' + name);
      }
    }
  };
}

describe('createBookingRefundBilling (ST-CAS-10)', () => {
  const bookingId = String(new Types.ObjectId());
  const session = { id: 'tx-1' };
  const at = new Date('2026-11-24T06:00:00Z');

  test('throws without a database connection', () => {
    expect(() => createBookingRefundBilling({})).toThrow(TypeError);
  });

  test('read returns null for invalid bookingId, missing/multiple verified payments, or invalid currency', async () => {
    const empty = createBookingRefundBilling({ connection: fakeConnection() });
    expect(await empty.read({ bookingId: 'not-an-oid' })).toBeNull();
    expect(await empty.read({ bookingId })).toBeNull();

    const dup = createBookingRefundBilling({
      connection: fakeConnection({
        payments: [
          { state: 'VERIFIED', receiptMoney: { amountVnd: 100000, currency: 'VND' } },
          { state: 'VERIFIED', receiptMoney: { amountVnd: 100000, currency: 'VND' } }
        ]
      })
    });
    expect(await dup.read({ bookingId })).toBeNull();

    const badCurrency = createBookingRefundBilling({
      connection: fakeConnection({
        payments: [{ state: 'VERIFIED', receiptMoney: { amountVnd: 100000, currency: 'USD' } }]
      })
    });
    expect(await badCurrency.read({ bookingId })).toBeNull();
  });

  test('read sums only active refund states and ignores REJECTED/FAILED/REPLACED/PROPOSED', async () => {
    const connection = fakeConnection({
      payments: [{ state: 'VERIFIED', receiptMoney: { amountVnd: 400000, currency: 'VND' } }],
      refunds: [
        { amountVnd: 50000, state: 'RECORDED' },
        { amountVnd: 30000, status: 'PAID' },
        { amountVnd: 20000, state: 'APPROVED' },
        { amountVnd: 90000, state: 'REJECTED' },
        { amountVnd: 80000, state: 'REPLACED' },
        { amountVnd: 70000, state: 'PROPOSED' },
        { amountVnd: 60000, state: 'FAILED' }
      ]
    });
    const billing = createBookingRefundBilling({ connection });
    expect(await billing.read({ bookingId, session })).toEqual({
      basis: 'ISSUED', basisAmountVnd: 400000, approvedTotalVnd: 100000, paidInFull: true, billTotalVnd: 300000
    });
  });

  test('read fails closed if any active refund row has corrupt amountVnd', async () => {
    const connection = fakeConnection({
      payments: [{ state: 'VERIFIED', receiptMoney: { amountVnd: 300000, currency: 'VND' } }],
      refunds: [{ amountVnd: -100, state: 'RECORDED' }]
    });
    expect(await createBookingRefundBilling({ connection }).read({ bookingId })).toBeNull();
  });

  test('applyAdjustment rejects invalid arguments or non-accounting disposition', async () => {
    const billing = createBookingRefundBilling({ connection: fakeConnection() });
    expect(await billing.applyAdjustment({
      session: null, bookingId, complaintId: 'c1', amountVnd: 10000, disposition: 'ACCOUNTING_REFUND', ref: 'r1', at
    })).toEqual({ applied: false });
    expect(await billing.applyAdjustment({
      session, bookingId, complaintId: 'c1', amountVnd: 10000, disposition: 'BILL_CREDIT', ref: 'r1', at
    })).toEqual({ applied: false });
  });

  test('applyAdjustment records initial refund idempotently and supports increase/decrease/zero adjustments', async () => {
    const connection = fakeConnection({
      payments: [{ state: 'VERIFIED', receiptMoney: { amountVnd: 300000, currency: 'VND' } }]
    });
    const billing = createBookingRefundBilling({ connection });

    // Initial approve: 100,000
    const first = await billing.applyAdjustment({
      session, bookingId, complaintId: 'case-1', amountVnd: 100000, priorAmountVnd: 0,
      disposition: 'ACCOUNTING_REFUND', ref: 'complaint:case-1:v2', actorId: 'admin-1', at
    });
    expect(first).toEqual({ applied: true, refundId: 'complaint:case-1:v2' });

    // Replay same ref -> idempotent, still 1 doc
    const replay = await billing.applyAdjustment({
      session, bookingId, complaintId: 'case-1', amountVnd: 100000, priorAmountVnd: 0,
      disposition: 'ACCOUNTING_REFUND', ref: 'complaint:case-1:v2', actorId: 'admin-1', at
    });
    expect(replay).toEqual({ applied: true, refundId: 'complaint:case-1:v2' });
    expect(connection.storedRefunds).toHaveLength(1);

    // Increase on escalation from 100,000 -> 140,000 adds delta 40,000
    const increased = await billing.applyAdjustment({
      session, bookingId, complaintId: 'case-1', amountVnd: 140000, priorAmountVnd: 100000,
      disposition: 'ACCOUNTING_REFUND', ref: 'complaint:case-1:v4', actorId: 'admin-1', at
    });
    expect(increased).toEqual({ applied: true, refundId: 'complaint:case-1:v4' });
    expect(await billing.read({ bookingId, session })).toMatchObject({ approvedTotalVnd: 140000, billTotalVnd: 160000 });

    // Decrease on escalation from 140,000 -> 0 replaces prior RECORDED rows and adds no zero-amount row
    const zeroed = await billing.applyAdjustment({
      session, bookingId, complaintId: 'case-1', amountVnd: 0, priorAmountVnd: 140000,
      disposition: 'ACCOUNTING_REFUND', ref: 'complaint:case-1:v5', actorId: 'admin-1', at
    });
    expect(zeroed).toEqual({ applied: true, refundId: null });
    expect(await billing.read({ bookingId, session })).toMatchObject({ approvedTotalVnd: 0, billTotalVnd: 300000 });
  });
});
