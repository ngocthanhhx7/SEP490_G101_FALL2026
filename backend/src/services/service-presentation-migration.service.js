import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { serviceModel } from '../models/service.model.js';
import { presentationValue } from './service-presentation.service.js';

const digestValue = value => JSON.stringify(presentationValue(value));
const size = value => mongoose.mongo.BSON.calculateObjectSize(value);

// Additive copy only. Legacy data is retained for old-release rollback. A source
// provisioning freeze/deploy lock is required; this is not a background job.
export async function migrateServicePresentations({ connection, apply = false, expectedDigest }) {
  const legacy = connection.db.collection('servicepresentations');
  const Service = serviceModel(connection), services = connection.db.collection('services');
  const report = { state: 'DRY_RUN', source: 0, copy: 0, identical: 0, conflicts: 0, orphans: 0,
    invalid: 0, maxTargetBytes: 0, sourceLogicalBytes: 0, parentLogicalBytes: 0, targetLogicalBytes: 0, applied: 0 };
  const digest = createHash('sha256'), sources = new Map(), parents = new Set();
  for await (const row of legacy.find({}).sort({ _id: 1 }).batchSize(100).maxTimeMS(10000)) {
    report.source++;
    if (report.source > 1000) throw new Error('Catalog migration budget exceeded');
    const parent = await services.findOne({ _id: row.serviceId });
    report.sourceLogicalBytes += size(row);
    const signature = JSON.stringify([String(row._id), String(row.serviceId), presentationValue(row)]);
    sources.set(String(row._id), signature);
    digest.update(signature);
    if (parents.has(String(row.serviceId))) { report.conflicts++; continue; }
    parents.add(String(row.serviceId));
    if (!parent) { report.orphans++; continue; }
    const value = presentationValue(row);
    if (Object.keys(row).some(key => !['_id', 'serviceId', ...Object.keys(value)].includes(key))
      || parent.presentation === null) { report.invalid++; continue; }
    const bytes = size({ ...parent, presentation: value });
    report.parentLogicalBytes += size(parent);
    report.targetLogicalBytes += bytes;
    report.maxTargetBytes = Math.max(report.maxTargetBytes, bytes);
    try {
      const candidate = new Service({ ...parent, presentation: value });
      await candidate.validate();
      if (digestValue(candidate.presentation.toObject()) !== digestValue(value)) throw new Error('Migration would coerce source metadata');
      if (bytes > 256 * 1024) throw new Error('Migration document budget exceeded');
    } catch { report.invalid++; continue; }
    if (!parent.presentation) report.copy++;
    else if (digestValue(parent.presentation) === digestValue(value)) report.identical++;
    else report.conflicts++;
  }
  report.digest = digest.digest('hex');
  if (!apply) return report;
  if (expectedDigest !== report.digest || report.conflicts || report.orphans || report.invalid) {
    throw new Error('Migration digest or data invariants failed; no copy started');
  }
  // Each transaction rechecks both source and target. A failed/rerun copy never
  // overwrites an existing different presentation or removes any source record.
  for await (const source of legacy.find({}).sort({ _id: 1 }).batchSize(100).maxTimeMS(10000)) {
    const copied = await connection.transaction(async session => {
      const row = await legacy.findOne({ _id: source._id }, { session });
      if (!row || JSON.stringify([String(row._id), String(row.serviceId), presentationValue(row)]) !== sources.get(String(row._id))) {
        throw new Error('Migration source changed');
      }
      const parent = await services.findOne({ _id: row.serviceId }, { session });
      if (!parent) throw new Error('Migration parent missing');
      const value = presentationValue(row);
      if (parent.presentation) {
        if (digestValue(parent.presentation) !== digestValue(value)) throw new Error('Migration target conflict');
        return false;
      }
      const result = await services.updateOne({ _id: parent._id, presentation: { $exists: false } },
        { $set: { presentation: value } }, { session });
      if (result.modifiedCount !== 1) throw new Error('Migration target changed');
      return true;
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    if (copied) report.applied++;
  }
  const verified = await migrateServicePresentations({ connection });
  if (verified.digest !== report.digest || verified.source !== report.source || verified.identical !== report.source
    || verified.conflicts || verified.orphans || verified.invalid) throw new Error('Post-copy verification failed');
  return { ...report, state: 'COPIED_LEGACY_RETAINED' };
}
