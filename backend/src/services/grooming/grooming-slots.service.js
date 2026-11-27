import { Types } from 'mongoose';
import { petCareModels } from '../../models/pet-care.model.js';
import { GROOMING_MIN_LEAD_MINUTES } from '../../constants/grooming.js';
import { groomingLocalTime, groomingSlotStarts, groomingWindow } from '../../utils/grooming-slot-time.js';
import { fail } from '../../validators/pet-care.validator.js';
import { reserveGroomingEmployees } from './grooming-reservation.service.js';

export function createGroomingSlots({ connection, clock = Date.now, shopServices, shiftSource }) {
  const { Pet } = petCareModels(connection);
  return { async list(customerId, input, { counter = false } = {}) {
    const now = clock();
    const targetDay = new Date(input.date + 'T00:00:00+07:00').getTime();
    if (counter ? (!Number.isFinite(targetDay) || targetDay < new Date(groomingWindow(now).firstDate + 'T00:00:00+07:00').getTime()
      || targetDay > now + 30 * 86400000) : !groomingWindow(now).dates.includes(input.date))
      fail('VALIDATION_FAILED', 'Date is outside the booking window');
    const owned = await Pet.find({ _id: { $in: input.pets.map(row => new Types.ObjectId(row.petId)) }, ownerId: customerId, state: 'ACTIVE' }).lean();
    if (owned.length !== input.pets.length) fail('RESOURCE_NOT_FOUND', 'Owned pet unavailable', 404);
    const serviceIds = [...new Set(input.pets.flatMap(row => row.serviceIds))], shop = await shopServices.resolve(serviceIds);
    const pets = input.pets.map(row => ({ petId: row.petId, petSnapshot: owned.find(pet => String(pet._id) === row.petId),
      services: row.serviceIds.map(serviceId => ({ serviceId })), durationMinutes: row.serviceIds.reduce((sum, id) => sum + shop.get(id).durationMinutes, 0) }));
    const starts = groomingSlotStarts(input.date), longest = Math.max(...pets.map(pet => pet.durationMinutes));
    const roster = await shiftSource.openRoster({ serviceIds: [], from: starts[0], to: new Date(+starts.at(-1) + longest * 60000) });
    const slots = starts.filter(start => +start >= now + (counter ? 120 : GROOMING_MIN_LEAD_MINUTES) * 60000
      && pets.every(pet => roster.sittersFor(start, new Date(+start + 60 * 60000), {
        serviceIds: pet.services.map(row => row.serviceId), pet: pet.petSnapshot, ignoreReservations: true
      }).length)).map(start => ({
      startAt: start.toISOString(), time: groomingLocalTime(start), state: reserveGroomingEmployees(roster, pets, start) ? 'AVAILABLE' : 'FULL'
    }));
    return { date: input.date, slots };
  } };
}
