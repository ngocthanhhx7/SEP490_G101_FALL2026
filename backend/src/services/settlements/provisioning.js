import { settlementModels } from '../../models/settlement.model.js';

// Explicit, additive provisioning; never invoked by server startup. Existing
// incompatible indexes/data fail for operator review instead of being dropped.
export async function provisionSettlementStorage(connection) {
  const models = settlementModels(connection);
  for (const model of Object.values(models)) {
    await model.createCollection();
    await model.createIndexes();
  }
}
