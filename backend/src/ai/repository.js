import { servicePolicyVersionModel } from '../models/service-policy-version.model.js';
import { systemSettingVersionModel } from '../models/system-setting-version.model.js';
import { Types } from 'mongoose';
import { aiModels } from './models.js';
import { servicePriceVersionModel } from '../models/service-price-version.model.js';
import { serviceVersionModel } from '../models/service-version.model.js';
import { serviceModel } from '../models/service.model.js';
import { sitterApplicationModels } from '../models/sitter-application.model.js';
import { userModel } from '../models/user.model.js';
import { fail } from './validation.js';
const approvedAt = (now) => ({
  status: 'APPROVED',
  approvedAt: { $lte: now, $ne: null },
  effectiveAt: { $lte: now },
});
export function createAiRepository(connection, clock = Date.now) {
  const models = aiModels(connection),
    User = userModel(connection),
    apps = sitterApplicationModels(connection);
  const ServicePolicy = servicePolicyVersionModel(connection),
    Setting = systemSettingVersionModel(connection);
  const Price = servicePriceVersionModel(connection),
    ServiceVersion = serviceVersionModel(connection),
    Service = serviceModel(connection);
  return {
    models,
    connection,
    async context(ownerId, input) {
      const now = new Date(clock()),
        serviceId = new Types.ObjectId(input.serviceId);
      const [service, version, price, policy, pets, address, clinic] =
        await Promise.all([
          Service.findById(serviceId).lean(),
          ServiceVersion.findOne({ serviceId, effectiveAt: { $lte: now } })
            .sort({ effectiveAt: -1, version: -1 })
            .lean(),
          Price.findOne({ serviceId, effectiveAt: { $lte: now } })
            .sort({ effectiveAt: -1, version: -1 })
            .lean(),
          models.AiPricingPolicy.findOne({ serviceId, ...approvedAt(now) })
            .sort({ version: -1 })
            .lean(),
          models.Pet.find({
            _id: { $in: input.petIds },
            ownerId,
            state: 'ACTIVE',
          }).lean(),
          input.addressId
            ? models.CustomerAddress.findOne({
                _id: input.addressId,
                ownerId,
                state: 'ACTIVE',
              })
                .select('+point')
                .lean()
            : null,
          input.clinicAddressId
            ? models.CustomerAddress.findOne({
                _id: input.clinicAddressId,
                ownerId,
                state: 'ACTIVE',
              })
                .select('+point')
                .lean()
            : null,
        ]);
      const [servicePolicy, catalog] = await Promise.all([
        ServicePolicy.findOne({ serviceId, effectiveAt: { $lte: now } })
          .sort({ effectiveAt: -1, version: -1 })
          .lean(),
        Setting.findOne({
          key: 'SERVICE_CATALOG_VISIBLE',
          effectiveAt: { $lte: now },
        })
          .sort({ effectiveAt: -1, version: -1 })
          .lean(),
      ]);
      if (servicePolicy?.state !== 'PUBLISHED' || catalog?.enabled !== true)
        fail(
          'SERVICE_UNAVAILABLE',
          'Service catalog or published policy unavailable',
          409
        );
      if (!service || version?.state !== 'ACTIVE' || !price)
        fail('SERVICE_UNAVAILABLE', 'Service price unavailable', 409);
      if (!policy || (!policy.approvedBy && !policy.approvalSource))
        fail('PRICING_POLICY_UNAVAILABLE', 'Approve pricing policy first', 409);
      if (pets.length !== input.petIds.length)
        fail('RESOURCE_NOT_FOUND', 'Owned pet unavailable', 404);
      if (pets.some((p) => !version.species.includes(p.species)))
        fail(
          'SPECIES_NOT_SUPPORTED',
          'Service does not support these pets',
          409
        );
      const breeds = await models.AiBreed.find({
        code: { $in: pets.map((p) => p.breedCode) },
        active: true,
      }).lean();
      if (
        pets.some(
          (p) =>
            !breeds.some(
              (b) => b.code === p.breedCode && b.species === p.species
            )
        )
      )
        fail(
          'BREED_DATA_REQUIRED',
          'Choose a supported breed or explicit mixed/unknown breed',
          409
        );
      if (input.addressId && (!address || !address.pointConfirmedAt))
        fail('RESOURCE_NOT_FOUND', 'Confirmed owned address unavailable', 404);
      if (input.clinicAddressId && (!clinic || !clinic.pointConfirmedAt))
        fail('RESOURCE_NOT_FOUND', 'Confirmed clinic address unavailable', 404);
      return { service, version, price, policy, pets, address, clinic };
    },
    async candidates(context, slot) {
      const profiles = await models.AiSitterProfile.find({
        active: true,
        serviceIds: context.service._id,
        areaCodes: context.address.areaCode,
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
          synthetic: { $ne: true },
        })
          .select('displayName')
          .lean(),
        apps.SitterApplication.find({
          provisionedUserId: { $in: ids },
          state: 'APPROVED',
        })
          .select('provisionedUserId')
          .lean(),
        apps.SitterStatus.find({ userId: { $in: ids }, status: 'ACTIVE' })
          .select('userId')
          .lean(),
        models.AiScheduleBlock.find({
          sitterId: { $in: ids },
          startAt: { $lt: new Date(slot.end + 86400000) },
          endAt: { $gt: new Date(slot.start - 86400000) },
          $or: [
            { state: 'CONFIRMED' },
            { state: 'HOLD', holdExpiresAt: { $gt: now } },
          ],
        })
          .select('+point +endPoint')
          .sort({ startAt: 1 })
          .limit(6001)
          .lean(),
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
        $gte: ['$occurredAt', new Date(clock() - 90 * 86400000)],
      };
      const rating = { $and: [completed, { $isNumber: '$rating' }] };
      const [facet] = await models.AiVisitOutcome.aggregate([
        {
          $match: {
            sitterId: { $in: ids },
            serviceId: context.service._id,
            occurredAt: { $gte: new Date(clock() - 180 * 86400000), $lte: now },
            resolution: { $ne: 'EXCUSED' },
          },
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
                    $sum: { $cond: [{ $and: [completed, recent] }, 1, 0] },
                  },
                  faults: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ['$resolution', 'SITTER_FAULT'] },
                            recent,
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  onTime: {
                    $sum: {
                      $cond: [
                        {
                          $and: [completed, recent, { $eq: ['$onTime', true] }],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  late: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            completed,
                            recent,
                            { $eq: ['$onTime', false] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
            history: [
              { $match: { resolution: 'COMPLETED' } },
              { $unwind: '$petIds' },
              { $match: { petIds: { $in: context.pets.map((p) => p._id) } } },
              {
                $group: {
                  _id: { userId: '$sitterId', petId: '$petIds' },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]).option({ maxTimeMS: 5000 });
      const statisticsSnapshot = { ...facet, asOf: now.toISOString() };
      return {
        profiles: profiles.filter((p) => can.has(String(p.userId))),
        users,
        blocks,
        truncated,
        excludedEligibility: profiles.length - can.size,
        statisticsSnapshot,
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
        late: 0,
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
        windows: { experienceDays: 180, reliabilityDays: 90 },
      };
    },
    async ranking() {
      const now = new Date(clock());
      const policy = await models.AiRankingPolicy.findOne(approvedAt(now))
        .sort({ version: -1 })
        .lean();
      if (!policy || (!policy.approvedBy && !policy.approvalSource))
        fail('RANKING_POLICY_UNAVAILABLE', 'Approve ranking policy first', 409);
      const model = await models.AiRankModel.findOne({
        state: 'APPROVED',
        approvedAt: { $lte: now, $ne: null },
        trainedUntil: { $lte: now },
      })
        .sort({ approvedAt: -1 })
        .lean();
      return { policy, model };
    },
  };
}
