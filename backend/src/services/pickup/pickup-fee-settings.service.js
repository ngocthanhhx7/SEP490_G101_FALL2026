import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { createCatalogChange } from '../../models/catalog-change-provenance.model.js';
import { systemSettingVersionModel } from '../../models/system-setting-version.model.js';

const PICKUP_KEY = 'PICKUP_FEES';
const fail = (code, message, status = 422) => { throw new AppError(status, code, message); };
const positiveDistance = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const sameNumber = (left, right) => Math.abs(left - right) <= Number.EPSILON * Math.max(1, left, right) * 16;

// An address exactly on the upper boundary of a tier belongs to that tier.
// The first tier also covers exactly zero kilometers.
export function validatePickupFeePolicy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !positiveDistance(input.maxKm) || input.maxKm === 0
    || !Array.isArray(input.tiers) || input.tiers.length < 1 || input.tiers.length > 100)
    fail('VALIDATION_FAILED', 'Invalid pickup tiers and maximum distance');
  let previousEnd = 0;
  const tiers = input.tiers.map((tier, index) => {
    if (!tier || typeof tier !== 'object' || Array.isArray(tier)
      || Object.keys(tier).some(field => !['fromKm', 'toKm', 'feeVnd'].includes(field))
      || !positiveDistance(tier.fromKm) || !positiveDistance(tier.toKm)
      || !Number.isSafeInteger(tier.feeVnd) || tier.feeVnd < 0
      || !sameNumber(tier.fromKm, previousEnd) || tier.toKm <= tier.fromKm)
      fail('VALIDATION_FAILED', 'Pickup distance tiers must be continuous, non-overlapping and have nonnegative integer VND fees');
    const normalized = { fromKm: tier.fromKm, toKm: tier.toKm, feeVnd: tier.feeVnd };
    if (index === 0 && tier.fromKm !== 0) fail('VALIDATION_FAILED', 'Pickup tiers must begin at zero');
    previousEnd = tier.toKm;
    return normalized;
  });
  if (!sameNumber(input.maxKm, previousEnd))
    fail('VALIDATION_FAILED', 'Maximum pickup distance must equal the final tier upper boundary');
  return Object.freeze({ maxKm: previousEnd, tiers });
}

export function pickupFeeForDistance(policy, distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0)
    fail('PICKUP_DISTANCE_UNAVAILABLE', 'Driving distance is unavailable', 503);
  const settings = validatePickupFeePolicy(policy);
  const distanceKm = distanceMeters / 1000;
  if (distanceKm > settings.maxKm) return Object.freeze({
    allowed: false, distanceMeters, distanceKm, maxKm: settings.maxKm
  });
  const tier = settings.tiers.find((item, index) => (index === 0 && distanceKm === 0)
    || (distanceKm > item.fromKm && distanceKm <= item.toKm));
  if (!tier) fail('PICKUP_DISTANCE_UNAVAILABLE', 'No pickup fee tier matches this distance', 503);
  return Object.freeze({
    allowed: true, distanceMeters, distanceKm, maxKm: settings.maxKm,
    feeVnd: tier.feeVnd,
    tier: { fromKm: tier.fromKm, toKm: tier.toKm }
  });
}

export function createPickupFeeSettings({ connection, clock = Date.now }) {
  const Model = systemSettingVersionModel(connection), now = () => new Date(clock());
  const view = row => row && {
    version: row.version, effectiveAt: new Date(row.effectiveAt).toISOString(),
    maxKm: row.pickupFees.maxKm, tiers: row.pickupFees.tiers,
    changedBy: String(row.changedBy), reason: row.reason,
    recordedAt: new Date(row.recordedAt).toISOString()
  };
  return Object.freeze({
    async current({ session } = {}) {
      const row = await Model.findOne({ key: PICKUP_KEY, effectiveAt: { $lte: now() } })
        .sort({ effectiveAt: -1 }).session(session ?? null).lean();
      return view(row);
    },
    async history() {
      const rows = await Model.find({ key: PICKUP_KEY }).sort({ version: -1 }).limit(50).lean();
      return { versions: rows.map(view) };
    },
    async update(actor, input) {
      if (!actor?.roles?.includes('ADMIN') || actor.state !== 'ACTIVE' || !Types.ObjectId.isValid(actor.userId))
        fail('FORBIDDEN', 'Admin required', 403);
      const allowed = ['expectedVersion', 'effectiveAt', 'reason', 'maxKm', 'tiers'];
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !allowed.includes(key))
        || !allowed.every(key => Object.hasOwn(input, key))
        || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0
        || typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.trim().length > 500
        || typeof input.effectiveAt !== 'string' || Number.isNaN(Date.parse(input.effectiveAt)))
        fail('VALIDATION_FAILED', 'Pickup setting requires version, effective timestamp and change reason');
      const policy = validatePickupFeePolicy(input), effectiveAt = new Date(input.effectiveAt);
      if (effectiveAt.toISOString() !== input.effectiveAt
        && effectiveAt.toISOString().replace(/\.000Z$/, 'Z') !== input.effectiveAt)
        fail('VALIDATION_FAILED', 'Pickup effective time must be a canonical UTC timestamp');
      try {
        return await connection.transaction(async session => {
          const latest = await Model.findOne({ key: PICKUP_KEY }).sort({ version: -1 }).session(session).lean();
          if ((latest?.version ?? 0) !== input.expectedVersion)
            fail('VERSION_CONFLICT', 'Pickup fee policy changed; reload before editing', 409);
          const [created] = await Model.create([{
            changeAudit: createCatalogChange('PICKUP_FEES_CHANGED', ['pickupFees']),
            key: PICKUP_KEY, version: input.expectedVersion + 1, effectiveAt,
            pickupFees: policy, changedBy: new Types.ObjectId(actor.userId),
            reason: input.reason.trim(), recordedAt: now()
          }], { session });
          return view(created.toObject());
        }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) {
        if (error?.code === 11000) fail('VERSION_CONFLICT', 'Pickup setting revision already exists', 409);
        throw error;
      }
    }
  });
}
