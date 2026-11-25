import { Types } from 'mongoose';

const ACTIVE_REFUND_STATES = new Set(['RECORDED', 'APPROVED', 'TRANSFER_PENDING', 'PAID']);
const oid = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value) ? new Types.ObjectId(value) : null;
const money = value => Number.isSafeInteger(value) && value >= 0;

/**
 * Authoritative booking billing/refund port for complaints (and reusable for incidents).
 * Reads verified payOS receipts from `payments` and recorded/active refunds from `refunds`,
 * and records accounting refunds in `refunds` with `state: 'RECORDED'` inside the caller's session.
 */
export function createBookingRefundBilling({ connection }) {
  if (!connection?.db) throw new TypeError('Database connection is required');
  const col = name => connection.db.collection(name);

  async function read({ bookingId, session }) {
    const id = oid(bookingId);
    if (!id) return null;
    const options = session ? { session, maxTimeMS: 5000 } : { maxTimeMS: 5000 };
    const receipts = await col('payments').find({ bookingId: id, state: 'VERIFIED' }, options).limit(2).toArray();
    if (receipts.length !== 1) return null;
    const receipt = receipts[0];
    if (receipt.receiptMoney?.currency !== 'VND' || !money(receipt.receiptMoney?.amountVnd)) return null;
    const paidAmountVnd = receipt.receiptMoney.amountVnd;

    const refunds = await col('refunds').find({ bookingId: id }, options).limit(1001).toArray();
    if (refunds.length > 1000) return null;
    let approvedTotalVnd = 0;
    for (const row of refunds) {
      const status = row.state ?? row.status;
      if (!ACTIVE_REFUND_STATES.has(status)) continue;
      if (!money(row.amountVnd)) return null;
      approvedTotalVnd += row.amountVnd;
      if (!Number.isSafeInteger(approvedTotalVnd)) return null;
    }

    return {
      basis: 'ISSUED',
      basisAmountVnd: paidAmountVnd,
      approvedTotalVnd,
      paidInFull: true,
      billTotalVnd: Math.max(0, paidAmountVnd - approvedTotalVnd)
    };
  }

  async function applyAdjustment({
    session, bookingId, complaintId, sourceId, sourceType = 'COMPLAINT',
    amountVnd, priorAmountVnd = 0, disposition, ref, actorId, at
  }) {
    const id = oid(bookingId);
    const caseId = sourceId ?? complaintId;
    if (!session || !id || typeof caseId !== 'string' || !caseId.trim()
      || typeof ref !== 'string' || !ref.trim() || !money(amountVnd) || !money(priorAmountVnd)
      || disposition !== 'ACCOUNTING_REFUND' || !(at instanceof Date) || !Number.isFinite(+at)) {
      return { applied: false };
    }

    const existing = await col('refunds').findOne({ _id: ref }, { session });
    if (existing) return { applied: true, refundId: ref };

    const recordBase = {
      bookingId: id,
      sourceType,
      sourceRef: { type: 'CASE', id: caseId },
      ...(sourceType === 'COMPLAINT' ? { complaintId: caseId } : { incidentId: caseId }),
      currency: 'VND',
      state: 'RECORDED',
      disposition,
      decidedBy: actorId ?? null,
      recordedAt: at,
      version: 0
    };

    if (priorAmountVnd === 0) {
      if (amountVnd === 0) return { applied: true, refundId: null };
      await col('refunds').insertOne({ _id: ref, ...recordBase, amountVnd }, { session });
      return { applied: true, refundId: ref };
    }

    if (amountVnd > priorAmountVnd) {
      await col('refunds').insertOne({
        _id: ref,
        ...recordBase,
        amountVnd: amountVnd - priorAmountVnd,
        adjustmentDelta: true
      }, { session });
      return { applied: true, refundId: ref };
    }

    if (amountVnd < priorAmountVnd) {
      await col('refunds').updateMany(
        { bookingId: id, 'sourceRef.type': 'CASE', 'sourceRef.id': caseId, state: 'RECORDED' },
        { $set: { state: 'REPLACED', replacedAt: at, replacedByRef: ref } },
        { session }
      );
      if (amountVnd > 0) {
        await col('refunds').insertOne({
          _id: ref,
          ...recordBase,
          amountVnd,
          replacesPriorAmountVnd: priorAmountVnd
        }, { session });
      }
      return { applied: true, refundId: amountVnd > 0 ? ref : null };
    }

    return { applied: true, refundId: null };
  }

  return Object.freeze({ read, applyAdjustment });
}
