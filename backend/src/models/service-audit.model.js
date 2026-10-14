import { Schema } from 'mongoose';

export function serviceAuditModel(connection) {
  const schema = new Schema({
    actorId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, enum: ['SERVICE_CREATED', 'SERVICE_VERSIONED', 'POLICY_VERSIONED'], required: true },
    resourceType: { type: String, enum: ['service', 'service-policy'], required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, min: 1 },
    changedFields: { type: [{ type: String }], required: true },
    reason: { type: String, required: true, maxlength: 500 },
    effectiveAt: { type: Date, required: true },
    occurredAt: { type: Date, required: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  schema.index({ resourceId: 1, occurredAt: -1 });
  return connection.models.ServiceAudit ?? connection.model('ServiceAudit', schema);
}
