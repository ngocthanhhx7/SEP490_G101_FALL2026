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
  const reference = { candidateIds: result.candidates.map(value => value.sitterId) };
  // Persist only actual decision-time values. Legacy decisions cannot be backfilled
  // from today's statistics after their original MATCH cache has expired.
  const keys = ['fit', 'travel', 'quality', 'reliability', 'workload'];
  if (result.featureVersion === 'PWC_MATCH_FEATURES_V1' && Number.isFinite(Date.parse(result.capturedAt)) && Date.parse(result.capturedAt) <= at.getTime()) {
    const candidates = result.candidates.map(candidate => ({ sitterId: candidate.sitterId,
      features: Object.fromEntries((candidate.breakdown ?? []).map(line => [line.key, line.normalized])) }));
    if (candidates.every(candidate => Object.keys(candidate.features).length === keys.length && keys.every(key =>
      Number.isFinite(candidate.features[key]) && candidate.features[key] >= 0 && candidate.features[key] <= 1)))
      reference.featureSnapshot = { version: result.featureVersion, decisionAt: result.capturedAt, slotStartAt: input.startAt, slotEndAt: input.endAt,
        featuresAsOf: Object.fromEntries(keys.map(key => [key, result.capturedAt])), candidates,
        policyVersion: result.policyVersion, modelVersion: result.modelVersion ?? null };
  }
  return reference;
}
