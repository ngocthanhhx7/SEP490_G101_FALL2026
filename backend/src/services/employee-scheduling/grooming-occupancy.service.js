import { Types } from 'mongoose';
import { fail } from '../../validators/pet-care.validator.js';

// Native reads do not register/provision optional Grooming models when disabled.
export async function groomingOccupancy({ connection, sitterIds, from, to, session }) {
  const selected = new Set(sitterIds.map(String));
  const rows = await connection.db.collection('groomingappointments').find({
    status: { $in: ['BOOKED', 'CHECKED_IN'] }, 'slot.endAt': { $gt: from }, ...(to ? { 'slot.startAt': { $lt: to } } : {}),
    pets: { $elemMatch: { reservedSitterId: { $in: sitterIds.map(id => new Types.ObjectId(String(id))) }, status: { $ne: 'CANCELLED_NO_CHARGE' } } }
  }, { session, projection: { slot: 1, 'shop.address': 1, 'pets._id': 1, 'pets.reservedSitterId': 1, 'pets.status': 1,
    'pets.durationMinutes': 1, 'pets.petSnapshot': 1, 'pets.services.serviceId': 1 }, maxTimeMS: 5000 }).limit(201).toArray();
  if (rows.length > 200) fail('SHIFT_REVIEW_REQUIRED', 'Shop occupancy exceeds schedule review budget', 409);
  return rows.flatMap(row => row.pets.filter(pet => pet.reservedSitterId && pet.status !== 'CANCELLED_NO_CHARGE'
    && selected.has(String(pet.reservedSitterId))).map(pet => ({ _id: pet._id, groomingAppointmentId: row._id,
    sitterId: pet.reservedSitterId, workLocation: 'SHOP', state: 'ASSIGNED', startAt: row.slot.startAt,
    endAt: new Date(+row.slot.startAt + pet.durationMinutes * 60000),
    snapshots: { serviceAddress: row.shop?.address, pets: [pet.petSnapshot], serviceIds: pet.services?.map(row => String(row.serviceId)) ?? [] } })))
    .filter(row => row.endAt > from && (!to || row.startAt < to));
}
