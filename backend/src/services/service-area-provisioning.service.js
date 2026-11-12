import { serviceAreaModels } from '../models/service-area.model.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { AREA_POLICY_ID } from './service-area-catalog.service.js';

export async function provisionServiceAreaStorage(connection) {
  const models = serviceAreaModels(connection);
  for (const model of Object.values(models)) { await model.createCollection(); await model.createIndexes(); }
}
export async function seedServiceAreas(connection, dataset, { apply = false } = {}) {
  const entries = dataset?.entries;
  if (!Array.isArray(entries) || entries.length !== 3355 || new Set(entries.map(row => row.code)).size !== entries.length) throw new TypeError('Expected complete unique NSO snapshot');
  const parents = new Set(entries.filter(row => row.level === 'PROVINCE').map(row => row.code));
  if (parents.size !== 34 || entries.filter(row => row.level === 'COMMUNE').length !== 3321 || entries.some(row => row.level === 'COMMUNE' && !parents.has(row.parentCode))) throw new TypeError('Invalid administrative hierarchy');
  const { ServiceArea: Area } = serviceAreaModels(connection);
  const rows = [...entries.map(row => ({ ...row, enabled: false, sourceVersion: dataset.version })), ...DEMO_WORK_AREAS.map(row => ({ ...row, enabled: true, sourceVersion: 'PWC_LEGACY_OPERATIONAL' }))];
  const existing = await Area.find({ _id: { $in: rows.map(row => row.code) } }).select('_id label level parentCode').lean();
  for (const row of rows) {
    const old = existing.find(value => value._id === row.code);
    if (old && (old.label !== row.label || old.level !== row.level || old.parentCode !== row.parentCode)) throw new TypeError('Existing area identity differs; reviewed migration required');
  }
  if (apply) {
    await connection.transaction(async session => {
      await Area.bulkWrite(rows.map(({ code, ...row }) => ({ updateOne: { filter: { _id: code }, update: { $setOnInsert: { ...row, version: 0 } }, upsert: true } })), { session });
      await Area.updateOne({ _id: AREA_POLICY_ID }, { $setOnInsert: { level: 'CONTROL', enabled: false, version: 0, sourceVersion: dataset.version } }, { upsert: true, session });
    });
  }
  return { state: apply ? 'APPLIED' : 'DRY_RUN', provinces: 34, communes: 3321, legacy: DEMO_WORK_AREAS.length, existing: existing.length, inserted: apply ? rows.length - existing.length : 0, newAreasEnabled: false };
}
