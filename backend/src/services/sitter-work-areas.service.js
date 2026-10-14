import { AppError } from '../utils/app-error.js';
import { hasRole } from '../middlewares/session.js';

export const MAX_SITTER_WORK_AREA_CODES = 20;

const LEVELS = new Set(['CITY', 'DISTRICT']);
const CODE_PATTERN = /^(CITY|DISTRICT)_[A-Z0-9][A-Z0-9_-]{0,55}$/;
const LABEL_PATTERN = /[\p{L}]/u;

function failValidation(message = 'Work-area selection is invalid') {
  return new AppError(422, 'VALIDATION_FAILED', message);
}

function canonicalCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

function normalizeCatalog(rows) {
  if (!Array.isArray(rows)) {
    throw new AppError(503, 'WORK_AREA_CATALOG_UNAVAILABLE', 'Work-area catalog is unavailable');
  }

  const seen = new Set();
  return rows.map(row => {
    const code = canonicalCode(row?.code);
    const level = row?.level;
    const label = typeof row?.label === 'string' ? row.label.trim() : '';
    const matchingPrefix = code?.startsWith(`${level}_`);
    if (!code || !LEVELS.has(level) || !matchingPrefix || !label || label.length > 100
      || !LABEL_PATTERN.test(label) || /[\u0000-\u001f\u007f,;@/\\]/u.test(label)
      || seen.has(code)) {
      throw new AppError(503, 'WORK_AREA_CATALOG_UNAVAILABLE', 'Work-area catalog is unavailable');
    }
    seen.add(code);
    // Project only public city/district codes and labels. Never serialize provider extras.
    return Object.freeze({ code, label, level });
  });
}

function normalizeSelection(values, catalog) {
  if (!Array.isArray(values) || values.length > MAX_SITTER_WORK_AREA_CODES) {
    throw failValidation(`Choose no more than ${MAX_SITTER_WORK_AREA_CODES} work areas`);
  }

  const allowed = new Set(catalog.map(area => area.code));
  const selected = new Set();
  for (const value of values) {
    const code = canonicalCode(value);
    if (!code || !allowed.has(code)) throw failValidation('Choose work areas from the available city and district list');
    selected.add(code);
  }
  return [...selected].sort();
}

function requireSitter(actor) {
  if (!actor || actor.state !== 'ACTIVE' || !Array.isArray(actor.roles)
    || typeof actor.userId !== 'string' || !actor.userId.trim()) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!hasRole(actor.roles, 'PET_SITTER')) {
    throw new AppError(403, 'FORBIDDEN', 'Only a pet sitter can manage personal work areas');
  }
  return actor.userId;
}

function assertVersion(version) {
  if (!Number.isSafeInteger(version) || version < 0) throw failValidation('A valid availability version is required');
}

function persistedSelection(record, catalog) {
  if (!record) return { selectedCodes: [], expectedVersion: 0 };
  if (!Number.isSafeInteger(record.version) || record.version < 0) {
    throw new AppError(503, 'AVAILABILITY_UNAVAILABLE', 'Availability is unavailable');
  }
  try {
    return { selectedCodes: normalizeSelection(record.areas ?? [], catalog), expectedVersion: record.version };
  } catch {
    throw new AppError(503, 'AVAILABILITY_UNAVAILABLE', 'Availability is unavailable');
  }
}

/**
 * Work-area business logic with persistence and catalog ports supplied by the caller.
 * The persistence adapter must re-check actor status/ownership and P16 eligibility,
 * acquire the P01 EligibilityGuard, compare expectedVersion, and deduplicate the
 * actor/operation/availability/idempotency-key tuple in the same transaction. It
 * must detect affected confirmed visits and return CONFIRMED_VISIT_CONFLICT for Staff
 * review without removing assignments. Responses use AvailabilityView.expectedVersion.
 */
export function createSitterWorkAreasService({ listCoverageAreas, getSitterAvailability, replaceSitterAreas }) {
  if (typeof listCoverageAreas !== 'function' || typeof getSitterAvailability !== 'function'
    || typeof replaceSitterAreas !== 'function') {
    throw new TypeError('Work-area catalog and persistence ports are required');
  }

  async function loadCatalog() {
    try {
      return normalizeCatalog(await listCoverageAreas());
    } catch (error) {
      if (error instanceof AppError && error.status === 503) throw error;
      throw new AppError(503, 'WORK_AREA_CATALOG_UNAVAILABLE', 'Work-area catalog is unavailable');
    }
  }

  return Object.freeze({
    async getMine({ actor }) {
      const sitterId = requireSitter(actor);
      const options = await loadCatalog();
      let record;
      try { record = await getSitterAvailability(sitterId); }
      catch { throw new AppError(503, 'AVAILABILITY_UNAVAILABLE', 'Availability is unavailable'); }
      const { selectedCodes, expectedVersion } = persistedSelection(record, options);
      return Object.freeze({ options, selectedCodes, expectedVersion });
    },

    async replaceMine({ actor, areas, expectedVersion, idempotencyKey }) {
      const sitterId = requireSitter(actor);
      assertVersion(expectedVersion);
      if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        throw failValidation('A valid idempotency key is required');
      }
      const options = await loadCatalog();
      const normalizedCodes = normalizeSelection(areas, options);
      let updated;
      try {
        updated = await replaceSitterAreas({
          sitterId, actorRef: actor.userId, authEpoch: actor.authEpoch, areas: normalizedCodes, expectedVersion, idempotencyKey,
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(503, 'AVAILABILITY_UNAVAILABLE', 'Availability could not be saved');
      }
      if (!updated) throw new AppError(409, 'VERSION_CONFLICT', 'Availability changed; reload before saving');
      const persisted = persistedSelection(updated, options);
      if (persisted.expectedVersion <= expectedVersion || persisted.selectedCodes.length !== normalizedCodes.length
        || persisted.selectedCodes.some((code, index) => code !== normalizedCodes[index])) {
        throw new AppError(503, 'AVAILABILITY_UNAVAILABLE', 'Availability could not be confirmed');
      }
      return Object.freeze({ options, ...persisted });
    },
  });
}
