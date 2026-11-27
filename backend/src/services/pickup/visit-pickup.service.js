import { Types } from 'mongoose';
import { fail, id } from '../../validators/pet-care.validator.js';
import { hasRole } from '../../utils/roles.js';
import { createSchedulingNotifications } from '../notifications/scheduling-notifications.service.js';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const excludedStates = ['CANCELLED', 'SUPERSEDED'];

export function pickupHandoverActions(visit, now) {
  if (visit.location !== 'FACILITY' || !visit.snapshots?.pickup || excludedStates.includes(visit.state))
    return { canPickUp: false, canReturn: false };
  const start = new Date(visit.startAt).getTime(), end = new Date(visit.endAt).getTime();
  return {
    canPickUp: !visit.pickedUpAt && Number.isFinite(start) && Number.isFinite(end)
      && now >= start - TWO_HOURS_MS && now <= end,
    canReturn: Boolean(visit.pickedUpAt && !visit.returnedAt && (visit.checkOutAt || visit.state === 'STAFF_CLOSED'))
  };
}

export function createVisitPickupService({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name);
  const notifications = createSchedulingNotifications({ col, clock });
  return {
    async record(actor, bookingId, visitId, action) {
      if (actor?.state !== 'ACTIVE' || actor.synthetic === true || !hasRole(actor.roles, 'STAFF'))
        fail('FORBIDDEN', 'Staff or Admin required', 403);
      id(actor.userId); id(bookingId); id(visitId);
      if (!['pick-up', 'return'].includes(action)) fail('VALIDATION_FAILED', 'Unknown pickup action');
      return connection.transaction(async session => {
        const actorId = new Types.ObjectId(actor.userId);
        const user = await col('users').findOne({ _id: actorId, state: 'ACTIVE', synthetic: { $ne: true },
          roles: { $in: ['STAFF', 'ADMIN'] }, ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) }, { session });
        if (!user) fail('FORBIDDEN', 'Staff or Admin required', 403);
        const filter = { _id: new Types.ObjectId(visitId), bookingId: new Types.ObjectId(bookingId) };
        const visit = await col('visits').findOne(filter, { session });
        if (!visit || visit.location !== 'FACILITY' || !visit.snapshots?.pickup)
          fail('RESOURCE_NOT_FOUND', 'Pickup visit unavailable', 404);
        const pickup = action === 'pick-up';
        const atField = pickup ? 'pickedUpAt' : 'returnedAt';
        const byField = pickup ? 'pickedUpBy' : 'returnedBy';
        const result = saved => ({ visitId, pickedUpAt: saved.pickedUpAt ?? null, returnedAt: saved.returnedAt ?? null,
          petNames: (saved.snapshots?.pets ?? []).map(pet => pet.name).filter(Boolean) });
        if (visit[atField]) return result(visit);
        const at = new Date(clock()), actions = pickupHandoverActions(visit, at.getTime());
        if (!(pickup ? actions.canPickUp : actions.canReturn))
          fail('INVALID_STATE', 'Pickup handover is not permitted at this time', 409);
        const saved = await col('visits').findOneAndUpdate({ ...filter, version: visit.version, [atField]: null },
          { $set: { [atField]: at, [byField]: actorId }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
        if (!saved) fail('VERSION_CONFLICT', 'Visit changed; reload before retrying', 409);
        await notifications.publish({ type: pickup ? 'VisitPetPickedUp' : 'VisitPetReturned', visitId,
          detail: { version: saved.version }, at }, session);
        return result(saved);
      });
    }
  };
}
