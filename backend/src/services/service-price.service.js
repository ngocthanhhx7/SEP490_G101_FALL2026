import { Types } from 'mongoose';
import { AppError } from '../utils/app-error.js';

function invalid(message = 'Price configuration is invalid') {
  throw new AppError(422, 'VALIDATION_FAILED', message);
}

export function parsePriceVersionInput(value) {
  const allowed = new Set(['expectedVersion', 'amountVnd', 'unitLabel', 'effectiveAt', 'reason']);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.has(key))
    || [...allowed].some(key => !Object.hasOwn(value, key))) invalid();
  if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0
    || !Number.isSafeInteger(value.amountVnd) || value.amountVnd < 0
    || typeof value.unitLabel !== 'string' || value.unitLabel.trim().length < 2 || value.unitLabel.trim().length > 80
    || typeof value.reason !== 'string' || value.reason.trim().length < 3 || value.reason.trim().length > 500
    || typeof value.effectiveAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value.effectiveAt)) invalid();
  const effectiveAt = new Date(value.effectiveAt);
  if (!Number.isFinite(effectiveAt.getTime())
    || (effectiveAt.toISOString() !== value.effectiveAt
      && effectiveAt.toISOString().replace(/\.000Z$/, 'Z') !== value.effectiveAt)) {
    invalid('Effective time is invalid');
  }
  return {
    expectedVersion: value.expectedVersion, amountVnd: value.amountVnd,
    unitLabel: value.unitLabel.trim(), effectiveAt, reason: value.reason.trim()
  };
}

function serviceObjectId(serviceId) {
  if (!Types.ObjectId.isValid(serviceId)) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Service not found');
  return new Types.ObjectId(serviceId);
}

function duplicateConflict(error) {
  if (error?.code === 11000) throw new AppError(409, 'VERSION_CONFLICT', 'A price version already exists for this effective time');
  throw error;
}

function priceView(price) {
  return {
    serviceId: price.serviceId.toString(), version: price.version, amountVnd: price.amountVnd,
    currency: price.currency, unitLabel: price.unitLabel, effectiveAt: price.effectiveAt.toISOString()
  };
}

export function createServicePriceService({ connection, PriceVersion, Audit, serviceExists, clock = Date.now }) {
  if (!connection?.transaction || !PriceVersion || !Audit || typeof serviceExists !== 'function'
    || typeof clock !== 'function') throw new TypeError('Service price dependencies are required');

  async function list(serviceId) {
    const id = serviceObjectId(serviceId);
    if (!await serviceExists(id.toString())) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Service not found');
    const prices = await PriceVersion.find({ serviceId: id }).sort({ effectiveAt: -1, version: -1 }).lean();
    return prices.map(priceView);
  }

  async function latestVersion(serviceId) {
    const id = serviceObjectId(serviceId);
    const latest = await PriceVersion.findOne({ serviceId: id }).sort({ version: -1 }).lean();
    return latest?.version ?? 0;
  }

  async function getActivePrice(serviceId, at = new Date(clock())) {
    const id = serviceObjectId(serviceId);
    if (!await serviceExists(id.toString())) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Service not found');
    const price = await PriceVersion.findOne({ serviceId: id, effectiveAt: { $lte: at } })
      .sort({ effectiveAt: -1, version: -1 }).lean();
    return price ? priceView(price) : null;
  }

  async function createVersion({ serviceId, body, actor }) {
    const id = serviceObjectId(serviceId);
    const input = parsePriceVersionInput(body);
    if (!actor?.userId || !Types.ObjectId.isValid(actor.userId)) {
      throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    }
    if (!await serviceExists(id.toString())) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Service not found');
    try {
      return await connection.transaction(async session => {
        const previous = await PriceVersion.findOne({ serviceId: id }).sort({ version: -1 })
          .session(session).lean();
        if ((previous?.version ?? 0) !== input.expectedVersion) {
          throw new AppError(409, 'VERSION_CONFLICT', 'Price changed before this update was applied');
        }
        const now = new Date(clock());
        const [price] = await PriceVersion.create([{
          serviceId: id, version: input.expectedVersion + 1, amountVnd: input.amountVnd,
          currency: 'VND', unitLabel: input.unitLabel, effectiveAt: input.effectiveAt,
          changedBy: new Types.ObjectId(actor.userId), reason: input.reason, recordedAt: now
        }], { session });
        await Audit.create([{
          actorId: new Types.ObjectId(actor.userId), action: 'SERVICE_PRICE_VERSIONED',
          resourceType: 'service-price', resourceId: id, version: price.version,
          changedFields: ['amountVnd', 'currency', 'unitLabel'], reason: input.reason,
          effectiveAt: input.effectiveAt, occurredAt: now
        }], { session });
        return priceView(price.toObject());
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) { duplicateConflict(error); }
  }

  return Object.freeze({ list, latestVersion, getActivePrice, createVersion });
}
