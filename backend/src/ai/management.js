import {
  exact,
  fail,
  id,
  instant,
  number,
  point,
  weights,
  digest,
} from './validation.js';
import { validatePricingPolicy } from './pricing.js';
import { localDay } from './scheduling.js';
const text = (value, max = 100) => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    fail('VALIDATION_FAILED', 'Invalid text');
  return value.trim();
};
export function createAiManagement({ repository, clock = Date.now }) {
  const { models, connection } = repository;
  return {
    async catalog() {
      const [breeds, traits] = await Promise.all([
        models.AiBreed.find({ active: true })
          .select('code name species -_id')
          .sort({ species: 1, name: 1 })
          .limit(200)
          .lean(),
        models.AiTrait.find({ active: true })
          .select('code label species explanation -_id')
          .sort({ code: 1 })
          .limit(100)
          .lean(),
      ]);
      return { breeds, traits };
    },
    async listPets(ownerId) {
      return models.Pet.find({ ownerId, state: 'ACTIVE' })
        .sort({ _id: 1 })
        .limit(100)
        .lean();
    },
    async listAddresses(ownerId) {
      return models.CustomerAddress.find({ ownerId, state: 'ACTIVE' })
        .select('label areaCode version pointConfirmedAt')
        .sort({ _id: 1 })
        .limit(100)
        .lean();
    },
    async createPet(ownerId, body) {
      exact(
        body,
        [
          'name',
          'species',
          'breedCode',
          'weightKg',
          'traits',
          'careNeedsConfirmed',
        ],
        ['name', 'species', 'breedCode', 'weightKg', 'careNeedsConfirmed']
      );
      text(body.name);
      text(body.breedCode, 80);
      number(body.weightKg, 0.1, 150);
      if (
        !['DOG', 'CAT'].includes(body.species) ||
        typeof body.careNeedsConfirmed !== 'boolean'
      )
        fail('VALIDATION_FAILED', 'Invalid pet');
      const traits = body.traits ?? [];
      if (
        !Array.isArray(traits) ||
        traits.length > 20 ||
        new Set(traits).size !== traits.length
      )
        fail('VALIDATION_FAILED', 'Invalid traits');
      traits.forEach((t) => text(t, 80));
      const [breed, count] = await Promise.all([
        models.AiBreed.exists({
          code: body.breedCode,
          species: body.species,
          active: true,
        }),
        models.AiTrait.countDocuments({
          code: { $in: traits },
          species: body.species,
          active: true,
        }),
      ]);
      if (!breed || count !== traits.length)
        fail('VALIDATION_FAILED', 'Unknown breed or trait');
      const doc = await models.Pet.create({
        ...body,
        traits,
        ownerId,
        state: 'ACTIVE',
        version: 0,
      });
      return { id: String(doc._id), version: 0 };
    },
    async createAddress(ownerId, body) {
      exact(
        body,
        ['label', 'location', 'coordinates', 'areaCode', 'pointConfirmed'],
        ['label', 'location', 'coordinates', 'areaCode', 'pointConfirmed']
      );
      point(body.coordinates);
      text(body.label);
      text(body.location, 500);
      text(body.areaCode, 80);
      if (body.pointConfirmed !== true)
        fail('ADDRESS_CONFIRMATION_REQUIRED', 'Confirm the map pin');
      const doc = await models.CustomerAddress.create({
        ownerId,
        label: body.label,
        location: body.location,
        areaCode: body.areaCode,
        point: { type: 'Point', coordinates: body.coordinates },
        pointConfirmedAt: new Date(clock()),
        version: 0,
      });
      return { id: String(doc._id), version: 0 };
    },
    async pricing(actor, body) {
      exact(
        body,
        [
          'serviceId',
          'version',
          'status',
          'effectiveAt',
          'reason',
          'billingMode',
          'unitMinutes',
          'maxPets',
          'extraPetBps',
          'maxSurchargeBps',
          'orderStepVnd',
          'orderStepBps',
          'maxOrderTierBps',
          'rules',
        ],
        [
          'serviceId',
          'version',
          'status',
          'effectiveAt',
          'reason',
          'billingMode',
          'unitMinutes',
          'maxPets',
          'extraPetBps',
          'maxSurchargeBps',
          'orderStepVnd',
          'orderStepBps',
          'maxOrderTierBps',
          'rules',
        ]
      );
      id(body.serviceId);
      number(body.version, 1, 1000000, true);
      instant(body.effectiveAt);
      text(body.reason, 2000);
      if (!['DRAFT', 'APPROVED'].includes(body.status))
        fail('VALIDATION_FAILED', 'Invalid policy status');
      validatePricingPolicy(body);
      const doc = await models.AiPricingPolicy.create({
        ...body,
        approvedBy: body.status === 'APPROVED' ? actor.userId : null,
        approvedAt: body.status === 'APPROVED' ? new Date(clock()) : null,
      });
      return { id: String(doc._id), version: doc.version, status: doc.status };
    },
    async ranking(actor, body) {
      exact(
        body,
        ['version', 'status', 'effectiveAt', 'reason', 'weights'],
        ['version', 'status', 'effectiveAt', 'reason', 'weights']
      );
      number(body.version, 1, 1000000, true);
      instant(body.effectiveAt);
      text(body.reason, 2000);
      weights(body.weights);
      if (!['DRAFT', 'APPROVED'].includes(body.status))
        fail('VALIDATION_FAILED', 'Invalid policy status');
      const doc = await models.AiRankingPolicy.create({
        ...body,
        approvedBy: body.status === 'APPROVED' ? actor.userId : null,
        approvedAt: body.status === 'APPROVED' ? new Date(clock()) : null,
      });
      return { id: String(doc._id), version: doc.version, status: doc.status };
    },
    async sitter(actor, userId, body) {
      id(userId);
      exact(
        body,
        [
          'expectedVersion',
          'serviceIds',
          'species',
          'areaCodes',
          'allowedTraits',
          'maxWeightKg',
          'maxPets',
          'windows',
          'dayOffDates',
          'starts',
          'active',
        ],
        [
          'expectedVersion',
          'serviceIds',
          'species',
          'areaCodes',
          'allowedTraits',
          'maxWeightKg',
          'maxPets',
          'windows',
          'dayOffDates',
          'starts',
          'active',
        ]
      );
      number(body.expectedVersion, 0, Number.MAX_SAFE_INTEGER, true);
      number(body.maxWeightKg, 0.1, 150);
      number(body.maxPets, 1, 10, true);
      for (const key of [
        'serviceIds',
        'species',
        'areaCodes',
        'allowedTraits',
        'windows',
        'dayOffDates',
        'starts',
      ])
        if (!Array.isArray(body[key]) || body[key].length > 60)
          fail('VALIDATION_FAILED', 'Bounded arrays required');
      body.serviceIds.forEach(id);
      if (
        !body.serviceIds.length ||
        !body.species.length ||
        body.species.some((x) => !['DOG', 'CAT'].includes(x)) ||
        !body.areaCodes.length ||
        typeof body.active !== 'boolean'
      )
        fail('VALIDATION_FAILED', 'Invalid capability');
      body.areaCodes.forEach((x) => text(x, 80));
      body.allowedTraits.forEach((x) => text(x, 80));
      if (
        new Set(body.starts.map((x) => x.localDate)).size !== body.starts.length
      )
        fail('VALIDATION_FAILED', 'Duplicate day origins');
      for (const w of body.windows) {
        exact(
          w,
          ['weekday', 'startMinute', 'endMinute'],
          ['weekday', 'startMinute', 'endMinute']
        );
        number(w.weekday, 0, 6, true);
        number(w.startMinute, 0, 1439, true);
        number(w.endMinute, 1, 1440, true);
        if (w.endMinute <= w.startMinute)
          fail('VALIDATION_FAILED', 'Overnight windows require Staff review');
      }
      for (let i = 0; i < body.windows.length; i++)
        for (let j = i + 1; j < body.windows.length; j++) {
          const a = body.windows[i],
            b = body.windows[j];
          if (
            a.weekday === b.weekday &&
            a.startMinute < b.endMinute &&
            b.startMinute < a.endMinute
          )
            fail('VALIDATION_FAILED', 'Overlapping windows');
        }
      body.dayOffDates.forEach((x) => {
        if (
          typeof x !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(x) ||
          !Number.isFinite(Date.parse(x))
        )
          fail('VALIDATION_FAILED', 'Invalid day');
      });
      for (const start of body.starts) {
        exact(
          start,
          ['localDate', 'coordinates', 'availableFrom', 'availableUntil'],
          ['localDate', 'coordinates', 'availableFrom', 'availableUntil']
        );
        point(start.coordinates);
        const a = instant(start.availableFrom),
          b = instant(start.availableUntil);
        if (
          a >= b ||
          localDay(a) !== start.localDate ||
          localDay(b - 1) !== start.localDate
        )
          fail('VALIDATION_FAILED', 'Invalid day bounds');
      }
      const data = {
        ...body,
        changedBy: actor.userId,
        starts: body.starts.map(({ coordinates, ...s }) => ({
          ...s,
          point: { type: 'Point', coordinates },
        })),
        version: body.expectedVersion + 1,
      };
      delete data.expectedVersion;
      return connection.transaction(async (session) => {
        // Serialize against all other supported AI calendar writes. Approval is independently checked again by matching/assignment.
        const current = await models.AiSitterProfile.findOne({ userId })
          .session(session)
          .lean();
        if (!current) {
          if (body.expectedVersion !== 0)
            fail('VERSION_CONFLICT', 'Reload capability', 409);
          await models.AiSitterProfile.create([{ userId, ...data }], {
            session,
          });
        } else {
          const changed = await models.AiSitterProfile.updateOne(
            { _id: current._id, version: body.expectedVersion },
            { $set: data },
            { session, runValidators: true }
          );
          if (changed.modifiedCount !== 1)
            fail('VERSION_CONFLICT', 'Reload capability', 409);
        }
        return { userId, version: data.version, changedBy: actor.userId };
      });
    },
    async block(actor, body) {
      exact(
        body,
        [
          'sitterId',
          'visitId',
          'startAt',
          'endAt',
          'coordinates',
          'endCoordinates',
          'kind',
          'sourceRef',
        ],
        ['sitterId', 'startAt', 'endAt', 'coordinates', 'kind', 'sourceRef']
      );
      id(body.sitterId);
      if (body.visitId) id(body.visitId);
      point(body.coordinates);
      if (body.endCoordinates) point(body.endCoordinates);
      text(body.sourceRef, 500);
      const start = instant(body.startAt),
        end = instant(body.endAt);
      if (end <= start || !['VISIT', 'BREAK'].includes(body.kind))
        fail('VALIDATION_FAILED', 'Invalid calendar block');
      return connection.transaction(async (session) => {
        const profile = await models.AiSitterProfile.findOneAndUpdate(
          { userId: body.sitterId },
          { $inc: { version: 1 } },
          { session, returnDocument: 'after' }
        );
        if (!profile) fail('RESOURCE_NOT_FOUND', 'Capability unavailable', 404);
        if (
          await models.AiScheduleBlock.exists({
            sitterId: body.sitterId,
            state: { $ne: 'RELEASED' },
            startAt: { $lt: new Date(end) },
            endAt: { $gt: new Date(start) },
            $or: [
              { state: 'CONFIRMED' },
              { holdExpiresAt: { $gt: new Date(clock()) } },
            ],
          }).session(session)
        )
          fail('SCHEDULE_CONFLICT', 'Calendar overlap', 409);
        const [doc] = await models.AiScheduleBlock.create(
          [
            {
              sitterId: body.sitterId,
              visitId: body.visitId,
              startAt: new Date(start),
              endAt: new Date(end),
              point: { type: 'Point', coordinates: body.coordinates },
              endPoint: body.endCoordinates
                ? { type: 'Point', coordinates: body.endCoordinates }
                : undefined,
              kind: body.kind,
              state: 'CONFIRMED',
              sourceRef: body.sourceRef,
              changedBy: actor.userId,
            },
          ],
          { session }
        );
        return {
          id: String(doc._id),
          state: doc.state,
          changedBy: actor.userId,
        };
      });
    },
    async outcome(actor, body) {
      exact(
        body,
        [
          'visitId',
          'sitterId',
          'serviceId',
          'petIds',
          'species',
          'occurredAt',
          'resolution',
          'rating',
          'onTime',
          'sourceRef',
        ],
        [
          'visitId',
          'sitterId',
          'serviceId',
          'petIds',
          'species',
          'occurredAt',
          'resolution',
          'sourceRef',
        ]
      );
      ['visitId', 'sitterId', 'serviceId'].forEach((k) => id(body[k]));
      const at = instant(body.occurredAt);
      if (at > clock()) fail('VALIDATION_FAILED', 'Future outcomes forbidden');
      text(body.sourceRef, 500);
      if (
        !Array.isArray(body.petIds) ||
        !body.petIds.length ||
        body.petIds.length > 10 ||
        !Array.isArray(body.species) ||
        !body.species.length ||
        body.species.some((s) => !['DOG', 'CAT'].includes(s))
      )
        fail('VALIDATION_FAILED', 'Invalid outcome scope');
      body.petIds.forEach(id);
      if (!['COMPLETED', 'SITTER_FAULT', 'EXCUSED'].includes(body.resolution))
        fail('VALIDATION_FAILED', 'Invalid resolution');
      if (body.rating !== undefined) number(body.rating, 1, 5, true);
      if (body.onTime !== undefined && typeof body.onTime !== 'boolean')
        fail('VALIDATION_FAILED', 'Invalid punctuality');
      if (
        body.resolution !== 'COMPLETED' &&
        (body.rating !== undefined || body.onTime !== undefined)
      )
        fail(
          'VALIDATION_FAILED',
          'Only completed visits can have ratings or punctuality'
        );
      const doc = await models.AiVisitOutcome.create({
        ...body,
        verifiedBy: actor.userId,
      });
      return { id: String(doc._id), source: 'ADMIN_VERIFIED_IMPORT' };
    },
    async model(actor, body) {
      exact(
        body,
        [
          'version',
          'weights',
          'trainingRows',
          'testMae',
          'baselineMae',
          'testGroups',
          'trainedUntil',
          'state',
        ],
        [
          'version',
          'weights',
          'trainingRows',
          'testMae',
          'baselineMae',
          'testGroups',
          'trainedUntil',
          'state',
        ]
      );
      text(body.version, 80);
      weights(body.weights);
      number(body.trainingRows, 100, 100000000, true);
      number(body.testGroups, 10, 10000000, true);
      number(body.testMae, 0, 100);
      number(body.baselineMae, 0, 100);
      if (
        instant(body.trainedUntil) > clock() ||
        !['DRAFT', 'APPROVED'].includes(body.state)
      )
        fail('VALIDATION_FAILED', 'Invalid model');
      if (body.state === 'APPROVED' && body.testMae >= body.baselineMae)
        fail(
          'MODEL_NOT_IMPROVED',
          'Model must beat baseline on held-out groups',
          409
        );
      const { state, ...content } = body;
      content.trainedUntil = new Date(body.trainedUntil).toISOString();
      const sha256 = digest(content);
      const doc = await models.AiRankModel.create({
        ...content,
        state,
        sha256,
        approvedBy: state === 'APPROVED' ? actor.userId : null,
        approvedAt: state === 'APPROVED' ? new Date(clock()) : null,
      });
      return { id: String(doc._id), state: doc.state, sha256 };
    },
  };
}
