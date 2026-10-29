import { oid, integer, sub, registerModels } from './model-definitions.js';
export function pricingModels(connection) {
  return registerModels(connection, {
    PricingPolicy: {
      fields: {
        serviceId: { type: oid, required: true },
        version: { ...integer(1), required: true },
        status: {
          type: String,
          enum: ['DRAFT', 'APPROVED', 'RETIRED'],
          default: 'DRAFT'
        },
        effectiveAt: { type: Date, required: true },
        approvedBy: oid,
        approvedAt: Date,
        reason: { type: String, required: true, maxlength: 2000 },
        approvalSource: String,
        billingMode: {
          type: String,
          enum: ['PER_UNIT', 'PER_VISIT'],
          default: 'PER_UNIT'
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
                  maxWeightKg: { type: Number, min: 0 }
                })
              }
            })
          ],
          default: []
        }
      },
      indexes: [
        [{ serviceId: 1, version: 1 }, { unique: true }],
        [{ serviceId: 1, status: 1, effectiveAt: -1 }, {}]
      ]
    }
  });
}
