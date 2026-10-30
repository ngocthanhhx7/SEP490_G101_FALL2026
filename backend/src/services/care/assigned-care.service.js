import { Types } from 'mongoose';
import { id, fail, exact, digest } from '../../validators/pet-care.validator.js';
import { schedulingKey } from '../../validators/employee-scheduling.validator.js';

const oid = value => new Types.ObjectId(value);
export function createAssignedCareService({ repository, clock = Date.now }) {
  const { col, uow, models } = repository;
  async function load(actor, visitId, session) {
    id(visitId); id(actor?.userId);
    if (actor.state !== 'ACTIVE' || actor.synthetic || !actor.roles?.includes('PET_SITTER')) fail('FORBIDDEN', 'Assigned employee required', 403);
    const visit = await col('visits').findOne({ _id: oid(visitId), sitterId: oid(actor.userId), state: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }, { session });
    const booking = visit && await col('bookings').findOne({ _id: visit.bookingId, state: { $in: ['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'] } }, { session });
    if (!visit || !booking) fail('RESOURCE_NOT_FOUND', 'Assigned care unavailable', 404);
    if (visit.handoverRequired === true && visit.handoverAccepted !== true) fail('HANDOVER_REQUIRED', 'Confirmed handover required', 403);
    if (visit.snapshots?.care?.schemaVersion !== 1) fail('CARE_SNAPSHOT_UNAVAILABLE', 'Legacy visit requires an authorized care snapshot', 503);
    return visit;
  }
  const fingerprint = visit => digest(visit.snapshots.care);
  return {
    async get(actor, visitId) {
      return uow.run(async session => {
        const visit = await load(actor, visitId, session), care = visit.snapshots.care;
        return { visitId, version: fingerprint(visit), source: 'OWNER_DECLARED_AT_CHECKOUT', capturedAt: care.capturedAt,
          pets: care.pets, acknowledged: visit.careAcknowledgement?.sitterId === actor.userId && visit.careAcknowledgement.version === fingerprint(visit),
          accessOpensAt: new Date(visit.startAt.getTime() - 3600000), accessExpiresAt: visit.endAt };
      });
    },
    async acknowledge(actor, visitId, body, key) {
      exact(body, ['version'], ['version']); schedulingKey(key);
      if (typeof body.version !== 'string' || !/^[a-f0-9]{64}$/.test(body.version)) fail('VALIDATION_FAILED', 'Snapshot version required');
      return uow.run(async session => {
        const visit = await load(actor, visitId, session);
        await repository.employeeGuard(actor.userId, session, actor.authEpoch);
        if (body.version !== fingerprint(visit)) fail('VERSION_CONFLICT', 'Care snapshot changed', 409);
        const commandId = digest([actor.userId, 'CARE_ACK', visitId, key]), hash = digest(body);
        const previous = await models.EmployeeScheduleCommand.findById(commandId).session(session).lean();
        if (previous) {
          if (previous.fingerprint !== hash) fail('IDEMPOTENCY_CONFLICT', 'Operation key reused', 409);
          return previous.result;
        }
        const acknowledgedAt = new Date(clock());
        const saved = await col('visits').updateOne({ _id: visit._id, sitterId: visit.sitterId, version: visit.version, state: visit.state },
          { $set: { careAcknowledgement: { sitterId: actor.userId, version: body.version, acknowledgedAt } } }, { session });
        if (!saved.matchedCount) fail('VERSION_CONFLICT', 'Assignment changed', 409);
        const result = { acknowledged: true, version: body.version, acknowledgedAt };
        await models.EmployeeScheduleCommand.create([{ _id: commandId, fingerprint: hash, result, createdAt: acknowledgedAt }], { session });
        await models.EmployeeScheduleEvent.create([{ type: 'CareSnapshotAcknowledged', actorId: actor.userId, visitId, at: acknowledgedAt }], { session });
        return result;
      });
    },
    async accessNotes(actor, visitId) {
      return uow.run(async session => {
        const visit = await load(actor, visitId, session);
        if (clock() < visit.startAt.getTime() - 3600000 || clock() >= visit.endAt.getTime()) fail('ACCESS_WINDOW_CLOSED', 'Access note window closed', 403);
        if (visit.careAcknowledgement?.sitterId !== actor.userId || visit.careAcknowledgement.version !== fingerprint(visit))
          fail('CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED', 'Acknowledge current care snapshot', 403);
        return { visitId, privateAccessNotes: visit.snapshots.care.privateAccessNotes ?? '', expiresAt: visit.endAt };
      });
    }
  };
}
