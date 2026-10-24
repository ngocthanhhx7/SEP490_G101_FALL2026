import { Schema } from 'mongoose';
const oid = Schema.Types.ObjectId;
const integer = (min = 0, max = Number.MAX_SAFE_INTEGER) => ({
  type: Number,
  min,
  max,
  validate: Number.isSafeInteger,
});
const options = {
  versionKey: false,
  strict: 'throw',
  bufferCommands: false,
  timestamps: true,
};
const sub = (fields) => new Schema(fields, { _id: false, strict: 'throw' });
const geo = sub({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: {
    type: [Number],
    required: true,
    validate: (v) =>
      v.length === 2 &&
      v.every(Number.isFinite) &&
      Math.abs(v[0]) <= 180 &&
      Math.abs(v[1]) <= 90,
  },
});
export function aiModels(connection) {
  const definitions = {
    Pet: {
      fields: {
        ownerId: { type: oid, required: true, index: true },
        name: { type: String, required: true, maxlength: 100 },
        species: { type: String, enum: ['DOG', 'CAT'], required: true },
        breedCode: { type: String, required: true, maxlength: 80 },
        weightKg: { type: Number, required: true, min: 0.1, max: 150 },
        traits: { type: [String], default: [] },
        careNeedsConfirmed: { type: Boolean, default: false },
        state: {
          type: String,
          enum: ['ACTIVE', 'ARCHIVED'],
          default: 'ACTIVE',
        },
        version: { ...integer(), default: 0 },
      },
      indexes: [[{ ownerId: 1, state: 1, _id: 1 }, {}]],
    },
    CustomerAddress: {
      fields: {
        ownerId: { type: oid, required: true, index: true },
        label: { type: String, required: true, maxlength: 100 },
        location: {
          type: String,
          required: true,
          maxlength: 500,
          select: false,
        },
        point: { type: geo, required: true, select: false },
        areaCode: { type: String, required: true, index: true },
        pointConfirmedAt: { type: Date, required: true },
        state: {
          type: String,
          enum: ['ACTIVE', 'ARCHIVED'],
          default: 'ACTIVE',
        },
        version: { ...integer(), default: 0 },
      },
      indexes: [[{ point: '2dsphere' }, {}]],
    },
    AiTrait: {
      fields: {
        code: { type: String, required: true },
        label: { type: String, required: true, maxlength: 160 },
        species: { type: [String], required: true },
        explanation: { type: String, required: true, maxlength: 1000 },
        active: { type: Boolean, default: true },
      },
      indexes: [[{ code: 1 }, { unique: true }]],
    },
    AiBreed: {
      fields: {
        code: { type: String, required: true },
        name: { type: String, required: true, maxlength: 100 },
        species: { type: String, enum: ['DOG', 'CAT'], required: true },
        active: { type: Boolean, default: true },
        source: { type: String, required: true, maxlength: 500 },
      },
      indexes: [[{ code: 1 }, { unique: true }]],
    },
    AiPricingPolicy: {
      fields: {
        serviceId: { type: oid, required: true },
        version: { ...integer(1), required: true },
        status: {
          type: String,
          enum: ['DRAFT', 'APPROVED', 'RETIRED'],
          default: 'DRAFT',
        },
        effectiveAt: { type: Date, required: true },
        approvedBy: oid,
        approvedAt: Date,
        reason: { type: String, required: true, maxlength: 2000 },
        approvalSource: String,
        billingMode: {
          type: String,
          enum: ['PER_UNIT', 'PER_VISIT'],
          default: 'PER_UNIT',
        },
        unitMinutes: { ...integer(1, 1440), required: true },
        orderStepVnd: { ...integer(1), default: 5000000 },
        orderStepBps: { ...integer(0, 10000), default: 200 },
        maxOrderTierBps: { ...integer(0, 50000), default: 2000 },
        maxPets: { ...integer(1, 10), default: 4 },
        extraPetBps: { ...integer(0, 20000), default: 0 },
        maxSurchargeBps: { ...integer(0, 50000), default: 20000 },
        rules: {
          type: [
            sub({
              code: { type: String, required: true, maxlength: 80 },
              label: { type: String, required: true, maxlength: 160 },
              explanation: { type: String, required: true, maxlength: 1000 },
              scope: { type: String, enum: ['PET', 'VISIT'], required: true },
              bps: { ...integer(0, 20000), default: 0 },
              flatVnd: { ...integer(), default: 0 },
              exclusiveGroup: String,
              when: {
                type: sub({
                  species: { type: String, enum: ['DOG', 'CAT'] },
                  breedCodes: { type: [String], default: undefined },
                  traitCode: String,
                  minWeightKg: { type: Number, min: 0 },
                  maxWeightKg: { type: Number, min: 0 },
                }),
              },
            }),
          ],
          default: [],
        },
      },
      indexes: [
        [{ serviceId: 1, version: 1 }, { unique: true }],
        [{ serviceId: 1, status: 1, effectiveAt: -1 }, {}],
      ],
    },
    AiSitterProfile: {
      fields: {
        changedBy: { type: oid },
        userId: { type: oid, required: true },
        serviceIds: { type: [oid], required: true },
        species: { type: [String], required: true },
        areaCodes: { type: [String], required: true },
        allowedTraits: { type: [String], default: [] },
        maxWeightKg: { type: Number, required: true, min: 0, max: 150 },
        maxPets: { ...integer(1, 10), required: true },
        active: { type: Boolean, default: true },
        timeZone: {
          type: String,
          enum: ['Asia/Ho_Chi_Minh'],
          default: 'Asia/Ho_Chi_Minh',
        },
        windows: {
          type: [
            sub({
              weekday: { ...integer(0, 6), required: true },
              startMinute: { ...integer(0, 1439), required: true },
              endMinute: { ...integer(1, 1440), required: true },
            }),
          ],
          required: true,
        },
        dayOffDates: [String],
        starts: {
          type: [
            sub({
              localDate: { type: String, required: true },
              point: { type: geo, required: true },
              availableFrom: { type: Date, required: true },
              availableUntil: { type: Date, required: true },
            }),
          ],
          default: [],
          select: false,
        },
        version: { ...integer(), default: 0 },
      },
      indexes: [
        [{ userId: 1 }, { unique: true }],
        [{ active: 1, areaCodes: 1 }, {}],
      ],
    },
    AiVisitOutcome: {
      fields: {
        visitId: { type: oid, required: true },
        sitterId: { type: oid, required: true },
        serviceId: { type: oid, required: true },
        petIds: { type: [oid], required: true },
        species: { type: [String], required: true },
        occurredAt: { type: Date, required: true },
        resolution: {
          type: String,
          enum: ['COMPLETED', 'SITTER_FAULT', 'EXCUSED'],
          required: true,
        },
        rating: { type: Number, min: 1, max: 5, validate: Number.isInteger },
        onTime: Boolean,
        verifiedBy: { type: oid, required: true },
        sourceRef: { type: String, required: true, maxlength: 500 },
      },
      indexes: [
        [{ visitId: 1 }, { unique: true }],
        [{ sitterId: 1, serviceId: 1, occurredAt: -1 }, {}],
      ],
    },
    AiScheduleBlock: {
      fields: {
        changedBy: { type: oid },
        sourceRef: { type: String, maxlength: 500 },
        sitterId: { type: oid, required: true },
        visitId: oid,
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
        point: { type: geo, required: true, select: false },
        endPoint: { type: geo, select: false },
        state: {
          type: String,
          enum: ['CONFIRMED', 'HOLD', 'RELEASED'],
          required: true,
        },
        holdExpiresAt: Date,
        kind: { type: String, enum: ['VISIT', 'BREAK'], default: 'VISIT' },
        version: { ...integer(), default: 0 },
      },
      indexes: [[{ sitterId: 1, startAt: 1, endAt: 1 }, {}]],
    },
    AiRoutingMatrix: {
      fields: {
        key: { type: String, required: true },
        minutes: { type: Number, required: true, min: 0, max: 1440 },
        source: { type: String, required: true },
        recordedAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true },
      },
      indexes: [
        [{ key: 1 }, { unique: true }],
        [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
      ],
    },
    AiDecision: {
      fields: {
        ownerId: { type: oid, required: true, index: true },
        kind: { type: String, enum: ['QUOTE', 'MATCH'], required: true },
        requestHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        snapshot: { type: Schema.Types.Mixed, required: true, select: false },
      },
      indexes: [
        [{ ownerId: 1, kind: 1, createdAt: -1 }, {}],
        [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
      ],
    },
    AiRankingPolicy: {
      fields: {
        version: { ...integer(1), required: true },
        status: {
          type: String,
          enum: ['DRAFT', 'APPROVED', 'RETIRED'],
          default: 'DRAFT',
        },
        effectiveAt: { type: Date, required: true },
        approvedBy: oid,
        approvedAt: Date,
        approvalSource: String,
        weights: {
          type: sub({
            fit: Number,
            travel: Number,
            quality: Number,
            reliability: Number,
            workload: Number,
          }),
          required: true,
        },
        reason: { type: String, required: true, maxlength: 2000 },
      },
      indexes: [
        [{ version: 1 }, { unique: true }],
        [{ status: 1, effectiveAt: -1 }, {}],
      ],
    },
    AiRankModel: {
      fields: {
        version: { type: String, required: true },
        state: {
          type: String,
          enum: ['DRAFT', 'APPROVED', 'RETIRED'],
          default: 'DRAFT',
        },
        weights: {
          type: sub({
            fit: Number,
            travel: Number,
            quality: Number,
            reliability: Number,
            workload: Number,
          }),
          required: true,
        },
        sha256: { type: String, required: true },
        trainingRows: { ...integer(100), required: true },
        testMae: { type: Number, min: 0, required: true },
        baselineMae: { type: Number, min: 0, required: true },
        testGroups: { ...integer(10), required: true },
        trainedUntil: { type: Date, required: true },
        approvedBy: oid,
        approvedAt: Date,
      },
      indexes: [[{ version: 1 }, { unique: true }]],
    },
  };
  return Object.fromEntries(
    Object.entries(definitions).map(([name, { fields, indexes }]) => {
      if (connection.models[name]) return [name, connection.models[name]];
      const schema = new Schema(fields, options);
      indexes.forEach(([keys, opts]) => schema.index(keys, opts));
      return [name, connection.model(name, schema)];
    })
  );
}
