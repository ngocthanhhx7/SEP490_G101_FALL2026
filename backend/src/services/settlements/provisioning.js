import { settlementModels } from '../../models/settlement.model.js';
import { earningAccrualModels } from '../../models/earning-accrual.model.js';

// Explicit, additive provisioning; never invoked by server startup. Existing
// incompatible indexes/data fail for operator review instead of being dropped.
export async function provisionSettlementStorage(connection, { retireLegacyVisitIndex = false } = {}) {
  const models = { ...settlementModels(connection), ...earningAccrualModels(connection) };
  for (const model of Object.values(models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  if (retireLegacyVisitIndex) {
    const indexes = await models.Earning.collection.listIndexes().toArray();
    const replacement = indexes.find(index => index.name === 'earning_visit_owner_v2'
      && index.unique && index.partialFilterExpression?.visitId?.$type === 'string');
    if (!replacement) throw new Error('Replacement visit ownership index is missing');
    const legacy = indexes.find(index => index.name === 'sitterId_1_visitId_1');
    if (legacy) {
      if (!legacy.unique || !legacy.sparse || legacy.partialFilterExpression
        || JSON.stringify(legacy.key) !== JSON.stringify({ sitterId: 1, visitId: 1 })) {
        throw new Error('Unknown legacy index; operator review required');
      }
      await models.Earning.collection.dropIndex(legacy.name);
    }
  }
}
