import { AppError } from '../utils/app-error.js';

export const legacyCompensationCollections = Object.freeze(('settlementrequests settlementweekclaims earnings financiallocks '
  + 'earningledgerentries settlementcommands settlementevents settlementoutboxes settlementtransfers settlementtransferclaims '
  + 'settlementevidences earningadjustments bookingearningsnapshots weeklybookingcounters completedbookingordinals earningaccrualoutboxes').split(' '));

export function storageProfile(env = {}) {
  const value = env.COMPENSATION_PROFILE ?? 'EMPLOYEE';
  if (!['EMPLOYEE', 'LEGACY_PARTNER'].includes(value)) throw new TypeError('Invalid COMPENSATION_PROFILE');
  return value;
}

export function assertProfileModels(connection, profile) {
  if (profile === 'EMPLOYEE' && Object.values(connection.models).some(model => legacyCompensationCollections.includes(model.collection.name)
    || model.collection.name === 'earningaccrualtasks')) {
    throw new Error('EMPLOYEE profile must not register legacy compensation models');
  }
}
export async function assertRuntimeStorageProfile(connection, profile) {
  assertProfileModels(connection, profile);
  const models = Object.values(connection.models), names = new Set((await connection.db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name));
  for (const model of models) {
    if (!names.has(model.collection.name)) throw new AppError(503, 'STORAGE_PROFILE_NOT_READY', 'Provision the selected storage profile before startup');
    const indexes = await model.collection.listIndexes().toArray();
    if (model.schema.indexes().some(([keys, options]) => (options.unique || options.expireAfterSeconds !== undefined)
      && !indexes.some(index => JSON.stringify(index.key) === JSON.stringify(keys)
        && (!options.unique || index.unique === true)
        && (index.sparse === true) === (options.sparse === true)
        && (options.expireAfterSeconds === undefined || index.expireAfterSeconds === options.expireAfterSeconds)
        && JSON.stringify(index.partialFilterExpression) === JSON.stringify(options.partialFilterExpression))))
      throw new AppError(503, 'STORAGE_PROFILE_NOT_READY', 'Provision the selected storage indexes before startup');
  }
}
