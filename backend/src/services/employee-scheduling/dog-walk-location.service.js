const checkoutGraceMs = 2 * 60 * 60 * 1000;
export const TRAVEL_BOOKING_STATES = ['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'];
export const dogWalkLocationId = visitId => 'dog-walk:' + visitId;
export const dogWalkLocationExpiresAt = visit => new Date(+visit.endAt + checkoutGraceMs);

export function isDogWalkWindowOpen(visit, now) {
  return visit.state === 'IN_PROGRESS' && visit.sitterId && visit.checkInAt instanceof Date
    && !visit.checkOutAt && +visit.checkInAt <= now && now < +dogWalkLocationExpiresAt(visit);
}

export async function isDogWalkService(col, visit, session) {
  if (!visit.serviceId) return false;
  return Boolean(await col('services').findOne({ _id: visit.serviceId, code: 'dog-walking' },
    { session, projection: { _id: 1 }, maxTimeMS: 2000 }));
}

export function clearDogWalkLocation(connection, visitId, session) {
  return connection.db.collection('employeevisittravels').deleteOne({ _id: dogWalkLocationId(visitId) }, { session });
}
