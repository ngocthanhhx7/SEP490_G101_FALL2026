import { Types } from 'mongoose';
import { groomingModels } from '../../models/grooming-appointment.model.js';
import { petCareModels } from '../../models/pet-care.model.js';
import {
  GROOMING_BLOCKING_APPOINTMENT_STATUSES, GROOMING_MIN_LEAD_MINUTES, GROOMING_RELEASED_PET_STATUS
} from '../../constants/grooming.js';
import {
  groomingCoveredSlots, groomingLocalTime, groomingSlotKey, groomingSlotStarts, groomingWindow
} from '../../utils/grooming-slot-time.js';
import { fail } from '../../validators/pet-care.validator.js';
import { reserveGroomingEmployees } from './grooming-reservation.service.js';

export function createGroomingSlots({ connection, clock = Date.now, shopServices, shiftSource }) {
  const { Pet } = petCareModels(connection);
  const { GroomingAppointment } = groomingModels(connection);
  return { async list(customerId, input) {
    const now = clock();
    if (!groomingWindow(now).dates.includes(input.date)) fail('VALIDATION_FAILED', 'Date is outside the booking window');
    const petObjectIds = input.pets.map(row => new Types.ObjectId(row.petId));
    const owned = await Pet.find({ _id: { $in: petObjectIds }, ownerId: customerId, state: 'ACTIVE' }).lean();
    if (owned.length !== input.pets.length) fail('RESOURCE_NOT_FOUND', 'Owned pet unavailable', 404);
    const serviceIds = [...new Set(input.pets.flatMap(row => row.serviceIds))], shop = await shopServices.resolve(serviceIds);
    const pets = input.pets.map(row => ({ petId: row.petId, petSnapshot: owned.find(pet => String(pet._id) === row.petId),
      services: row.serviceIds.map(serviceId => ({ serviceId })), durationMinutes: row.serviceIds.reduce((sum, id) => sum + shop.get(id).durationMinutes, 0) }));
    const starts = groomingSlotStarts(input.date), longest = Math.max(...pets.map(pet => pet.durationMinutes));
    const roster = await shiftSource.openRoster({ serviceIds: [], from: starts[0], to: new Date(+starts.at(-1) + longest * 60000) });
    const eligibleStarts = starts.filter(start => +start >= now + GROOMING_MIN_LEAD_MINUTES * 60000
      && pets.every(pet => roster.sittersFor(start, new Date(+start + 60 * 60000), {
        serviceIds: pet.services.map(row => row.serviceId), pet: pet.petSnapshot, ignoreReservations: true
      }).length));
    const allSlotKeys = [...new Set(eligibleStarts.flatMap(start =>
      pets.flatMap(pet => groomingCoveredSlots(start, pet.durationMinutes).map(groomingSlotKey))
    ))];
    const busyAppointments = allSlotKeys.length
      ? await GroomingAppointment.find({
        status: { $in: GROOMING_BLOCKING_APPOINTMENT_STATUSES },
        pets: { $elemMatch: { petId: { $in: petObjectIds }, status: { $ne: GROOMING_RELEASED_PET_STATUS }, slotKeys: { $in: allSlotKeys } } }
      }).select('pets.petId pets.status pets.slotKeys').limit(201).maxTimeMS(5000).lean()
      : [];
    const bookedKeysByPet = new Map();
    for (const doc of busyAppointments) {
      for (const row of doc.pets ?? []) {
        if (row.status === GROOMING_RELEASED_PET_STATUS) continue;
        const id = String(row.petId);
        const set = bookedKeysByPet.get(id) ?? new Set();
        for (const key of row.slotKeys ?? []) set.add(key);
        bookedKeysByPet.set(id, set);
      }
    }
    const slots = eligibleStarts.map(start => {
      const conflictPet = pets.find(pet => {
        const booked = bookedKeysByPet.get(pet.petId);
        if (!booked?.size) return false;
        return groomingCoveredSlots(start, pet.durationMinutes).some(slot => booked.has(groomingSlotKey(slot)));
      });
      if (conflictPet) {
        return {
          startAt: start.toISOString(),
          time: groomingLocalTime(start),
          state: 'PET_ALREADY_BOOKED',
          conflictPetName: conflictPet.petSnapshot.name
        };
      }
      return {
        startAt: start.toISOString(),
        time: groomingLocalTime(start),
        state: reserveGroomingEmployees(roster, pets, start) ? 'AVAILABLE' : 'FULL'
      };
    });
    return { date: input.date, slots };
  } };
}
