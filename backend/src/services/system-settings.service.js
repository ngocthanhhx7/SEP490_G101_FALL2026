import { Types } from 'mongoose';
import { createCatalogChange } from '../models/catalog-change-provenance.model.js';
import { DEFAULT_FAULTY_PRODUCT_REPORT_DAYS } from '../constants/faulty-product-claim-fields.js';
import { AppError } from '../utils/app-error.js';

const SETTING_KEY = 'SERVICE_CATALOG_VISIBLE';
const FAULTY_DAYS_KEY = 'FAULTY_PRODUCT_REPORT_DAYS';

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

export function parseFaultyProductReportDaysInput(value) {
  const allowed = new Set(['expectedVersion', 'days', 'reason']);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.has(key))) invalid();
  if (value.expectedVersion !== undefined && (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0)) {
    invalid();
  }
  if (!Number.isSafeInteger(value.days) || value.days < 1 || value.days > 365) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Faulty product report days must be a whole number greater than 0', {
      fieldErrors: { days: 'Vui lòng nhập số nguyên lớn hơn 0.' }
    });
  }
  const reason = value.reason === undefined || value.reason === ''
    ? 'Cập nhật thời hạn báo sản phẩm lỗi'
    : typeof value.reason === 'string' && value.reason.trim().length >= 3 && value.reason.trim().length <= 500
      ? value.reason.trim()
      : invalid();
  return { expectedVersion: value.expectedVersion, days: value.days, reason };
}

function view(record) {
  return {
    key: SETTING_KEY, version: record.version, enabled: record.enabled,
    effectiveAt: record.effectiveAt.toISOString(), changedBy: record.changedBy.toString(),
    reason: record.reason, recordedAt: record.recordedAt.toISOString()
  };
}

function faultyDaysView(record) {
  return record
    ? {
      key: FAULTY_DAYS_KEY,
      version: record.version,
      days: record.valueDays,
      effectiveAt: record.effectiveAt.toISOString(),
      changedBy: record.changedBy.toString(),
      reason: record.reason,
      recordedAt: record.recordedAt.toISOString()
    }
    : {
      key: FAULTY_DAYS_KEY,
      version: 0,
      days: DEFAULT_FAULTY_PRODUCT_REPORT_DAYS,
      effectiveAt: null,
      changedBy: null,
      reason: null,
      recordedAt: null
    };
}

function duplicateConflict(error) {
  if (error?.code === 11000) throw new AppError(409, 'VERSION_CONFLICT', 'A setting version already exists for this effective time');
  throw error;
}

export function createSystemSettingsService({ connection, SettingVersion, clock = Date.now }) {
  if (!connection?.transaction || !SettingVersion || typeof clock !== 'function') {
    throw new TypeError('System settings dependencies are required');
  }

  async function currentAt(at = new Date(clock())) {
    const record = await SettingVersion.findOne({ key: SETTING_KEY, effectiveAt: { $lte: at } })
      .sort({ effectiveAt: -1 }).lean();
    return record ? view(record) : {
      key: SETTING_KEY, version: 0, enabled: false, effectiveAt: null, changedBy: null, reason: null, recordedAt: null
    };
  }

  async function isEnabledAt(at = new Date(clock())) {
    const setting = await currentAt(at);
    return setting.enabled;
  }

  async function currentFaultyProductReportDays(at = new Date(clock()), session = null) {
    const record = await SettingVersion.findOne({ key: FAULTY_DAYS_KEY, effectiveAt: { $lte: at } })
      .sort({ effectiveAt: -1, version: -1 }).session(session).lean();
    return faultyDaysView(record);
  }

  async function overview() {
    const [current, latest, versions, faultyDays] = await Promise.all([
      currentAt(),
      SettingVersion.findOne({ key: SETTING_KEY }).sort({ version: -1 }).lean(),
      SettingVersion.find({ key: SETTING_KEY }).sort({ version: -1 }).limit(20).lean(),
      currentFaultyProductReportDays()
    ]);
    return {
      currency: {
        code: 'VND', unitVnd: 1, input: 'NON_NEGATIVE_INTEGER',
        rounding: 'REJECT_FRACTIONAL_NO_ROUNDING'
      },
      catalogVisibility: current,
      latestVersion: latest?.version ?? 0,
      history: versions.map(view),
      faultyProductReportDays: faultyDays
    };
  }

  async function updateFaultyProductReportDays({ body, actor }) {
    const input = parseFaultyProductReportDaysInput(body);
    if (!actor?.userId || !Types.ObjectId.isValid(actor.userId)) {
      throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    }
    try {
      return await connection.transaction(async session => {
        const previous = await SettingVersion.findOne({ key: FAULTY_DAYS_KEY }).sort({ version: -1 })
          .session(session).lean();
        const latestVersion = previous?.version ?? 0;
        if (input.expectedVersion !== undefined && latestVersion !== input.expectedVersion) {
          throw new AppError(409, 'VERSION_CONFLICT', 'System setting changed before this update was applied');
        }
        const now = new Date(clock());
        const effectiveAt = previous && previous.effectiveAt >= now
          ? new Date(previous.effectiveAt.getTime() + 1)
          : now;
        const [record] = await SettingVersion.create([{
          changeAudit: createCatalogChange('FAULTY_PRODUCT_REPORT_DAYS_CHANGED', ['valueDays']),
          key: FAULTY_DAYS_KEY,
          version: latestVersion + 1,
          valueDays: input.days,
          effectiveAt,
          changedBy: new Types.ObjectId(actor.userId),
          reason: input.reason,
          recordedAt: now
        }], { session });
        return faultyDaysView(record.toObject());
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) { duplicateConflict(error); }
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
          changeAudit: createCatalogChange('SERVICE_CATALOG_VISIBILITY_CHANGED', ['enabled']),
          key: SETTING_KEY, version: input.expectedVersion + 1, enabled: input.enabled,
          effectiveAt: input.effectiveAt, changedBy: new Types.ObjectId(actor.userId),
          reason: input.reason, recordedAt: now
        }], { session });
        return view(record.toObject());
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) { duplicateConflict(error); }
  }

  return Object.freeze({
    overview, currentAt, isEnabledAt, updateCatalogVisibility,
    currentFaultyProductReportDays, updateFaultyProductReportDays,
    catalogSettings: Object.freeze({ isEnabledAt })
  });
}
