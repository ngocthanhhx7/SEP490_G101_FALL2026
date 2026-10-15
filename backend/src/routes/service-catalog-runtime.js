import { serviceModel } from '../models/service.model.js';
import { serviceCatalogModule } from './service-catalog.routes.js';
import { servicePriceModule } from './service-price.routes.js';
import { systemSettingsModule } from './system-settings.routes.js';

export function serviceCatalogRuntimeModules(context) {
  // Health-only test harnesses may omit a database; the server supplies a real connection.
  if (typeof context.connection?.model !== 'function') return [];
  const Service = serviceModel(context.connection);
  const settings = systemSettingsModule(context);
  const prices = servicePriceModule({ ...context,
    serviceExists: async id => Boolean(await Service.exists({ _id: id })) });
  const catalog = serviceCatalogModule({ ...context,
    priceProvider: prices.prices, catalogSettings: settings.catalogSettings });
  return [settings, prices, catalog];
}
