import { Schema } from 'mongoose';
import { immutableCatalogVersion } from './catalog-change-provenance.model.js';

// Draft/current are bounded fields on Service. Only immutable history needs its own store.
export function serviceWorkflowVersionModel(connection) {
  const schema = new Schema(
    {
      serviceId: { type: Schema.Types.ObjectId, required: true },
      revision: { type: Number, required: true, min: 1 },
      action: { type: String, enum: ['PUBLISHED', 'RETIRED'], required: true },
      definition: { type: Schema.Types.Mixed, required: true },
      hash: { type: String, required: true },
      actorId: { type: Schema.Types.ObjectId, required: true },
      recordedAt: { type: Date, required: true }
    },
    { strict: 'throw', versionKey: false, bufferCommands: false, autoCreate: false, autoIndex: false }
  );
  immutableCatalogVersion(schema);
  schema.index({ serviceId: 1, revision: -1 }, { unique: true });
  return (
    connection.models.ServiceWorkflowVersion ??
    connection.model('ServiceWorkflowVersion', schema, 'serviceworkflowversions')
  );
}
