import { productSalesModels } from '../../models/product.model.js';
import { PRODUCT_DEMO_CATALOG } from '../../constants/product-demo-catalog.js';

// Additive and idempotent: existing products (including edited stock or price) are never overwritten.
export async function provisionProductCatalog({ connection, entries = PRODUCT_DEMO_CATALOG }) {
  const models = productSalesModels(connection);
  for (const model of Object.values(models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  let inserted = 0;
  for (const entry of entries) {
    const result = await models.Product.updateOne({ code: entry.code },
      { $setOnInsert: { visible: true, quantityHeld: 0, photos: [], version: 0, ...entry } }, { upsert: true });
    if (result.upsertedCount) inserted += 1;
  }
  return { state: 'APPLIED', inserted, existing: entries.length - inserted };
}
