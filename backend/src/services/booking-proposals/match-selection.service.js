import { fail } from '../../validators/pet-care.validator.js';

// A MATCH is an advisory reference; checkout and dispatch retain their own gates.
export async function assertMatchSelection({ DecisionSnapshot, actor, row, selection, pets, address, endAt, at, session }) {
  if (!row.matchId) return;
  const record = await DecisionSnapshot.findOne({ _id: row.matchId, kind: 'MATCH', ownerId: actor.userId, expiresAt: { $gt: at } })
    .select('+snapshot').session(session).lean();
  if (!record) fail('MATCH_EXPIRED', 'Recommendation unavailable or expired; search again', 409);
  const { input, result, petVersions, addressVersion } = record.snapshot;
  const samePets = input.petIds.length === selection.petIds.length && input.petIds.every(value => selection.petIds.includes(String(value)));
  if ((!row.requestedSitterId && row.bookingMode !== 'SYSTEM') || !result.candidates.length ||
    (row.requestedSitterId && !result.candidates.some(value => value.sitterId === row.requestedSitterId)) ||
    String(input.serviceId) !== selection.serviceId || !samePets || row.location !== 'HOME' ||
    String(input.addressId) !== row.addressId || new Date(input.startAt).getTime() !== row.startAt.getTime() ||
    new Date(input.endAt).getTime() !== endAt.getTime() || address?.version !== addressVersion ||
    pets.some(pet => !petVersions.some(value => String(value.id) === String(pet._id) && value.version === pet.version)))
    fail('MATCH_CHANGED', 'Recommendation does not match the confirmed service, care or schedule', 409);
  if (input.clinicAddressId || input.dayCount) fail('MATCH_SCOPE_REVIEW_REQUIRED', 'Specialized care plan requires Staff review', 409);
  return result.candidates.map(value => value.sitterId);
}
