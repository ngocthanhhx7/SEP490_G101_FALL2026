import { Schema } from 'mongoose';

export function sitterPublicProfileModels(connection) {
  const profile = new Schema({
    userId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    bio: { type: String, required: true, maxlength: 1000 },
    areas: { type: [String], required: true, validate: value => value.length > 0 && value.length <= 30 },
    state: { type: String, required: true, enum: ['SUBMITTED', 'APPROVED', 'REJECTED'] },
    version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    reviewedBy: { type: Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    reason: { type: String, maxlength: 500, default: null, select: false }
  }, { strict: 'throw', versionKey: false, timestamps: true, autoIndex: false, bufferCommands: false });
  profile.index({ userId: 1 }, { unique: true });
  profile.index({ state: 1, updatedAt: 1, userId: 1 });
  const command = new Schema({
    actorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    operation: { type: String, required: true, immutable: true },
    key: { type: String, required: true, immutable: true },
    fingerprint: { type: String, required: true, immutable: true },
    result: { type: Schema.Types.Mixed, required: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true }
  }, { strict: 'throw', versionKey: false, autoIndex: false, bufferCommands: false });
  command.index({ actorId: 1, operation: 1, key: 1 }, { unique: true });
  const audit = new Schema({
    actorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    action: { type: String, required: true, immutable: true },
    version: { type: Number, required: true, immutable: true },
    contentHash: { type: String, required: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true }
  }, { strict: 'throw', versionKey: false, autoIndex: false, bufferCommands: false });
  audit.index({ userId: 1, version: 1 }, { unique: true });
  return {
    SitterPublicProfile: connection.models.SitterPublicProfile ?? connection.model('SitterPublicProfile', profile),
    SitterPublicProfileCommand: connection.models.SitterPublicProfileCommand ?? connection.model('SitterPublicProfileCommand', command),
    SitterPublicProfileAudit: connection.models.SitterPublicProfileAudit ?? connection.model('SitterPublicProfileAudit', audit)
  };
}
