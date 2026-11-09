import { hasRole } from '../../utils/roles.js';
import { Types } from 'mongoose';
import { digest, fail } from '../../validators/pet-care.validator.js';
import { sitterOriginInput } from '../../validators/sitter-origin.validator.js';
import { schedulingDate } from './schedule-policy.service.js';

export function createSitterOriginService({ repository, clock = Date.now }) {
  const col = repository.col;
  function authorize(actor) {
    if (!actor?.userId || actor.state !== 'ACTIVE' || !hasRole(actor.roles, 'PET_SITTER')) fail('FORBIDDEN', 'Employee required', 403);
  }
  async function current(userId, session) {
    return col('aisitterprofiles').findOne({ userId: new Types.ObjectId(userId), active: true }, { session, projection: { version: 1, starts: 1 } });
  }
  return {
    async get(actor) {
      authorize(actor); const row = await current(actor.userId);
      return { version: row?.version ?? 0, capabilityReady: Boolean(row), items: (row?.starts ?? []).filter(value => value.localDate >= schedulingDate(clock())).map(value => ({
        localDate: value.localDate, coordinates: value.point?.coordinates, availableFrom: value.availableFrom, availableUntil: value.availableUntil })) };
    },
    async save(actor, body, key) {
      authorize(actor); const input = sitterOriginInput(body, clock());
      if (typeof key !== 'string' || key.length < 8 || key.length > 200) fail('VALIDATION_FAILED', 'Operation key required');
      const commandId = digest([actor.userId, 'origin', key]), fingerprint = digest(input);
      return repository.runGuard({ sitterId: actor.userId, authEpoch: actor.authEpoch }, async session => {
        const previous = await repository.models.EmployeeScheduleCommand.findById(commandId).session(session).lean();
        if (previous) { if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Operation key already used', 409); return previous.result; }
        await repository.contractAt(actor.userId, new Date(input.availableFrom), new Date(input.availableUntil), session);
        const row = await current(actor.userId, session);
        if (!row) fail('SERVICE_CAPABILITY_REQUIRED', 'Staff must verify capability first', 409);
        if ((row.version ?? 0) !== input.expectedVersion) fail('VERSION_CONFLICT', 'Reload origin', 409);
        const starts = (row.starts ?? []).filter(value => value.localDate >= schedulingDate(clock()) && value.localDate !== input.localDate);
        if (starts.length >= 31) fail('VALIDATION_FAILED', 'At most 31 daily origins');
        starts.push({ localDate: input.localDate, point: { type: 'Point', coordinates: input.coordinates }, availableFrom: new Date(input.availableFrom), availableUntil: new Date(input.availableUntil) });
        const changed = await col('aisitterprofiles').updateOne({ _id: row._id, ...(row.version === undefined ? { version: { $exists: false } } : { version: row.version }) },
          { $set: { starts }, $inc: { version: 1 } }, { session });
        if (!changed.matchedCount) fail('VERSION_CONFLICT', 'Reload origin', 409);
        const result = { version: input.expectedVersion + 1, localDate: input.localDate };
        await repository.models.EmployeeScheduleCommand.create([{ _id: commandId, fingerprint, result, createdAt: new Date(clock()) }], { session });
        await repository.models.EmployeeScheduleEvent.create([{ type: 'DayOriginDeclared', actorId: actor.userId, sitterId: actor.userId, at: new Date(clock()), detail: { localDate: input.localDate, version: result.version } }], { session });
        return result;
      });
    }
  };
}
