import { AppError } from '../../utils/app-error.js';

// Each simultaneously groomed pet needs a distinct eligible employee for its
// entire duration. Per-slot head counts cannot establish this matching.
export function reserveGroomingEmployees(roster, pets, startAt) {
  const choices = pets.map(pet => roster.sittersFor(startAt, new Date(+startAt + pet.durationMinutes * 60000), {
    serviceIds: pet.services.map(row => String(row.serviceId)), pet: pet.petSnapshot
  }));
  const assigned = new Map(), chosen = new Map();
  function match(index, seen) {
    for (const sitter of choices[index]) {
      if (seen.has(sitter)) continue;
      seen.add(sitter);
      if (!assigned.has(sitter) || match(assigned.get(sitter), seen)) {
        assigned.set(sitter, index); chosen.set(index, sitter); return true;
      }
    }
    return false;
  }
  for (const index of pets.map((_, i) => i).sort((a, b) => choices[a].length - choices[b].length))
    if (!match(index, new Set())) return null;
  return pets.map((_, index) => chosen.get(index));
}

export function assertGroomingReservations(roster, pets, startAt) {
  const result = reserveGroomingEmployees(roster, pets, startAt);
  if (!result) throw new AppError(409, 'GROOMING_SLOT_TAKEN', 'No distinct qualified shop employees are available', { startAt: startAt.toISOString() });
  return result;
}
