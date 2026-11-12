import { Schema } from 'mongoose';

const area = new Schema({
  _id: String, level: { type: String, enum: ['PROVINCE', 'COMMUNE', 'CITY', 'DISTRICT', 'CONTROL'], required: true },
  label: { type: String, maxlength: 120 }, parentCode: String, officialCode: String,
  enabled: { type: Boolean, default: false }, version: { type: Number, default: 0 },
  guardVersion: Number, sourceVersion: String, changedAt: Date, changedBy: String, reason: { type: String, maxlength: 500 }
}, { strict: 'throw', versionKey: false, bufferCommands: false });
area.index({ level: 1, parentCode: 1, _id: 1 }, { name: 'service_area_parent' });
area.index({ enabled: 1, _id: 1 }, { name: 'service_area_enabled' });
const command = new Schema({ _id: String, fingerprint: String, result: Schema.Types.Mixed,
  actorId: String, reason: String, codes: [String], enabled: Boolean, createdAt: Date, expiresAt: Date
}, { strict: 'throw', versionKey: false, bufferCommands: false });
command.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'service_area_command_expiry' });
export function serviceAreaModels(connection) {
  return {
    ServiceArea: connection.models.ServiceArea ?? connection.model('ServiceArea', area, 'serviceareas'),
    ServiceAreaCommand: connection.models.ServiceAreaCommand ?? connection.model('ServiceAreaCommand', command, 'serviceareacommands')
  };
}
