import { Schema, Types } from 'mongoose';

export const CATALOG_VERSION_AUDITS = Object.freeze([
  { type: 'service', source: 'serviceaudits', target: 'serviceversions', actions: ['SERVICE_CREATED', 'SERVICE_VERSIONED'] },
  { type: 'service-policy', source: 'serviceaudits', target: 'servicepolicyversions', actions: ['POLICY_VERSIONED'] },
  { type: 'service-price', source: 'servicepriceaudits', target: 'servicepriceversions', actions: ['SERVICE_PRICE_VERSIONED'] },
  { type: 'system-setting', source: 'systemsettingaudits', target: 'systemsettingversions', actions: ['SERVICE_CATALOG_VISIBILITY_CHANGED'] }
]);

export function catalogChangeAuditField(type) {
  const definition = CATALOG_VERSION_AUDITS.find(value => value.type === type);
  if (!definition) throw new TypeError('Unknown catalog version type');
  const schema = new Schema({
    eventId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    action: { type: String, enum: definition.actions, required: true, immutable: true },
    changedFields: { type: [String], default: undefined, required: true, immutable: true,
      validate: values => values.length <= 32 }
  }, { _id: false, versionKey: false, strict: 'throw' });
  // Optional only for reading legacy/imported versions before explicit migration.
  // The live native validator requires it after verified cutover.
  return { type: schema, default: undefined, select: false, immutable: true };
}

export function createCatalogChange(action, changedFields) {
  if (!CATALOG_VERSION_AUDITS.some(definition => definition.actions.includes(action))
    || !Array.isArray(changedFields) || changedFields.length > 32
    || changedFields.some(field => typeof field !== 'string')) throw new TypeError('Invalid catalog change provenance');
  return { eventId: new Types.ObjectId(), action, changedFields: [...changedFields] };
}

export function catalogProvenanceValidator(type, required = true) {
  const definition = CATALOG_VERSION_AUDITS.find(value => value.type === type);
  if (!definition) throw new TypeError('Unknown catalog version type');
  return { $jsonSchema: { bsonType: 'object', ...(required ? { required: ['changeAudit'] } : {}), properties: {
    changeAudit: { bsonType: 'object', additionalProperties: false, required: ['eventId', 'action', 'changedFields'],
      properties: { eventId: { bsonType: 'objectId' }, action: { enum: definition.actions },
        changedFields: { bsonType: 'array', maxItems: 32, items: { bsonType: 'string' } } } }
  } } };
}

export function immutableCatalogVersion(schema) {
  schema.eachPath((path, definition) => {
    if (path !== '_id') { definition.options.immutable = true; definition.immutable(true); }
  });
  return schema;
}
