import { createReferenceCatalogFacade } from './reference-catalog.service.js';
import { Types } from 'mongoose';
import { createEmployeeScheduleRepository } from './employee-scheduling/employee-schedule.repository.js';
import { sitterCapabilityInput } from '../validators/sitter-capability.validator.js';
import { digest, id, fail } from '../validators/pet-care.validator.js';
import { hasRole } from '../utils/roles.js';

// Capability verification never changes self-registered shifts, leave, origins or reviews.
export function createSitterCapabilityService({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name);
  function authorize(actor) {
    if (!actor?.userId || actor.state !== 'ACTIVE' || !Number.isFinite(actor.expiresAt) || actor.expiresAt <= clock()) fail('UNAUTHENTICATED', 'Session required', 401);
    if (!hasRole(actor.roles, 'STAFF')) fail('FORBIDDEN', 'Staff required', 403);
  }
  return {
    async save({ actor, userId, body, key }) {
      authorize(actor); id(userId);
      if (typeof key !== 'string' || key.length < 8 || key.length > 200) fail('VALIDATION_FAILED', 'Operation key required');
      const repository = createEmployeeScheduleRepository({ connection, clock });
      const input = sitterCapabilityInput(body), fingerprint = digest(input), commandId = digest([actor.userId, userId, 'capability', key]);
      return repository.runGuard({ sitterId: userId }, async session => {
        const staff = await col('users').findOneAndUpdate({ _id: new Types.ObjectId(actor.userId), state: 'ACTIVE', roles: { $in: ['STAFF', 'ADMIN'] },
          ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) }, { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' });
        if (!staff || !hasRole(staff.roles, 'STAFF')) fail('FORBIDDEN', 'Current staff access required', 403);
        const previous = await repository.models.EmployeeScheduleCommand.findById(commandId).session(session).lean();
        if (previous) { if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Operation key already used', 409); return previous.result; }
        await repository.registrationContract(userId, session);
        const serviceIds = input.serviceIds.map(value => new Types.ObjectId(value));
        if (await col('services').countDocuments({ _id: { $in: serviceIds } }, { session }) !== serviceIds.length) fail('VALIDATION_FAILED', 'Unknown service');
        const current = await col('aisitterprofiles').findOne({ userId: new Types.ObjectId(userId) }, { session });
        const traits = await createReferenceCatalogFacade({ connection }).listTraits({ limit: 100 });
        if (input.allowedTraits.some(code => !traits.some(trait => trait.code === code) && !current?.allowedTraits?.includes(code))) fail('VALIDATION_FAILED', 'Unknown care trait');
        if ((current?.version ?? 0) !== input.expectedVersion) fail('VERSION_CONFLICT', 'Reload capability', 409);
        const patch = { serviceIds, species: input.species, allowedTraits: input.allowedTraits, maxPets: input.maxPets,
          maxWeightKg: input.maxWeightKg, active: input.active, changedBy: new Types.ObjectId(actor.userId), version: input.expectedVersion + 1 };
        if (current) {
          const changed = await col('aisitterprofiles').updateOne({ _id: current._id, ...(current.version === undefined ? { version: { $exists: false } } : { version: current.version }) }, { $set: patch }, { session });
          if (!changed.matchedCount) fail('VERSION_CONFLICT', 'Reload capability', 409);
        } else {
          const availability = await repository.find(userId, session);
          await col('aisitterprofiles').insertOne({ userId: new Types.ObjectId(userId), ...patch,
            areaCodes: availability?.areas ?? [], windows: [], dayOffDates: [], starts: [], timeZone: 'Asia/Ho_Chi_Minh' }, { session });
        }
        const result = { userId, version: patch.version };
        await repository.models.EmployeeScheduleCommand.create([{ _id: commandId, fingerprint, result, createdAt: new Date(clock()) }], { session });
        await repository.models.EmployeeScheduleEvent.create([{ type: 'CapabilityVerified', actorId: actor.userId, sitterId: userId,
          at: new Date(clock()), detail: { version: patch.version, reason: input.reason, serviceIds: input.serviceIds, active: input.active } }], { session });
        return result;
      });
    }
  };
}
