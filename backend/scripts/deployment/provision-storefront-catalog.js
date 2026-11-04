import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { STOREFRONT_CATALOG_KEY, storefrontCatalog, provisionStorefrontCatalog, backfillStorefrontPhotos } from '../../src/services/product-sales/storefront-catalog-provisioning.service.js';

const apply = process.argv.includes('--apply');
const photos = process.argv.includes('--backfill-photos');
if (!apply && !photos) console.log(JSON.stringify({ state: 'DRY_RUN', key: STOREFRONT_CATALOG_KEY, products: storefrontCatalog.length, sampleCatalog: true }));
else {
  let connection;
  try {
    const config = loadConfig();
    if (process.env.CONFIRMED_PRODUCT_CATALOG_KEY !== STOREFRONT_CATALOG_KEY || process.env.CONFIRMED_PRODUCT_DATABASE !== config.database) {
      throw new Error('Explicit catalogue key and database confirmation required');
    }
    connection = await connectDatabase(config);
    const result = photos ? await backfillStorefrontPhotos({ connection, apply }) : await provisionStorefrontCatalog({ connection });
    console.log(JSON.stringify({ ...result, key: STOREFRONT_CATALOG_KEY, sampleCatalog: true }));
  } catch {
    console.error('Product provisioning stopped; verify reviewed release, backup and explicit database confirmation');
    process.exitCode = 1;
  } finally { await connection?.close(); }
}
