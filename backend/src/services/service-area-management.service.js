import { Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { serviceAreaModels } from '../models/service-area.model.js';
import { createUnitOfWork } from './unit-of-work.service.js';
import { AREA_POLICY_ID, areaView } from './service-area-catalog.service.js';
import { AppError } from '../utils/app-error.js';
import { areaListInput, areaChangeInput } from '../validators/service-area.validator.js';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createServiceAreaManagement({ connection, clock = Date.now }) {
  const { ServiceArea: Area, ServiceAreaCommand: Command } = serviceAreaModels(connection), uow = createUnitOfWork(connection);
  function requireAdmin(actor) { if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('ADMIN')) throw new AppError(403, 'FORBIDDEN', 'Admin required'); }
  return {
    async list(actor, query) {
      requireAdmin(actor); const input = areaListInput(query), policy = await Area.findById(AREA_POLICY_ID).lean();
      if (!policy) throw new AppError(503, 'WORK_AREA_CATALOG_UNAVAILABLE', 'Provision area registry first');
      const filter = { level: input.level ?? (input.parentCode?.startsWith('PROVINCE_') ? 'COMMUNE' : 'DISTRICT'), ...(input.parentCode ? { parentCode: input.parentCode } : {}), ...(input.level ? { level: input.level } : {}),
        ...(input.after ? { _id: { $gt: input.after } } : {}) };
      const rows = await Area.find(filter).sort({ _id: 1 }).limit(101).lean();
      return { items: rows.slice(0, 100).map(areaView), expectedVersion: policy.version,
        sourceVersion: policy.sourceVersion, nextCursor: rows.length > 100 ? rows[99]._id : null };
    },
    async change(actor, body, key) {
      requireAdmin(actor); const input = areaChangeInput(body, key), commandId = hash([actor.userId, 'AREA_COVERAGE', key]), fingerprint = hash(input);
      return uow.run(async session => {
        // Recheck current principal inside the transaction, including session revocation epoch.
        const user = await connection.db.collection('users').findOne({ _id: new Types.ObjectId(actor.userId), state: 'ACTIVE', roles: 'ADMIN', ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) }, { session, projection: { _id: 1 } });
        if (!user) throw new AppError(403, 'FORBIDDEN', 'Admin no longer active');
        const prior = await Command.findById(commandId).session(session).lean();
        if (prior) { if (prior.fingerprint !== fingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Key reused'); return prior.result; }
        const policy = await Area.findOneAndUpdate({ _id: AREA_POLICY_ID, version: input.expectedVersion }, { $inc: { version: 1 } }, { session, returnDocument: 'after' }).lean();
        if (!policy) throw new AppError(409, 'VERSION_CONFLICT', 'Area coverage changed; reload');
        const rows = await Area.find({ _id: { $in: input.codes }, level: { $in: ['COMMUNE', 'CITY', 'DISTRICT'] } }).session(session).lean();
        if (rows.length !== input.codes.length) throw new AppError(422, 'VALIDATION_FAILED', 'Choose communes or legacy operational areas');
        const now = new Date(clock());
        await Area.updateMany({ _id: { $in: input.codes } }, { $set: { enabled: input.enabled, changedAt: now, changedBy: actor.userId, reason: input.reason }, $inc: { version: 1 } }, { session });
        const result = { codes: input.codes, enabled: input.enabled, expectedVersion: policy.version };
        await Command.create([{ _id: commandId, fingerprint, result, actorId: actor.userId, codes: input.codes, enabled: input.enabled, reason: input.reason, createdAt: now, expiresAt: new Date(clock() + 30 * 86400000) }], { session });
        return result;
      });
    }
  };
}
