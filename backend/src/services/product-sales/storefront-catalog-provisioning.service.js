import { PRODUCT_DEMO_CATALOG } from '../../constants/product-demo-catalog.js';
import { LEGACY_PRODUCT_CATALOG } from '../../constants/legacy-product-catalog.js';
import { provisionProductCatalog } from './product-catalog-provisioning.service.js';

export const STOREFRONT_CATALOG_KEY = 'pawworld-storefront-sample-2026-11-04';
export const storefrontCatalog = Object.freeze([...PRODUCT_DEMO_CATALOG, ...LEGACY_PRODUCT_CATALOG]);

// Existing stock/details remain authoritative. This explicit provisioning never replaces an Admin edit.
export function provisionStorefrontCatalog({ connection }) {
  return provisionProductCatalog({ connection, entries: storefrontCatalog.map(product => ({ ...product,
    catalogSource: STOREFRONT_CATALOG_KEY, sampleCatalog: true })) });
}
