import { AppError } from '../utils/app-error.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function fail(status, code, message) { throw new AppError(status, code, message); }

function sitterId(actor) {
  if (actor?.state !== 'ACTIVE' || typeof actor.userId !== 'string' || !ID.test(actor.userId)) {
    fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!Array.isArray(actor.roles) || !actor.roles.includes('PET_SITTER')) {
    fail(403, 'FORBIDDEN', 'Pet sitter access is required');
  }
  return actor.userId;
}

function id(value, field) {
  if (typeof value !== 'string' || !ID.test(value)) fail(422, 'VALIDATION_FAILED', `${field} is invalid`);
  return value;
}

function instant(value, field) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) fail(503, 'VISIT_DATA_UNAVAILABLE', `${field} is invalid`);
  return parsed.toISOString();
}

function text(value, field, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) {
    fail(503, 'VISIT_DATA_UNAVAILABLE', `${field} is invalid`);
  }
  return value.trim();
}

function pets(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > 10) fail(503, 'VISIT_DATA_UNAVAILABLE', 'Pet list is too large');
  return Object.freeze(value.map((pet, index) => Object.freeze({
    id: id(String(pet.id ?? `pet-${index + 1}`), 'pet id'),
    name: text(pet.name ?? 'Thú cưng', 'pet name', 80),
    species: text(pet.species ?? 'UNKNOWN', 'pet species', 40)
  })));
}

function safeDetail(record, visitId, currentSitterId) {
  if (!record || (record.visitId ?? record.id) !== visitId || record.sitterId !== currentSitterId) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
  }
  const state = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'WITHDRAWN', 'CANCELLED'].includes(record.state)
    ? record.state : null;
  if (!state) fail(503, 'VISIT_DATA_UNAVAILABLE', 'Visit state is invalid');
  return Object.freeze({
    visitId,
    version: Number.isSafeInteger(record.version) && record.version >= 0 ? record.version : fail(503, 'VISIT_DATA_UNAVAILABLE', 'Visit version is invalid'),
    state,
    startAt: instant(record.startAt, 'startAt'),
    endAt: instant(record.endAt, 'endAt'),
    serviceName: text(record.serviceName, 'serviceName'),
    areaCode: text(record.areaCode, 'areaCode', 80),
    pets: pets(record.pets ?? record.petSummary),
    handoverRequired: record.handoverRequired === true,
    handoverAccepted: record.handoverAccepted === true,
    canCheckIn: state === 'ASSIGNED' && (record.checkInAt === null || record.checkInAt === undefined),
    canCheckOut: state === 'IN_PROGRESS' && (record.checkOutAt === null || record.checkOutAt === undefined)
    // Never include address, privateAccessNotes, customer contact or payment fields.
  });
}

function requireRepository(repository) {
  if (typeof repository?.findVisitForSitter !== 'function') {
    throw new TypeError('Sitter visit repository ports are required');
  }
}

/** Pet sitter visit detail projection. Private access notes use the P13 service. */
export function createSitterVisitService({ repository } = {}) {
  requireRepository(repository);

  async function detail(actor, visitId) {
    const currentSitterId = sitterId(actor);
    const idValue = id(visitId, 'visitId');
    const record = await repository.findVisitForSitter({ visitId: idValue, sitterId: currentSitterId });
    return safeDetail(record, idValue, currentSitterId);
  }

  return Object.freeze({ detail });
}
