import { oid, integer, geo, registerModels } from './model-definitions.js';
export function petCareModels(connection) {
  return registerModels(connection, {
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
          default: 'ACTIVE'
        },
        version: { ...integer(), default: 0 }
      },
      indexes: [[{ ownerId: 1, state: 1, _id: 1 }, {}]]
    },
    CustomerAddress: {
      fields: {
        ownerId: { type: oid, required: true, index: true },
        label: { type: String, required: true, maxlength: 100 },
        location: {
          type: String,
          required: true,
          maxlength: 500,
          select: false
        },
        point: { type: geo, required: true, select: false },
        areaCode: { type: String, required: true, index: true },
        pointConfirmedAt: { type: Date, required: true },
        state: {
          type: String,
          enum: ['ACTIVE', 'ARCHIVED'],
          default: 'ACTIVE'
        },
        version: { ...integer(), default: 0 }
      },
      indexes: [[{ point: '2dsphere' }, {}]]
    },
    PetTrait: {
      fields: {
        code: { type: String, required: true },
        label: { type: String, required: true, maxlength: 160 },
        species: { type: [String], required: true },
        explanation: { type: String, required: true, maxlength: 1000 },
        active: { type: Boolean, default: true }
      },
      indexes: [[{ code: 1 }, { unique: true }]]
    },
    PetBreed: {
      fields: {
        code: { type: String, required: true },
        name: { type: String, required: true, maxlength: 100 },
        species: { type: String, enum: ['DOG', 'CAT'], required: true },
        active: { type: Boolean, default: true },
        source: { type: String, required: true, maxlength: 500 }
      },
      indexes: [[{ code: 1 }, { unique: true }]]
    }
  });
}
