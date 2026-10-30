import { oid, integer, sub, geo, registerModels, Schema } from './model-definitions.js';
export function matchingModels(connection) {
  return registerModels(connection, {
    SitterMatchingProfile: {
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
          default: 'Asia/Ho_Chi_Minh'
        },
        windows: {
          type: [
            sub({
              weekday: { ...integer(0, 6), required: true },
              startMinute: { ...integer(0, 1439), required: true },
              endMinute: { ...integer(1, 1440), required: true }
            })
          ],
          required: true
        },
        dayOffDates: [String],
        starts: {
          type: [
            sub({
              localDate: { type: String, required: true },
              point: { type: geo, required: true },
              availableFrom: { type: Date, required: true },
              availableUntil: { type: Date, required: true }
            })
          ],
          default: [],
          select: false
        },
        version: { ...integer(), default: 0 }
      },
      indexes: [
        [{ userId: 1 }, { unique: true }],
        [{ active: 1, areaCodes: 1 }, {}]
      ]
    },
    SitterVisitOutcome: {
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
          required: true
        },
        rating: { type: Number, min: 1, max: 5, validate: Number.isInteger },
        onTime: Boolean,
        verifiedBy: { type: oid, required: true },
        sourceRef: { type: String, required: true, maxlength: 500 },
        provenance: { type: Schema.Types.Mixed, select: false }
      },
      indexes: [
        [{ visitId: 1 }, { unique: true }],
        [{ sitterId: 1, serviceId: 1, occurredAt: -1 }, {}]
      ]
    },
    SitterScheduleBlock: {
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
          required: true
        },
        holdExpiresAt: Date,
        kind: { type: String, enum: ['VISIT', 'BREAK'], default: 'VISIT' },
        version: { ...integer(), default: 0 }
      },
      indexes: [[{ sitterId: 1, startAt: 1, endAt: 1 }, {}]]
    },
    RoutingMatrixCache: {
      fields: {
        key: { type: String, required: true },
        minutes: { type: Number, required: true, min: 0, max: 1440 },
        source: { type: String, required: true },
        recordedAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true }
      },
      indexes: [
        [{ key: 1 }, { unique: true }],
        [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]
      ]
    },
    SitterRankingPolicy: {
      fields: {
        version: { ...integer(1), required: true },
        status: {
          type: String,
          enum: ['DRAFT', 'APPROVED', 'RETIRED'],
          default: 'DRAFT'
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
            workload: Number
          }),
          required: true
        },
        reason: { type: String, required: true, maxlength: 2000 }
      },
      indexes: [
        [{ version: 1 }, { unique: true }],
        [{ status: 1, effectiveAt: -1 }, {}]
      ]
    },
    SitterRankModel: {
      fields: {
        version: { type: String, required: true },
        state: {
          type: String,
          enum: ['DRAFT', 'APPROVED', 'RETIRED'],
          default: 'DRAFT'
        },
        weights: {
          type: sub({
            fit: Number,
            travel: Number,
            quality: Number,
            reliability: Number,
            workload: Number
          }),
          required: true
        },
        sha256: { type: String, required: true },
        trainingRows: { ...integer(100), required: true },
        testMae: { type: Number, min: 0, required: true },
        baselineMae: { type: Number, min: 0, required: true },
        testGroups: { ...integer(10), required: true },
        trainedUntil: { type: Date, required: true },
        approvedBy: oid,
        approvedAt: Date
      },
      indexes: [[{ version: 1 }, { unique: true }]]
    }
  });
}
