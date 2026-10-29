import { AppError } from '../../utils/app-error.js';
import { MAX_DISPATCH_CANDIDATES, normalizeDispatchRequest } from '../dispatch.service.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const unavailable = () => { throw new AppError(503, 'DISPATCH_UNAVAILABLE', 'Sitter candidates are unavailable'); };

/** Internal read port, composed only after authorization by the calling service.
 * No eligibility cache: every suggestion reads fresh schedule/day-off/occupancy facts.
 */
export function createCandidateBatchReader({ listProfiles, readAvailabilityBatch,
  candidateLimit = MAX_DISPATCH_CANDIDATES } = {}) {
  if (typeof listProfiles !== 'function' || typeof readAvailabilityBatch !== 'function'
    || !Number.isSafeInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > MAX_DISPATCH_CANDIDATES) {
    throw new TypeError('Bounded profile and batch availability ports are required');
  }

  return async function listCandidates({ request, signal } = {}) {
    const context = normalizeDispatchRequest(request);
    try {
      signal?.throwIfAborted();
      // The profile adapter must apply service/area/requested-sitter predicates,
      // stable ordering, projection, lean(), and limit BEFORE materializing rows.
      const profiles = await listProfiles({ request: context, limit: candidateLimit, signal });
      if (!Array.isArray(profiles) || profiles.length > candidateLimit) unavailable();
      const ids = new Set();
      for (const profile of profiles) {
        if (!profile || typeof profile.sitterId !== 'string' || !ID.test(profile.sitterId)
          || ids.has(profile.sitterId)) unavailable();
        ids.add(profile.sitterId);
      }
      if (!profiles.length) return [];
      signal?.throwIfAborted();
      // One bounded call, never one call per sitter. Adapter checks working hours,
      // approved leave, half-open overlap and configured travel buffers together.
      const snapshots = await readAvailabilityBatch({ request: context, sitterIds: [...ids], signal });
      signal?.throwIfAborted();
      if (!Array.isArray(snapshots) || snapshots.length > ids.size) unavailable();
      const facts = new Map();
      for (const snapshot of snapshots) {
        if (!snapshot || !ids.has(snapshot.sitterId) || facts.has(snapshot.sitterId)
          || ['available', 'isDayOff', 'hasConflict'].some(key => typeof snapshot[key] !== 'boolean')) unavailable();
        facts.set(snapshot.sitterId, snapshot);
      }
      // Whitelist fields and erase any stale eligibility booleans in profiles.
      // Missing snapshots fail closed in evaluateCandidate, rather than implying free.
      return profiles.map(profile => {
        const snapshot = facts.get(profile.sitterId);
        return {
          sitterId: profile.sitterId, approved: profile.approved, active: profile.active,
          userState: profile.userState, services: profile.services, workAreas: profile.workAreas,
          distanceKm: profile.distanceKm, rating: profile.rating, ratingCount: profile.ratingCount,
          activeWorkload: profile.activeWorkload,
          available: snapshot?.available, isDayOff: snapshot?.isDayOff,
          hasConflict: snapshot?.hasConflict, slotMatch: snapshot?.slotMatch === true
        };
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      unavailable();
    }
  };
}
