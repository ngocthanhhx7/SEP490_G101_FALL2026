import { Types } from 'mongoose';
import { AppError } from '../utils/app-error.js';

const SETTING_KEY = 'SERVICE_CATALOG_VISIBLE';

function invalid(message = 'System setting is invalid') {
  throw new AppError(422, 'VALIDATION_FAILED', message);
}

export function parseCatalogSettingInput(value) {
  const allowed = new Set(['expectedVersion', 'enabled', 'effectiveAt', 'reason']);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.has(key))
    || [...allowed].some(key => !Object.hasOwn(value, key))) invalid();
  if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0
    || typeof value.enabled !== 'boolean'
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
    expectedVersion: value.expectedVersion, enabled: value.enabled,
    effectiveAt, reason: value.reason.trim()
  };
}

function view(record) {
  return {
    key: SETTING_KEY, version: record.version, enabled: record.enabled,
    effectiveAt: record.effectiveAt.toISOString(), changedBy: record.changedBy.toString(),
    reason: record.reason, recordedAt: record.recordedAt.toISOString()
  };
}

function duplicateConflict(error) {
  if (error?.code === 11000) throw new AppError(409, 'VERSION_CONFLICT', 'A setting version already exists for this effective time');
  throw error;
}

export function createSystemSettingsService({ connection, SettingVersion, Audit, clock = Date.now }) {
  if (!connection?.transaction || !SettingVersion || !Audit || typeof clock !== 'function') {
    throw new TypeError('System settings dependencies are required');
  }

  async function currentAt(at = new Date(clock())) {
    const record = await SettingVersion.findOne({ key: SETTING_KEY, effectiveAt: { $lte: at } })
      .sort({ effectiveAt: -1, version: -1 }).lean();
    return record ? view(record) : {
      key: SETTING_KEY, version: 0, enabled: false, effectiveAt: null, changedBy: null, reason: null, recordedAt: null
    };
  }

  async function isEnabledAt(at = new Date(clock())) {
    const setting = await currentAt(at);
    return setting.enabled;
  }

  async function overview() {
    const [current, latest, versions] = await Promise.all([
      currentAt(),
      SettingVersion.findOne({ key: SETTING_KEY }).sort({ version: -1 }).lean(),
      SettingVersion.find({ key: SETTING_KEY }).sort({ version: -1 }).limit(20).lean()
    ]);
    return {
      currency: {
        code: 'VND', unitVnd: 1, input: 'NON_NEGATIVE_INTEGER',
        rounding: 'REJECT_FRACTIONAL_NO_ROUNDING'
      },
      catalogVisibility: current,
      latestVersion: latest?.version ?? 0,
      history: versions.map(view)
    };
  }

  async function updateCatalogVisibility({ body, actor }) {
    const input = parseCatalogSettingInput(body);
    if (!actor?.userId || !Types.ObjectId.isValid(actor.userId)) {
      throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    }
    try {
      return await connection.transaction(async session => {
        const previous = await SettingVersion.findOne({ key: SETTING_KEY }).sort({ version: -1 })
          .session(session).lean();
        if ((previous?.version ?? 0) !== input.expectedVersion) {
          throw new AppError(409, 'VERSION_CONFLICT', 'System setting changed before this update was applied');
        }
        const now = new Date(clock());
        const [record] = await SettingVersion.create([{
          key: SETTING_KEY, version: input.expectedVersion + 1, enabled: input.enabled,
          effectiveAt: input.effectiveAt, changedBy: new Types.ObjectId(actor.userId),
          reason: input.reason, recordedAt: now
        }], { session });
        await Audit.create([{
          actorId: new Types.ObjectId(actor.userId), action: 'SERVICE_CATALOG_VISIBILITY_CHANGED',
          resourceType: 'system-setting', resourceId: record._id, version: record.version,
          changedFields: ['enabled'], reason: input.reason, effectiveAt: input.effectiveAt, occurredAt: now
        }], { session });
        return view(record.toObject());
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) { duplicateConflict(error); }
  }

  return Object.freeze({
    overview, currentAt, isEnabledAt, updateCatalogVisibility,
    catalogSettings: Object.freeze({ isEnabledAt })
  });
}
