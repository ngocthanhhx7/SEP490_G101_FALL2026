import { Types } from 'mongoose';
import { petCareModels } from '../../models/pet-care.model.js';
import { groomingModels } from '../../models/grooming-appointment.model.js';
import { GROOMING_MIN_LEAD_MINUTES, GROOMING_SLOT_MINUTES } from '../../constants/grooming.js';
import {
  groomingLocalTime, groomingSlotKey, groomingSlotStarts, groomingSlotsNeeded, groomingWindow
} from '../../utils/grooming-slot-time.js';
import { fail } from '../../validators/pet-care.validator.js';

const SLOT_MS = GROOMING_SLOT_MINUTES * 60000;

// Time slots of one day for the pets and services a customer chose (GBR-40, GBR-45).
//  - A slot with no pet sitter on a shop shift is not listed.
//  - A slot with pet sitters but not enough free places for every pet is listed as FULL.
// Each pet takes one place (one pet sitter) in every one-hour slot it needs; its services run one after another,
// and the pets of one appointment are groomed at the same time.
export function createGroomingSlots({ connection, clock = Date.now, shopServices, shiftSource }) {
  const { Pet } = petCareModels(connection);
  const { GroomingSlot } = groomingModels(connection);

  return {
    async list(customerId, input) {
      const now = clock();
      if (!groomingWindow(now).dates.includes(input.date)) fail('VALIDATION_FAILED', 'Date is outside the booking window');
      const ids = input.pets.map(row => new Types.ObjectId(row.petId));
      const owned = await Pet.countDocuments({ _id: { $in: ids }, ownerId: customerId, state: 'ACTIVE' });
      if (owned !== ids.length) fail('RESOURCE_NOT_FOUND', 'Owned pet unavailable', 404);
      const serviceIds = [...new Set(input.pets.flatMap(row => row.serviceIds))];
      const shop = await shopServices.resolve(serviceIds);
      const needed = input.pets.map(row => groomingSlotsNeeded(row.serviceIds.reduce((sum, id) => sum + shop.get(id).durationMinutes, 0)));
      const longest = Math.max(...needed);
      const starts = groomingSlotStarts(input.date);
      const roster = await shiftSource.openRoster({ serviceIds, from: starts[0], to: new Date(starts.at(-1).getTime() + longest * SLOT_MS) });
      const capacity = new Map();
      const capacityAt = slot => {
        const key = slot.getTime();
        if (!capacity.has(key)) capacity.set(key, roster.sittersFor(slot, new Date(key + SLOT_MS)).length);
        return capacity.get(key);
      };
      const first = starts.filter(start => start.getTime() >= now + GROOMING_MIN_LEAD_MINUTES * 60000 && capacityAt(start) > 0);
      const keys = new Set(first.flatMap(start => Array.from({ length: longest }, (_, index) => groomingSlotKey(new Date(start.getTime() + index * SLOT_MS)))));
      const held = new Map((await GroomingSlot.find({ _id: { $in: [...keys] } }).lean()).map(row => [row._id, row.held]));
      const slots = first.map(start => {
        const available = Array.from({ length: longest }, (_, index) => {
          const slot = new Date(start.getTime() + index * SLOT_MS);
          const need = needed.filter(count => count > index).length;
          return capacityAt(slot) - (held.get(groomingSlotKey(slot)) ?? 0) >= need;
        }).every(Boolean);
        return { startAt: start.toISOString(), time: groomingLocalTime(start), state: available ? 'AVAILABLE' : 'FULL' };
      });
      return { date: input.date, slots };
    }
  };
}
