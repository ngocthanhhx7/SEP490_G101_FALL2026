import { Types } from 'mongoose';
import { serviceModel } from '../../models/service.model.js';
import { serviceVersionModel } from '../../models/service-version.model.js';
import { servicePolicyVersionModel } from '../../models/service-policy-version.model.js';
import { servicePriceVersionModel } from '../../models/service-price-version.model.js';
import { systemSettingVersionModel } from '../../models/system-setting-version.model.js';
import { pricingModels } from '../../models/pricing.model.js';
import { GROOMING_CATEGORIES } from '../../constants/grooming.js';
import { fail } from '../../validators/pet-care.validator.js';

// Same selection as the pricing repository: newest effective version, and for pricing policies the highest version.
const newest = (rows, byVersion = false) => {
  const latest = new Map();
  for (const row of rows) {
    const key = String(row.serviceId), current = latest.get(key);
    const better = !current || (byVersion ? row.version > current.version
      : row.effectiveAt > current.effectiveAt || (+row.effectiveAt === +current.effectiveAt && row.version > current.version));
    if (better) latest.set(key, row);
  }
  return latest;
};

// Shop services are the services whose presentation offers FACILITY and sits in a grooming category.
// A service that is not currently bookable (no active version, published policy, price or APPROVED pricing policy) is listed with bookable:false.
export function createGroomingShopServices({ connection, clock = Date.now }) {
  const Service = serviceModel(connection), Version = serviceVersionModel(connection), Policy = servicePolicyVersionModel(connection);
  const Price = servicePriceVersionModel(connection), Setting = systemSettingVersionModel(connection), { PricingPolicy } = pricingModels(connection);

  async function list() {
    const now = new Date(clock());
    const services = await Service.find({ 'presentation.locations': 'FACILITY', 'presentation.category': { $in: GROOMING_CATEGORIES } })
      .select('code presentation').sort({ code: 1 }).limit(50).lean();
    if (!services.length) return [];
    const ids = services.map(row => row._id);
    const [versions, policies, prices, pricing, setting] = await Promise.all([
      Version.find({ serviceId: { $in: ids }, effectiveAt: { $lte: now } }).lean(),
      Policy.find({ serviceId: { $in: ids }, effectiveAt: { $lte: now } }).lean(),
      Price.find({ serviceId: { $in: ids }, effectiveAt: { $lte: now } }).lean(),
      PricingPolicy.find({ serviceId: { $in: ids }, status: 'APPROVED', approvedAt: { $lte: now, $ne: null }, effectiveAt: { $lte: now } }).lean(),
      Setting.findOne({ key: 'SERVICE_CATALOG_VISIBLE', effectiveAt: { $lte: now } }).sort({ effectiveAt: -1 }).lean()
    ]);
    const version = newest(versions), policy = newest(policies), price = newest(prices), approved = newest(pricing, true);
    return services.map(service => {
      const key = String(service._id), current = version.get(key), published = policy.get(key), base = price.get(key), rules = approved.get(key);
      const bookable = setting?.enabled === true && current?.state === 'ACTIVE' && published?.state === 'PUBLISHED' && Boolean(base)
        && Boolean(rules && (rules.approvedBy || rules.approvalSource));
      return {
        id: key, code: service.code, name: current?.name ?? service.code, durationMinutes: service.presentation.durationMinutes ?? null,
        fromPriceVnd: base?.amountVnd ?? null, species: current?.species ?? [], bookable
      };
    }).filter(row => row.species.length > 0);
  }

  return {
    list,
    // Resolves chosen service ids to bookable shop services, or fails; the list is the only definition of "shop service".
    async resolve(serviceIds) {
      const shop = new Map((await list()).map(row => [row.id, row]));
      const rows = [...new Set(serviceIds)].map(value => shop.get(String(new Types.ObjectId(value))));
      if (rows.some(row => !row?.bookable || !row.durationMinutes)) fail('SERVICE_UNAVAILABLE', 'Shop service unavailable', 409);
      return new Map(rows.map(row => [row.id, row]));
    }
  };
}
