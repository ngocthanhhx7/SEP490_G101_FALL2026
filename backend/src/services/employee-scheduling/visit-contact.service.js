import { Types } from 'mongoose';
import { fail } from '../../validators/pet-care.validator.js';
import { visitContactQuery } from '../../validators/needs-action.validator.js';

const staffOnly = actor => {
  if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
};

// "Call" on the visit board (R3 10.1.1): shows the phone number of the pet sitter or the customer of one visit.
// The number is read only here, on request. It is not part of any list, and the audit event records who looked, never the number.
export function createVisitContactService({ repository, clock = Date.now, phones }) {
  const { col, models } = repository;
  return {
    async read(actor, visitId, rawQuery) {
      staffOnly(actor);
      const { party } = visitContactQuery(rawQuery);
      if (typeof phones?.phonesOf !== 'function') fail('CONTACT_LOOKUP_UNAVAILABLE', 'Phone lookup is not configured', 503);
      const visit = await col('visits').findOne({ _id: new Types.ObjectId(visitId) }, { projection: { customerId: 1, sitterId: 1 } });
      if (!visit) fail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
      const targetId = party === 'sitter' ? visit.sitterId : visit.customerId;
      if (!targetId) fail('RESOURCE_NOT_FOUND', 'No pet sitter is assigned to this visit', 404);
      const [user, numbers] = await Promise.all([
        col('users').findOne({ _id: targetId }, { projection: { displayName: 1 } }),
        phones.phonesOf([String(targetId)])
      ]);
      const phone = numbers.get(String(targetId)) ?? null;
      await models.EmployeeScheduleEvent.create([{ type: 'VisitContactViewed', actorId: actor.userId, ...(visit.sitterId ? { sitterId: String(visit.sitterId) } : {}),
        visitId, at: new Date(clock()), detail: { party, found: phone !== null } }]);
      return { party, displayName: user?.displayName ?? null, phone };
    }
  };
}
