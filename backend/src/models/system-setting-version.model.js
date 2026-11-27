import { Schema } from 'mongoose';
import { catalogChangeAuditField, immutableCatalogVersion } from './catalog-change-provenance.model.js';

export function systemSettingVersionModel(connection) {
  const schema = new Schema({
    changeAudit: catalogChangeAuditField('system-setting'),
    key: { type: String, enum: ['SERVICE_CATALOG_VISIBLE', 'FAULTY_PRODUCT_REPORT_DAYS'], required: true },
    version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    enabled: { type: Boolean, required() { return this.key === 'SERVICE_CATALOG_VISIBLE'; } },
    valueDays: {
      type: Number,
      min: 1,
      max: 365,
      validate: value => value === undefined || Number.isSafeInteger(value),
      required() { return this.key === 'FAULTY_PRODUCT_REPORT_DAYS'; }
    },
    effectiveAt: { type: Date, required: true },
    changedBy: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
    recordedAt: { type: Date, required: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  immutableCatalogVersion(schema);
  schema.index({ key: 1, version: 1 }, { unique: true });
  schema.index({ key: 1, effectiveAt: 1 }, { unique: true });
  return connection.models.SystemSettingVersion ?? connection.model('SystemSettingVersion', schema);
}
