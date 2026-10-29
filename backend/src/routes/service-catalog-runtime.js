import { createServiceExistence } from '../services/service-existence.service.js';
import { serviceCatalogModule } from './service-catalog.routes.js';
import { servicePriceModule } from './service-price.routes.js';
import { systemSettingsModule } from './system-settings.routes.js';

export function serviceCatalogRuntimeModules(context) {
  // Health-only test harnesses may omit a database; the server supplies a real connection.
  if (typeof context.connection?.model !== 'function') return [];
  const serviceExists = createServiceExistence(context.connection);
  const settings = systemSettingsModule(context);
  const prices = servicePriceModule({ ...context, serviceExists });
  const catalog = serviceCatalogModule({
    ...context,
    priceProvider: prices.prices,
    catalogSettings: settings.catalogSettings
  });
  return [settings, prices, catalog];
}
