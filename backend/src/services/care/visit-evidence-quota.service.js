import { handoverPending } from './visit-handover-policy.service.js';
import { Types } from 'mongoose';
import { digest } from '../../validators/pet-care.validator.js';
import { workflowHash, workflowTasks } from './workflow-snapshot.service.js';
import { workflowFail } from '../../validators/service-workflow.validator.js';

export function createVisitEvidenceQuota({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name);
  return async function authorize({ actor, visitId, session, reserve = false }) {
    if (!/^[a-f0-9]{24}$/.test(visitId) || actor.state !== 'ACTIVE' ||
      actor.synthetic || !actor.roles?.includes('PET_SITTER'))
      workflowFail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
    const sitterId = new Types.ObjectId(actor.userId);
    const visit = await col('visits').findOne({ _id: new Types.ObjectId(visitId), sitterId }, { session, maxTimeMS: 2000 });
    if (!visit) workflowFail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
    const at = clock();
    const arriving = visit.state === 'ASSIGNED';
    const end = +visit.endAt;
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(visit.state) ||
      !(visit.startAt instanceof Date) || !(visit.endAt instanceof Date) ||
      at < +visit.startAt - 30 * 60 * 1000 || at > end + (arriving ? 0 : 2 * 60 * 60 * 1000) ||
      handoverPending(visit))
      workflowFail('INVALID_STATE', 'Visit cannot accept uploads now', 409);
    const inProgressStarted = visit.state === 'IN_PROGRESS' && visit.checkInAt instanceof Date;
    const allowedStatuses = inProgressStarted ? ['ACTIVE', 'SUSPENDED'] : ['ACTIVE'];
    const active = await col('sitterstatuses').findOne({ userId: sitterId, status: { $in: allowedStatuses } }, { session, maxTimeMS: 2000 });
    const booking = await col('bookings').findOne({
      _id: visit.bookingId, visitIds: visit._id, state: { $in: ['ASSIGNED', 'DISPATCH_PENDING', 'IN_PROGRESS'] }
    }, { session, projection: { _id: 1 }, maxTimeMS: 2000 });
    if (!active || !booking) workflowFail('FORBIDDEN', 'Current assigned employee required', 403);
    const snapshot = visit.snapshots?.workflow;
    if (snapshot && (snapshot.hash !== workflowHash(snapshot.definition) ||
      !visit.snapshots.care || visit.careAcknowledgement?.sitterId !== actor.userId ||
      visit.careAcknowledgement?.version !== digest(visit.snapshots.care)))
      workflowFail('CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED', 'Acknowledge current care instructions first', 409);
    if (!reserve) return;

    const user = await col('users').updateOne({
      _id: sitterId, roles: 'PET_SITTER', state: 'ACTIVE', synthetic: { $ne: true },
      ...(actor.authEpoch === undefined ? {} : { authEpoch: actor.authEpoch })
    }, { $inc: { workflowGuardVersion: 1 } }, { session });
    if (!user.matchedCount) workflowFail('FORBIDDEN', 'Active employee required', 403);
    const tasks = workflowTasks(snapshot, visit.snapshots?.pets, visit.location);
    const slots = tasks.filter(task => (task.step.phase === 'CHECK_IN') === arriving)
      .flatMap(task => task.step.photoSlots);
    // One base visit evidence photo and one replacement per phase, plus snapshot slots.
    const limit = 2 + slots.reduce((sum, slot) => sum + slot.maxPhotos, 0);
    const field = arriving ? 'evidenceUploadCounts.arrival' : 'evidenceUploadCounts.care';
    const charged = await col('visits').updateOne({
      _id: visit._id, sitterId, state: visit.state, version: visit.version,
      $or: [{ [field]: { $exists: false } }, { [field]: { $lt: limit } }]
    }, { $inc: { [field]: 1 } }, { session });
    if (!charged.modifiedCount) workflowFail('VISIT_MEDIA_QUOTA_EXCEEDED', 'Visit phase image limit reached', 429);
  };
}
