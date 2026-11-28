import { handoverPending } from './visit-handover-policy.service.js';
import { Types } from 'mongoose';
import { workflowTasks } from './workflow-snapshot.service.js';

const ACTIVE_BOOKING_STATES = ['ASSIGNED', 'IN_PROGRESS', 'DISPATCH_PENDING'];
const isCompletedEarlierVisit = visit => visit.state === 'COMPLETED'
  || (visit.state === 'STAFF_CLOSED' && visit.closureVerification?.outcome === 'SERVICE_PERFORMED');

// Legacy media keeps its existing customer scope. Workflow media additionally
// follows immutable task visibility, current assignment and historical uploader.
// A replacement sitter reviewing a pending handover may read customer-visible
// evidence of earlier completed visits in the same booking (Permission Matrix note 19).
export function createVisitEvidenceAccess({ connection }) {
  const col = name => connection.db.collection(name);
  return async ({ actor, image }) => {
    if (actor?.state !== 'ACTIVE' || actor.synthetic || !Types.ObjectId.isValid(actor.userId) || !Types.ObjectId.isValid(image.careVisitId)) return false;
    const workflow = typeof image.careKind === 'string' && image.careKind.startsWith('WF:');
    const canReadLegacyRole = actor.roles?.includes('CUSTOMER') || actor.roles?.includes('PET_SITTER');
    if (!workflow && (!canReadLegacyRole || !['CHECK_IN', 'CHECK_OUT'].includes(image.careKind))) return false;
    const binding = await col('caremediabindings').findOne({ _id: image._id, visitId: image.careVisitId,
      ownerId: String(image.ownerId), kind: image.careKind, contentDigest: image.contentDigest }, { maxTimeMS: 2000 });
    if (!binding) return false;
    const visit = await col('visits').findOne({ _id: new Types.ObjectId(image.careVisitId), ...(workflow ? {} : { evidenceRefs: { $elemMatch: { mediaId: image._id, kind: image.careKind } } }) },
      { projection: { bookingId: 1, sitterId: 1, state: 1, startAt: 1, closureVerification: 1, location: 1, snapshots: 1, workflowResults: 1, handoverRequired: 1, handoverAccepted: 1 }, maxTimeMS: 2000 });
    if (!visit) return false;
    let task;
    if (workflow) {
      const result = visit.workflowResults?.find(row => row.evidence?.some(photo => photo.mediaId === image._id && photo.kind === image.careKind && photo.uploadedBy === String(image.ownerId) && photo.contentDigest === image.contentDigest));
      task = result && workflowTasks(visit.snapshots?.workflow, visit.snapshots?.pets, visit.location).find(row => row.taskKey === result.taskKey);
      if (!task) return false;
    }
    const booking = await col('bookings').findOne({ _id: visit.bookingId, visitIds: visit._id }, { projection: { customerId: 1, state: 1, visitIds: 1 }, maxTimeMS: 2000 });
    if (!booking) return false;
    if (workflow && actor.roles?.some(role => ['ADMIN', 'STAFF'].includes(role))) return true;
    if (workflow && actor.roles?.includes('PET_SITTER') && String(visit.sitterId) === actor.userId && ['ASSIGNED', 'IN_PROGRESS'].includes(visit.state)
      && !handoverPending(visit)) return true;
    if (actor.roles?.includes('CUSTOMER') && String(booking.customerId) === actor.userId && (!workflow || task.step.customerVisible)) return true;
    if (actor.roles?.includes('PET_SITTER') && (!workflow || task.step.customerVisible)
      && isCompletedEarlierVisit(visit) && ACTIVE_BOOKING_STATES.includes(booking.state)
      && visit.startAt instanceof Date && Array.isArray(booking.visitIds)) {
      const pendingHandover = await col('visits').findOne({
        bookingId: visit.bookingId,
        _id: { $in: booking.visitIds, $ne: visit._id },
        sitterId: new Types.ObjectId(actor.userId),
        state: 'ASSIGNED',
        checkInAt: null,
        handoverRequired: true,
        handoverAccepted: { $ne: true },
        startAt: { $gt: visit.startAt }
      }, { projection: { _id: 1 }, maxTimeMS: 2000 });
      if (pendingHandover) return true;
    }
    return false;
  };
}
