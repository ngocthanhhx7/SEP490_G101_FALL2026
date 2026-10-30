import { Types } from 'mongoose';
import { customerReviewModels } from '../../models/customer-review.model.js';
import { matchingModels } from '../../models/sitter-matching.model.js';
import { payrollModels } from '../../models/payroll.model.js';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { fail, id, digest } from '../../validators/pet-care.validator.js';

export function createMongoCustomerReviewRepository({ connection }) {
  const { CustomerVisitReview: Review, CustomerReviewCommand: Command } = customerReviewModels(connection);
  const { SitterVisitOutcome: Outcome } = matchingModels(connection), { PayrollServiceCredit: Credit } = payrollModels(connection);
  const { FinanceSourceEvent: Event } = financeSourceModels(connection), uow = createUnitOfWork(connection);
  const oid = value => new Types.ObjectId(value);
  return {
    async getReview({ actor, reviewId }) {
      const row = await Review.findById(reviewId).select('+comment').lean();
      if (!row || (row.customerId !== actor.userId && !actor.roles.includes('STAFF'))) return null;
      return { ...row, id: row._id };
    },
    async runForVisitActor(actor, visitId, work) {
      id(visitId); id(actor.userId);
      for (let attempt = 0; ; attempt++) {
        try { return await uow.run(async session => {
          const user = await connection.collection('users').findOneAndUpdate({ _id: oid(actor.userId), state: 'ACTIVE', roles: 'CUSTOMER', synthetic: { $ne: true },
            ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) }, { $inc: { reviewGuardVersion: 1 } }, { session, returnDocument: 'after' });
          if (!user) fail('FORBIDDEN', 'Current customer account required', 403);
          const visit = await connection.collection('visits').findOne({ _id: oid(visitId), customerId: oid(actor.userId) }, { session });
          if (!visit) fail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
          const key = identity => digest(identity);
          return work({
            getVisit: async () => ({ ...visit, visitId, customerId: String(visit.customerId), sitterId: visit.sitterId && String(visit.sitterId) }),
            getIdempotencyResult: identity => Command.findById(key(identity)).session(session).lean(),
            saveIdempotencyResult: value => Command.create([{ _id: key(value.identity), payloadHash: value.payloadHash, result: value.result }], { session }),
            findReview: () => Review.findOne({ visitId, direction: 'CUSTOMER_TO_SITTER' }).session(session).lean(),
            async createReview(value) {
              const booking = await connection.collection('bookings').findOneAndUpdate({ _id: visit.bookingId, customerId: visit.customerId,
                state: 'COMPLETED', visitIds: visit._id }, { $inc: { reviewGuardVersion: 1 } }, { session, returnDocument: 'after' });
              const credit = await Credit.findOne({ visitId: visit._id, bookingId: visit.bookingId, employeeId: visit.sitterId, sourceVersion: visit.version }).session(session).lean();
              const completion = await Event.findOne({ bookingId: String(visit.bookingId), type: 'BookingCompleted' }).session(session).lean();
              const incomplete = booking && await connection.collection('visits').countDocuments({ _id: { $in: booking.visitIds }, state: { $ne: 'COMPLETED' } }, { session });
              const count = booking && await connection.collection('visits').countDocuments({ _id: { $in: booking.visitIds } }, { session });
              if (!booking || incomplete || count !== booking.visitIds.length || !credit || !completion || visit.state !== 'COMPLETED' ||
                !visit.completedAt || credit.completedAt.getTime() !== visit.completedAt.getTime() || !visit.snapshots?.pets?.length ||
                !booking.completedAt || new Date(value.createdAt) < booking.completedAt || new Date(value.createdAt) < visit.completedAt ||
                new Date(value.createdAt) < completion.at)
                fail('VERIFIED_COMPLETION_REQUIRED', 'Whole booking and immutable employee completion source required', 409);
              const guarded = await connection.collection('visits').updateOne({ _id: visit._id, version: visit.version,
                state: 'COMPLETED', sitterId: visit.sitterId }, { $inc: { reviewGuardVersion: 1 } }, { session });
              if (!guarded.matchedCount) fail('VERSION_CONFLICT', 'Completion source changed', 409);
              if (await Outcome.exists({ visitId: visit._id }).session(session)) fail('OUTCOME_RECONCILIATION_REQUIRED', 'Existing outcome requires source reconciliation', 409);
              const provenance = { bookingId: String(booking._id), bookingVersion: booking.version, visitVersion: visit.version,
                completionEventId: completion._id, creditId: String(credit._id), completedAt: visit.completedAt, reviewVersion: 0,
                labelVersion: 'VERIFIED_CUSTOMER_SATISFACTION_V1', trainingEligible: false };
              const [saved] = await Review.create([{ _id: value.id, visitId, customerId: value.customerId, sitterId: value.sitterId,
                direction: value.direction, rating: value.rating, comment: value.comment, tags: value.tags,
                state: 'SUBMITTED', visibility: 'ROLE_SCOPED', version: 0, createdAt: value.createdAt, verifiedSource: provenance }], { session });
              await Outcome.create([{ visitId: visit._id, sitterId: visit.sitterId, serviceId: visit.serviceId, petIds: visit.petIds,
                species: [...new Set(visit.snapshots.pets.map(pet => pet.species))], occurredAt: new Date(value.createdAt),
                resolution: 'COMPLETED', rating: value.rating, onTime: credit.onTime, verifiedBy: actor.userId,
                sourceRef: `customer-review:${value.id}:0`, provenance }], { session });
              return { ...saved.toObject(), id: saved._id };
            },
            appendAuditAndOutbox: value => Event.create([{ _id: `review:${value.reviewId}`, type: value.type,
              bookingId: String(visit.bookingId), actorId: actor.userId, resourceId: value.reviewId, at: value.at }], { session })
          });
        }); } catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
      }
    }
  };
}
