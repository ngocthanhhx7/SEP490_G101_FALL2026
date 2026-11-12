import { Types } from 'mongoose';
import { payrollModels } from '../../models/payroll.model.js';
import { fail } from '../../validators/pet-care.validator.js';

// Cases/refunds are the authority; no duplicate balance or hold collection.
export function createCommissionSources({ connection }) {
  const { PayrollServiceCredit: Credit, PayrollSourceClaim: Claim } = payrollModels(connection);
  async function heldBookings(credits, session) {
    const ids = [...new Map(credits.map(row => [String(row.bookingId), row.bookingId])).values()];
    if (!ids.length) return new Set();
    const cases = await connection.collection('cases').find({ bookingId: { $in: ids }, $or: [
      { state: { $in: ['OPEN', 'UNDER_REVIEW', 'RESOLVED'] } }, { financialHold: true }
    ] }, { session, projection: { bookingId: 1 }, maxTimeMS: 5000 }).limit(2001).toArray();
    const refunds = await connection.collection('refunds').find({ bookingId: { $in: ids },
      state: { $in: ['PROPOSED', 'APPROVED', 'TRANSFER_PENDING', 'FAILED'] } },
    { session, projection: { bookingId: 1 }, maxTimeMS: 5000 }).limit(2001).toArray();
    if (cases.length > 2000 || refunds.length > 2000) fail('PAYROLL_REVIEW_REQUIRED', 'Case/refund sources exceed review budget', 409);
    return new Set([...cases, ...refunds].map(row => String(row.bookingId)));
  }
  return {
    heldBookings,
    async payable(employeeId, end, session) {
      // Unclaimed older credits remain payable after their hold is released.
      const rows = await Credit.aggregate([
        { $match: { employeeId: new Types.ObjectId(employeeId), completedAt: { $lt: end } } },
        { $lookup: { from: Claim.collection.name, let: { key: { $concat: ['credit:', { $toString: '$_id' }] } },
          pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$key'] } } }, { $project: { _id: 1 } }], as: 'claim' } },
        { $match: { 'claim.0': { $exists: false } } }, { $sort: { completedAt: 1, _id: 1 } }, { $limit: 1001 }, { $unset: 'claim' }
      ]).session(session ?? null).option({ maxTimeMS: 5000, allowDiskUse: false });
      if (rows.length > 1000) fail('PAYROLL_REVIEW_REQUIRED', 'Too many unclaimed service credits', 409);
      const held = await heldBookings(rows, session);
      return { payable: rows.filter(row => !held.has(String(row.bookingId))), held: rows.filter(row => held.has(String(row.bookingId))) };
    },
    async assertPayableCreditIds(creditIds, session) {
      if (!creditIds?.length) return;
      if (creditIds.length > 1000) fail('PAYROLL_REVIEW_REQUIRED', 'Statement credit set exceeds review budget', 409);
      const credits = await Credit.find({ _id: { $in: creditIds } }).session(session).limit(1001).lean();
      if (credits.length !== creditIds.length) fail('PAYROLL_SOURCE_CHANGED', 'Statement credit sources changed', 409);
      if ((await heldBookings(credits, session)).size) fail('PAYROLL_COMMISSION_HELD', 'Booking commission is held; void an unpaid statement and prepare salary again, or await the Admin conclusion', 409);
    }
  };
}
