import { Types } from 'mongoose';
import { createAiRepository } from './matching.repository.js';
import { scoreSitter } from './scoring.service.js';
import { cachedMatrix } from './routing.service.js';
import { planInsertion, requiredPoints, localDay } from './scheduling.service.js';

// Advisory only: incomplete advice never removes an authoritative eligible
// employee or changes payment, eligibility or assignment state.
export function createOperationalRanker({ connection, routingProvider, clock = Date.now }) {
  const repository = createAiRepository(connection, clock, { employeeSchedulingEnabled: true });
  return async ({ visit, sitterIds, signal }) => {
    if (!visit.point?.coordinates || !visit.pets?.length || visit.location !== 'HOME') return sitterIds;
    const context = { service: { _id: new Types.ObjectId(visit.serviceId) }, pets: visit.pets.map(pet => ({ ...pet, _id: pet.id })),
      address: { areaCode: visit.areaCode, point: visit.point } };
    const slot = { start: new Date(visit.startAt).getTime(), end: new Date(visit.endAt).getTime(), localDate: localDay(visit.startAt) };
    const { policy } = await repository.ranking();
    const data = await repository.candidates(context, slot), scores = new Map();
    const profiles = data.profiles.filter(profile => sitterIds.includes(String(profile.userId)));
    let next = 0;
    async function worker() {
      while (next < profiles.length) {
        signal?.throwIfAborted(); const profile = profiles[next++], sitterId = String(profile.userId);
        try {
          const dayStart = Date.parse(slot.localDate + 'T00:00:00+07:00');
          const blocks = data.blocks.filter(row => String(row.sitterId) === sitterId && new Date(row.startAt).getTime() < dayStart + 86400000 && new Date(row.endAt).getTime() > dayStart);
          if (blocks.length > 20) continue;
          const matrix = await cachedMatrix({ points: requiredPoints(profile, blocks, context.address, slot.localDate),
            Routing: repository.models.RoutingMatrixCache, provider: routingProvider, clock });
          signal?.throwIfAborted();
          const plan = await planInsertion({ profile, blocks, slot, address: context.address, matrix });
          if (!plan.eligible) continue;
          const statistics = await repository.statistics(profile, context, data.statisticsSnapshot);
          scores.set(sitterId, scoreSitter({ ...statistics, extraTravelMinutes: plan.extraTravelMinutes, busyMinutes: plan.busyMinutes, weights: policy.weights }));
        } catch (error) {
          if (signal?.aborted) throw error;
          if (!['ROUTING_UNAVAILABLE', 'ROUTING_LIMIT', 'STATISTICS_LIMIT', 'STATISTICS_INVALID'].includes(error.code)) throw error;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, profiles.length) }, worker));
    signal?.throwIfAborted();
    const ranked = [...sitterIds].sort((a, b) => scores.has(a) && scores.has(b) ? scores.get(b).rawScore - scores.get(a).rawScore || sitterIds.indexOf(a) - sitterIds.indexOf(b)
      : scores.has(a) ? -1 : scores.has(b) ? 1 : sitterIds.indexOf(a) - sitterIds.indexOf(b));
    const decisionAt = new Date(clock()).toISOString();
    const scoresBySitterId = Object.fromEntries([...scores].map(([sitterId, score]) => [sitterId, score.rawScore]));
    return { sitterIds: ranked, scoresBySitterId, featureSnapshot: { version: 'PWC_MATCH_FEATURES_V1', decisionAt,
      slotStartAt: new Date(visit.startAt).toISOString(), slotEndAt: new Date(visit.endAt).toISOString(),
      featuresAsOf: Object.fromEntries(['fit', 'travel', 'quality', 'reliability', 'workload'].map(key => [key, decisionAt])),
      candidates: [...scores].map(([sitterId, score]) => ({ sitterId, features: score.features })), policyVersion: policy.version, modelVersion: null } };
  };
}
