import { GROOMING_BLOCKING_APPOINTMENT_STATUSES, GROOMING_RELEASED_PET_STATUS } from '../../constants/grooming.js';
import { fail } from '../../validators/pet-care.validator.js';

const MAX_PET_APPOINTMENTS = 200;

export async function readBusyGroomingAppointments(GroomingAppointment, petIds, slotKeys, session = null) {
  if (!slotKeys.length) return [];
  const rows = await GroomingAppointment.find({
    status: { $in: GROOMING_BLOCKING_APPOINTMENT_STATUSES },
    pets: { $elemMatch: { petId: { $in: petIds }, status: { $ne: GROOMING_RELEASED_PET_STATUS }, slotKeys: { $in: slotKeys } } }
  }).select('pets.petId pets.status pets.slotKeys').limit(MAX_PET_APPOINTMENTS + 1).maxTimeMS(5000).session(session).lean();
  if (rows.length > MAX_PET_APPOINTMENTS) {
    fail('GROOMING_ROSTER_REVIEW_REQUIRED', 'Pet booking history exceeds review budget', 503);
  }
  return rows;
}
