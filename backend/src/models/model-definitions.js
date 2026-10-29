import { Schema } from 'mongoose';
export const oid = Schema.Types.ObjectId;
export const integer = (min = 0, max = Number.MAX_SAFE_INTEGER) => ({
  type: Number,
  min,
  max,
  validate: Number.isSafeInteger
});
export const options = {
  versionKey: false,
  strict: 'throw',
  bufferCommands: false,
  timestamps: true
};
export const sub = (fields) =>
  new Schema(fields, { _id: false, strict: 'throw' });
export const geo = sub({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: {
    type: [Number],
    required: true,
    validate: (v) =>
      v.length === 2 &&
      v.every(Number.isFinite) &&
      Math.abs(v[0]) <= 180 &&
      Math.abs(v[1]) <= 90
  }
});

export { Schema };

const legacyCollections = {
  PetTrait: 'aitraits',
  PetBreed: 'aibreeds',
  PricingPolicy: 'aipricingpolicies',
  SitterMatchingProfile: 'aisitterprofiles',
  SitterVisitOutcome: 'aivisitoutcomes',
  SitterScheduleBlock: 'aischeduleblocks',
  RoutingMatrixCache: 'airoutingmatrixes',
  DecisionSnapshot: 'aidecisions',
  SitterRankingPolicy: 'airankingpolicies',
  SitterRankModel: 'airankmodels'
};
export function registerModels(connection, definitions) {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, { fields, indexes }]) => {
      if (connection.models[name]) return [name, connection.models[name]];
      const schema = new Schema(fields, options);
      indexes.forEach(([keys, opts]) => schema.index(keys, opts));
      return [name, connection.model(name, schema, legacyCollections[name])];
    })
  );
}
