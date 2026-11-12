import { Types } from 'mongoose';

// Grants a customer access only to immutable evidence bound to their own booked visit.
// Unbound uploads, applicant documents and other customers' bookings remain private.
export function createVisitEvidenceAccess({ connection }) {
  const col = name => connection.db.collection(name);
  return async ({ actor, image }) => {
    if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('CUSTOMER') || !Types.ObjectId.isValid(actor.userId)
      || !Types.ObjectId.isValid(image.careVisitId) || !['CHECK_IN', 'CHECK_OUT'].includes(image.careKind)) return false;
    const binding = await col('caremediabindings').findOne({ _id: image._id, visitId: image.careVisitId,
      ownerId: String(image.ownerId), kind: image.careKind, contentDigest: image.contentDigest }, { maxTimeMS: 2000 });
    if (!binding) return false;
    const visit = await col('visits').findOne({ _id: new Types.ObjectId(image.careVisitId), sitterId: image.ownerId,
      evidenceRefs: { $elemMatch: { mediaId: image._id, kind: image.careKind } } }, { projection: { bookingId: 1 }, maxTimeMS: 2000 });
    if (!visit) return false;
    return Boolean(await col('bookings').findOne({ _id: visit.bookingId, customerId: new Types.ObjectId(actor.userId), visitIds: visit._id },
      { projection: { _id: 1 }, maxTimeMS: 2000 }));
  };
}
