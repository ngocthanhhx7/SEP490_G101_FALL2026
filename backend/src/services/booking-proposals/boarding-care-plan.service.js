import { fail } from '../../validators/pet-care.validator.js';

export function boardingCarePlan(booking, shiftMinutes) {
  const shifts = [];
  for (const visit of booking.checkoutSnapshot.customerVisits) {
    const minutes = (new Date(visit.endAt) - new Date(visit.startAt)) / 60000;
    if (!Number.isSafeInteger(minutes) || minutes < 1 || (!visit.snapshots.boarding && minutes > 480))
      fail('CARE_PLAN_REVIEW_REQUIRED', 'Service duration requires operational review', 409);
    const count = visit.snapshots.boarding ? Math.ceil(minutes / shiftMinutes) : 1;
    const chunks = Array.from({ length: count }, (_, index) => Math.min(shiftMinutes, minutes - index * shiftMinutes));
    if (!visit.snapshots.boarding) chunks[0] = minutes;
    const amounts = chunks.map((duration, index) => ({ index, amount: BigInt(visit.snapshots.employeeServiceNetVnd) * BigInt(duration) / BigInt(minutes),
      remainder: BigInt(visit.snapshots.employeeServiceNetVnd) * BigInt(duration) % BigInt(minutes) }));
    let remaining = BigInt(visit.snapshots.employeeServiceNetVnd) - amounts.reduce((sum, row) => sum + row.amount, 0n);
    for (const row of [...amounts].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
      if (!remaining) break; row.amount++; remaining--;
    }
    let start = new Date(visit.startAt);
    for (const [index, duration] of chunks.entries()) {
      const end = new Date(start.getTime() + duration * 60000);
      shifts.push({ sequence: shifts.length, customerVisitId: String(visit._id), serviceId: visit.serviceId, petIds: visit.petIds,
        location: visit.location, areaCode: visit.areaCode, requestedSitterId: visit.requestedSitterId,
        bookingMode: visit.bookingMode,
        ...(visit.recommendationRef ? { recommendationRef: visit.recommendationRef } : {}),
        ...(visit.addressId ? { addressId: visit.addressId } : {}), startAt: start, endAt: end, snapshots: { ...visit.snapshots,
          employeeServiceNetVnd: Number(amounts[index].amount), careMinutes: duration, allocationVersion: 'PWC-BOARDING-SHIFT-2026-10-30-v1' } });
      start = end;
    }
  }
  if (shifts.length > 60) fail('CARE_PLAN_REVIEW_REQUIRED', 'Split bookings that exceed sixty care shifts', 409);
  return shifts;
}
