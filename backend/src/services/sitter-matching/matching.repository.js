import { matchingModels } from '../../models/sitter-matching.model.js';
import { petCareModels } from '../../models/pet-care.model.js';
import { decisionSnapshotModels } from '../../models/decision-snapshot.model.js';
import { createPetCareContext } from '../pet-care-context.service.js';

import { sitterApplicationModels } from '../../models/sitter-application.model.js';
import { userModel } from '../../models/user.model.js';
import { fail } from '../../validators/pet-care.validator.js';
const approvedAt = (now) => ({
  status: 'APPROVED',
  approvedAt: { $lte: now, $ne: null },
  effectiveAt: { $lte: now }
});
export function createAiRepository(connection, clock = Date.now) {
  const models = {
      ...matchingModels(connection),
      ...petCareModels(connection),
      ...decisionSnapshotModels(connection)
    },
    User = userModel(connection),
    apps = sitterApplicationModels(connection);
  return {
    models,
    connection,
    context: createPetCareContext(connection, clock).context,
    async candidates(context, slot) {
      const profiles = await models.SitterMatchingProfile.find({
        active: true,
        serviceIds: context.service._id,
        areaCodes: context.address.areaCode
      })
        .sort({ userId: 1 })
        .limit(201)
        .select('+starts')
        .lean();
      const truncated = profiles.length > 200;
      profiles.length = Math.min(profiles.length, 200);
      const ids = profiles.map((p) => p.userId),
        now = new Date(clock());
      const [users, approved, statuses, blocks] = await Promise.all([
        User.find({
          _id: { $in: ids },
          state: 'ACTIVE',
          roles: 'PET_SITTER',
          synthetic: { $ne: true }
        })
          .select('displayName')
          .lean(),
        apps.SitterApplication.find({
          provisionedUserId: { $in: ids },
          state: 'APPROVED'
        })
          .select('provisionedUserId')
          .lean(),
        apps.SitterStatus.find({ userId: { $in: ids }, status: 'ACTIVE' })
          .select('userId')
          .lean(),
        models.SitterScheduleBlock.find({
          sitterId: { $in: ids },
          startAt: { $lt: new Date(slot.end + 86400000) },
          endAt: { $gt: new Date(slot.start - 86400000) },
          $or: [
            { state: 'CONFIRMED' },
            { state: 'HOLD', holdExpiresAt: { $gt: now } }
          ]
        })
          .select('+point +endPoint')
          .sort({ startAt: 1 })
          .limit(6001)
          .lean()
      ]);
      if (blocks.length > 6000)
        fail('SCHEDULE_LIMIT', 'Schedule requires operational review', 409);
      const can = new Set(
        users
          .filter(
            (u) =>
              approved.some(
                (a) => String(a.provisionedUserId) === String(u._id)
              ) && statuses.some((a) => String(a.userId) === String(u._id))
          )
          .map((u) => String(u._id))
      );
      const completed = { $eq: ['$resolution', 'COMPLETED'] };
      const recent = {
        $gte: ['$occurredAt', new Date(clock() - 90 * 86400000)]
      };
      const rating = { $and: [completed, { $isNumber: '$rating' }] };
      const [facet] = await models.SitterVisitOutcome.aggregate([
        {
          $match: {
            sitterId: { $in: ids },
            serviceId: context.service._id,
            occurredAt: { $gte: new Date(clock() - 180 * 86400000), $lte: now },
            resolution: { $ne: 'EXCUSED' }
          }
        },
        {
          $facet: {
            bySpecies: [
              { $unwind: '$species' },
              {
                $group: {
                  _id: { userId: '$sitterId', species: '$species' },
                  similarVisits: { $sum: { $cond: [completed, 1, 0] } },
                  ratingSum: { $sum: { $cond: [rating, '$rating', 0] } },
                  ratingCount: { $sum: { $cond: [rating, 1, 0] } },
                  completed: {
                    $sum: { $cond: [{ $and: [completed, recent] }, 1, 0] }
                  },
                  faults: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ['$resolution', 'SITTER_FAULT'] },
                            recent
                          ]
                        },
                        1,
                        0
                      ]
                    }
                  },
                  onTime: {
                    $sum: {
                      $cond: [
                        {
                          $and: [completed, recent, { $eq: ['$onTime', true] }]
                        },
                        1,
                        0
                      ]
                    }
                  },
                  late: {
                    $sum: {
                      $cond: [
                        {
                          $and: [completed, recent, { $eq: ['$onTime', false] }]
                        },
                        1,
                        0
                      ]
                    }
                  }
                }
              }
            ],
            history: [
              { $match: { resolution: 'COMPLETED' } },
              { $unwind: '$petIds' },
              { $match: { petIds: { $in: context.pets.map((p) => p._id) } } },
              {
                $group: {
                  _id: { userId: '$sitterId', petId: '$petIds' },
                  count: { $sum: 1 }
                }
              }
            ]
          }
        }
      ]).option({ maxTimeMS: 5000 });
      const statisticsSnapshot = { ...facet, asOf: now.toISOString() };
      return {
        profiles: profiles.filter((p) => can.has(String(p.userId))),
        users,
        blocks,
        truncated,
        excludedEligibility: profiles.length - can.size,
        statisticsSnapshot
      };
    },
    async statistics(profile, context, snapshot) {
      if (!snapshot)
        fail(
          'STATISTICS_INVALID',
          'Verified statistics snapshot required',
          409
        );
      const zero = {
        similarVisits: 0,
        ratingSum: 0,
        ratingCount: 0,
        completed: 0,
        faults: 0,
        onTime: 0,
        late: 0
      };
      const bySpecies = [...new Set(context.pets.map((p) => p.species))]
        .map(
          (species) =>
            snapshot.bySpecies.find(
              (s) =>
                String(s._id.userId) === String(profile.userId) &&
                s._id.species === species
            ) ?? zero
        )
        .sort((a, b) => a.similarVisits - b.similarVisits);
      const stats = Object.fromEntries(
        Object.keys(zero).map((k) => [k, bySpecies[0][k]])
      );
      const historyCounts = context.pets.map(
        (p) =>
          snapshot.history.find(
            (h) =>
              String(h._id.userId) === String(profile.userId) &&
              String(h._id.petId) === String(p._id)
          )?.count ?? 0
      );
      return {
        stats,
        historyCounts,
        asOf: snapshot.asOf,
        source: 'VERIFIED_VISIT_OUTCOMES',
        windows: { experienceDays: 180, reliabilityDays: 90 }
      };
    },
    async ranking() {
      const now = new Date(clock());
      const policy = await models.SitterRankingPolicy.findOne(approvedAt(now))
        .sort({ version: -1 })
        .lean();
      if (!policy || (!policy.approvedBy && !policy.approvalSource))
        fail('RANKING_POLICY_UNAVAILABLE', 'Approve ranking policy first', 409);
      const model = await models.SitterRankModel.findOne({
        state: 'APPROVED',
        approvedAt: { $lte: now, $ne: null },
        trainedUntil: { $lte: now }
      })
        .sort({ approvedAt: -1 })
        .lean();
      return { policy, model };
    }
  };
}
