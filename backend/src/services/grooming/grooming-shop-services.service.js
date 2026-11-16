import { Types } from 'mongoose';
import { serviceModel } from '../../models/service.model.js';
import { serviceVersionModel } from '../../models/service-version.model.js';
import { servicePolicyVersionModel } from '../../models/service-policy-version.model.js';
import { servicePriceVersionModel } from '../../models/service-price-version.model.js';
import { systemSettingVersionModel } from '../../models/system-setting-version.model.js';
import { pricingModels } from '../../models/pricing.model.js';
import { GROOMING_CATEGORIES } from '../../constants/grooming.js';
import { fail } from '../../validators/pet-care.validator.js';

// Select effective versions inside Mongo instead of transferring unbounded history.
const effectiveRows = (Model, filter, session, byVersion = false) => Model.aggregate([
  { $match: filter }, { $sort: byVersion ? { serviceId: 1, version: -1 } : { serviceId: 1, effectiveAt: -1, version: -1 } },
  { $group: { _id: '$serviceId', current: { $first: '$$ROOT' } } }, { $replaceWith: '$current' }, { $limit: 51 }
]).session(session).option({ maxTimeMS: 5000, allowDiskUse: false });
const indexed = rows => new Map(rows.map(row => [String(row.serviceId), row]));

// Shop services are the services whose presentation offers FACILITY and sits in a grooming category.
// A service that is not currently bookable (no active version, published policy, price or APPROVED pricing policy) is listed with bookable:false.
export function createGroomingShopServices({ connection, clock = Date.now }) {
  const Service = serviceModel(connection), Version = serviceVersionModel(connection), Policy = servicePolicyVersionModel(connection);
  const Price = servicePriceVersionModel(connection), Setting = systemSettingVersionModel(connection), { PricingPolicy } = pricingModels(connection);

  async function list({ session = null } = {}) {
    const now = new Date(clock());
    const services = await Service.find({ 'presentation.locations': 'FACILITY', 'presentation.category': { $in: GROOMING_CATEGORIES } })
      .select('code presentation').sort({ code: 1 }).limit(51).maxTimeMS(5000).session(session).lean();
    if (services.length > 50) fail('GROOMING_CATALOG_REVIEW_REQUIRED', 'Shop service catalog exceeds review budget', 503);
    if (!services.length) return [];
    const ids = services.map(row => row._id);
    const [versions, policies, prices, pricing, setting] = await Promise.all([
      effectiveRows(Version, { serviceId: { $in: ids }, effectiveAt: { $lte: now } }, session),
      effectiveRows(Policy, { serviceId: { $in: ids }, effectiveAt: { $lte: now } }, session),
      effectiveRows(Price, { serviceId: { $in: ids }, effectiveAt: { $lte: now } }, session),
      effectiveRows(PricingPolicy, { serviceId: { $in: ids }, status: 'APPROVED', approvedAt: { $lte: now, $ne: null }, effectiveAt: { $lte: now } }, session, true),
      Setting.findOne({ key: 'SERVICE_CATALOG_VISIBLE', effectiveAt: { $lte: now } }).sort({ effectiveAt: -1 }).maxTimeMS(5000).session(session).lean()
    ]);
    const version = indexed(versions), policy = indexed(policies), price = indexed(prices), approved = indexed(pricing);
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
    async resolve(serviceIds, options = {}) {
      const shop = new Map((await list(options)).map(row => [row.id, row]));
      const rows = [...new Set(serviceIds)].map(value => shop.get(String(new Types.ObjectId(value))));
      if (rows.some(row => !row?.bookable || !row.durationMinutes)) fail('SERVICE_UNAVAILABLE', 'Shop service unavailable', 409);
      return new Map(rows.map(row => [row.id, row]));
    }
  };
}
