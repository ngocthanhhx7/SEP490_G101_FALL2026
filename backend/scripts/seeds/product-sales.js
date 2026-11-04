import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { PRODUCT_DEMO_CATALOG } from '../../src/constants/product-demo-catalog.js';
import { provisionProductCatalog } from '../../src/services/product-sales/product-catalog-provisioning.service.js';

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ state: 'DRY_RUN', products: PRODUCT_DEMO_CATALOG.map(({ code, name, sellingPrice, stockOnHand, visible }) =>
    ({ code, name, sellingPrice, stockOnHand, visible: visible !== false })) }));
} else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production' || !config.database.endsWith('_dev')) throw new Error('Development database required');
    connection = await connectDatabase(config);
    console.log(JSON.stringify(await provisionProductCatalog({ connection })));
  } catch {
    console.error('Product catalog provisioning failed; database details omitted');
    process.exitCode = 1;
  } finally {
    await connection?.close();
  }
}
