import { PRODUCT_DEMO_CATALOG } from '../../constants/product-demo-catalog.js';
import { LEGACY_PRODUCT_CATALOG } from '../../constants/legacy-product-catalog.js';
import { provisionProductCatalog } from './product-catalog-provisioning.service.js';
import { productSalesModels } from '../../models/product.model.js';

export const STOREFRONT_CATALOG_KEY = 'pawworld-storefront-sample-2026-11-04';
export const storefrontCatalog = Object.freeze([...PRODUCT_DEMO_CATALOG, ...LEGACY_PRODUCT_CATALOG]);

// Existing stock/details remain authoritative. This explicit provisioning never replaces an Admin edit.
export function provisionStorefrontCatalog({ connection }) {
  return provisionProductCatalog({ connection, entries: storefrontCatalog.map(product => ({ ...product,
    catalogSource: STOREFRONT_CATALOG_KEY, sampleCatalog: true })) });
}

// Explicit migration only. Never infer a photo in the public reader or replace Admin edits.
export async function backfillStorefrontPhotos({ connection, apply = false }) {
  const { Product } = productSalesModels(connection);
  const report = { state: apply ? 'APPLIED' : 'DRY_RUN', eligible: 0, updated: 0 };
  for (const entry of storefrontCatalog.filter(product => product.photos?.length)) {
    const filter = { code: entry.code, catalogSource: STOREFRONT_CATALOG_KEY, sampleCatalog: true,
      photos: { $size: 0 }, detailsVersion: 0 };
    if (apply) {
      const result = await Product.updateOne(filter, { $set: { photos: entry.photos }, $inc: { detailsVersion: 1 } });
      report.updated += result.modifiedCount;
      report.eligible += result.matchedCount;
    } else report.eligible += await Product.countDocuments(filter);
  }
  return report;
}
