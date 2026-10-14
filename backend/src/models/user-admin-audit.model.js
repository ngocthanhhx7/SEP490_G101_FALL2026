import { Schema } from 'mongoose';

export function userAdminAuditModel(connection) {
  const schema = new Schema({
    actorId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, enum: ['USER_LOCKED', 'USER_UNLOCKED'], required: true },
    resourceType: { type: String, enum: ['user'], required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true, minlength: 3, maxlength: 1000 },
    occurredAt: { type: Date, required: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  schema.index({ resourceId: 1, occurredAt: -1 });
  return connection.models.UserAdminAudit ?? connection.model('UserAdminAudit', schema);
}
