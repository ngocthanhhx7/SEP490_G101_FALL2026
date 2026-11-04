import { createHmac } from 'node:crypto';
import { matchingModels } from '../../models/sitter-matching.model.js';
import { customerReviewModels } from '../../models/customer-review.model.js';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { payrollModels } from '../../models/payroll.model.js';
import { fail } from '../../validators/pet-care.validator.js';

const FEATURES = ['fit', 'travel', 'quality', 'reliability', 'workload'];
const LABEL = 'VERIFIED_CUSTOMER_SATISFACTION_V1';
const millis = value => new Date(value).getTime();
export function createTrainingDatasetExporter({ connection, clock = Date.now }) {
  const { SitterVisitOutcome: Outcome } = matchingModels(connection), { CustomerVisitReview: Review } = customerReviewModels(connection);
  const { FinanceSourceEvent: Event } = financeSourceModels(connection), { PayrollServiceCredit: Credit } = payrollModels(connection);
  return { async collect({ key, limit = 20000 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50000) fail('VALIDATION_FAILED', 'Bounded export limit required');
    if (key !== undefined && (typeof key !== 'string' || key.length < 32)) fail('VALIDATION_FAILED', 'Private pseudonym key must be at least 32 characters');
    const rows = [], excluded = {}, groups = new Set(), now = clock();
    const reject = reason => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
    const outcomes = await Outcome.find({ resolution: 'COMPLETED', occurredAt: { $lte: new Date(now) } }).sort({ occurredAt: 1, _id: 1 }).limit(limit + 1).select('+provenance').lean();
    const truncated = outcomes.length > limit;
    for (const outcome of outcomes.slice(0, limit)) {
      const p = outcome.provenance;
      if (!p?.bookingId || p.labelVersion !== LABEL || !outcome.sourceRef?.startsWith('customer-review:')) { reject('UNVERIFIED_SOURCE'); continue; }
      const visit = await connection.collection('visits').findOne({ _id: outcome.visitId });
      const booking = visit && await connection.collection('bookings').findOne({ _id: visit.bookingId });
      const review = await Review.findOne({ visitId: String(outcome.visitId), direction: 'CUSTOMER_TO_SITTER' }).lean();
      const users = booking && await connection.collection('users').find({ _id: { $in: [booking.customerId, visit.sitterId] } }, { projection: { synthetic: 1, fixtureKey: 1 } }).toArray();
      if (!users || users.length !== 2 || users.some(user => user.synthetic || user.fixtureKey) || booking.synthetic || booking.fixtureKey || visit.synthetic || visit.fixtureKey) { reject('DEMO_OR_MISSING_ACCOUNT'); continue; }
      if (!review || !['SUBMITTED', 'PUBLISHED'].includes(review.state) || review.rating !== outcome.rating || !Number.isInteger(outcome.rating) ||
        review.sitterId !== String(visit.sitterId) || review.customerId !== String(booking.customerId) ||
        outcome.sourceRef !== `customer-review:${review._id}:${p.reviewVersion}` || review.verifiedSource?.creditId !== p.creditId || review.verifiedSource?.completionEventId !== p.completionEventId ||
        review.verifiedSource?.reviewVersion !== p.reviewVersion || review.verifiedSource?.bookingId !== p.bookingId || millis(review.createdAt) !== millis(outcome.occurredAt) ||
        String(booking._id) !== p.bookingId || String(visit.sitterId) !== String(outcome.sitterId) || String(visit.serviceId) !== String(outcome.serviceId)) { reject('REVIEW_SOURCE_CHANGED_OR_WITHHELD'); continue; }
      const credit = await Credit.findOne({ _id: p.creditId, visitId: visit._id, bookingId: booking._id, employeeId: visit.sitterId }).select('completedAt sourceVersion').lean();
      const event = await Event.findOne({ _id: p.completionEventId, bookingId: String(booking._id), type: 'BookingCompleted' }).lean();
      const incomplete = booking.visitIds?.length && await connection.collection('visits').countDocuments({ _id: { $in: booking.visitIds }, state: 'COMPLETED' });
      if (booking.state !== 'COMPLETED' || visit.state !== 'COMPLETED' || !booking.visitIds?.some(id => String(id) === String(visit._id)) ||
        incomplete !== booking.visitIds.length || !credit || !event || millis(credit.completedAt) !== millis(visit.completedAt) ||
        millis(p.completedAt) !== millis(visit.completedAt) || credit.sourceVersion !== p.visitVersion ||
        ![booking.completedAt, visit.completedAt, credit.completedAt, event.at, review.createdAt].every(at => Number.isFinite(millis(at)) && millis(at) <= millis(outcome.occurredAt))) { reject('COMPLETION_SOURCE_CHANGED'); continue; }
      const snapshot = visit.assignedFeatureSnapshot ?? visit.recommendationRef?.featureSnapshot, candidate = snapshot?.features ? snapshot : snapshot?.candidates?.find(item => item.sitterId === String(visit.sitterId));
      if (snapshot?.version !== 'PWC_MATCH_FEATURES_V1' || !candidate || candidate.sitterId !== String(visit.sitterId)) { reject('MISSING_DECISION_FEATURES'); continue; }
      const decision = millis(snapshot.decisionAt), occurred = millis(outcome.occurredAt);
      if (!Number.isFinite(decision) || decision >= occurred || decision > millis(visit.startAt) || millis(snapshot.slotStartAt) !== millis(visit.startAt) || millis(snapshot.slotEndAt) !== millis(visit.endAt) ||
        Object.keys(candidate.features ?? {}).length !== FEATURES.length || Object.keys(snapshot.featuresAsOf ?? {}).length !== FEATURES.length ||
        !FEATURES.every(name => Number.isFinite(candidate.features[name]) && candidate.features[name] >= 0 && candidate.features[name] <= 1 &&
          Number.isFinite(millis(snapshot.featuresAsOf[name])) && millis(snapshot.featuresAsOf[name]) <= decision)) { reject('INVALID_OR_LATE_FEATURES'); continue; }
      groups.add(String(booking._id));
      if (key) {
        const opaque = value => createHmac('sha256', key).update('pwc-training-v1:' + value).digest('hex');
        rows.push({ groupId: opaque('booking:' + booking._id), observationId: opaque('review:' + review._id + ':' + review.version),
          decisionAt: new Date(decision).toISOString(), occurredAt: new Date(occurred).toISOString(),
          featuresAsOf: Object.fromEntries(FEATURES.map(name => [name, new Date(snapshot.featuresAsOf[name]).toISOString()])),
          features: Object.fromEntries(FEATURES.map(name => [name, candidate.features[name]])),
          rating: outcome.rating, targetScore: (outcome.rating - 1) * 25, labelVersion: LABEL, verified: true });
      } else rows.push(null);
    }
    return { rows, summary: { scanned: Math.min(outcomes.length, limit), eligibleRows: rows.length, bookingGroups: groups.size, excluded, truncated,
      readyForTraining: !truncated && rows.length >= 200 && groups.size >= 50, labelVersion: LABEL } };
  } };
}
