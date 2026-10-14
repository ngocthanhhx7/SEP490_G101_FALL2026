import { AppError } from '../utils/app-error.js';

const CUSTOMER_ROLE = 'CUSTOMER';
const VALID_ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);
const PET_SPECIES = new Set(['DOG', 'CAT']);
const PET_STATES = new Set(['ACTIVE', 'ARCHIVED']);
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const PET_VIEW_SELECT = '_id name species state version createdAt updatedAt';
const PET_CREATE_FIELDS = new Set(['name', 'species']);
const IDEMPOTENCY_KEY_MAX_LENGTH = 256;

function validationError(fieldErrors) {
  return new AppError(422, 'VALIDATION_FAILED', 'Pet request is invalid', { fieldErrors });
}

function normalizeIdempotencyKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw validationError({ idempotencyKey: 'Idempotency key is invalid' });
  }
  return value.trim();
}

function canonicalFingerprint(value) {
  return JSON.stringify(value);
}

function commandUnavailable() {
  throw new AppError(503, 'IDEMPOTENCY_UNAVAILABLE', 'Command replay is not configured');
}

function assertActiveCustomer(actor) {
  if (actor?.state !== 'ACTIVE' || typeof actor.userId !== 'string'
    || !OBJECT_ID_PATTERN.test(actor.userId)
    || !Array.isArray(actor.roles) || actor.roles.length === 0
    || actor.roles.some(role => !VALID_ROLES.has(role))) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!actor.roles.includes(CUSTOMER_ROLE)) {
    throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
  }
  return actor.userId;
}

function parseLimit(value) {
  if (value === undefined || value === null) return DEFAULT_LIMIT;
  const limit = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw validationError({ limit: 'Limit must be a positive integer' });
  }
  return Math.min(limit, MAX_LIMIT);
}

function parseCursor(cursor) {
  if (cursor === undefined || cursor === null) return null;
  if (typeof cursor !== 'string' || !cursor || cursor.length > 256
    || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw validationError({ cursor: 'Cursor is invalid' });
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw validationError({ cursor: 'Cursor is invalid' });
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)
    || Object.keys(decoded).sort().join(',') !== 'createdAt,id'
    || typeof decoded.createdAt !== 'string' || !OBJECT_ID_PATTERN.test(decoded.id)) {
    throw validationError({ cursor: 'Cursor is invalid' });
  }
  const createdAt = new Date(decoded.createdAt);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== decoded.createdAt) {
    throw validationError({ cursor: 'Cursor is invalid' });
  }
  return { createdAt, id: decoded.id };
}

function idString(pet) {
  const id = pet?._id ?? pet?.id;
  if (typeof id === 'string') return id;
  if (id && typeof id.toString === 'function') return id.toString();
  return '';
}

function isoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Pet record is invalid');
  }
  return date.toISOString();
}

function toCustomerPetView(pet) {
  const id = idString(pet);
  if (!OBJECT_ID_PATTERN.test(id) || typeof pet?.name !== 'string'
    || !PET_SPECIES.has(pet.species) || !PET_STATES.has(pet.state)
    || !Number.isSafeInteger(pet.version) || pet.version < 0) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Pet record is invalid');
  }

  return Object.freeze({
    id,
    name: pet.name,
    species: pet.species,
    state: pet.state,
    version: pet.version,
    createdAt: isoTimestamp(pet.createdAt),
    updatedAt: isoTimestamp(pet.updatedAt),
  });
}

function encodeCursor(pet) {
  return Buffer.from(JSON.stringify({
    createdAt: isoTimestamp(pet.createdAt),
    id: idString(pet),
  })).toString('base64url');
}

function runLean(query) {
  return query && typeof query.lean === 'function' ? query.lean() : query;
}

export function createPetListService({ Pet, idempotencyStore } = {}) {
  if (typeof Pet?.find !== 'function' || typeof Pet?.create !== 'function'
    || typeof Pet?.findOne !== 'function' || typeof Pet?.findOneAndUpdate !== 'function') {
    throw new TypeError('A Pet model with find, create, findOne and findOneAndUpdate is required');
  }

  async function list({ actor, limit, cursor } = {}) {
    const ownerId = assertActiveCustomer(actor);
    const pageSize = parseLimit(limit);
    const pageCursor = parseCursor(cursor);
    const filter = { ownerId, state: 'ACTIVE' };
    if (pageCursor) {
      filter.$or = [
        { createdAt: { $lt: pageCursor.createdAt } },
        { createdAt: pageCursor.createdAt, _id: { $lt: pageCursor.id } },
      ];
    }

    let query = Pet.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(pageSize + 1);
    if (typeof query.select === 'function') query = query.select(PET_VIEW_SELECT);
    const rows = await runLean(query);
    const hasNextPage = rows.length > pageSize;
    const pageRows = hasNextPage ? rows.slice(0, pageSize) : rows;
    return Object.freeze({
      items: Object.freeze(pageRows.map(toCustomerPetView)),
      nextCursor: hasNextPage ? encodeCursor(pageRows[pageRows.length - 1]) : null,
    });
  }

  async function create({ actor, body, idempotencyKey: suppliedKey } = {}) {
    const ownerId = assertActiveCustomer(actor);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw validationError({ body: 'Pet details are required' });
    }
    const unknownFields = Object.keys(body).filter(field => !PET_CREATE_FIELDS.has(field));
    if (unknownFields.length > 0) {
      throw validationError({ body: 'Pet details contain unsupported fields' });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 100) {
      throw validationError({ name: 'Name must contain 1 to 100 characters' });
    }
    if (!PET_SPECIES.has(body.species)) {
      throw validationError({ species: 'Species must be DOG or CAT' });
    }
    const idempotencyKey = normalizeIdempotencyKey(suppliedKey);
    const execute = async () => {
      const pet = await Pet.create({
        ownerId,
        name,
        species: body.species,
        state: 'ACTIVE',
        version: 0,
      });
      return toCustomerPetView(pet);
    };
    if (typeof idempotencyStore?.execute !== 'function') return commandUnavailable();
    return idempotencyStore.execute({
      actorId: ownerId,
      operation: 'PET_CREATE',
      resourceId: 'collection',
      key: idempotencyKey,
      fingerprint: canonicalFingerprint({ name, species: body.species }),
      handler: execute,
    });
  }

  async function archive({ actor, petId, expectedVersion, idempotencyKey: suppliedKey } = {}) {
    const ownerId = assertActiveCustomer(actor);
    if (typeof petId !== 'string' || !OBJECT_ID_PATTERN.test(petId)) {
      throw validationError({ petId: 'Pet ID is invalid' });
    }
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      throw validationError({ expectedVersion: 'Expected version is invalid' });
    }

    const idempotencyKey = normalizeIdempotencyKey(suppliedKey);
    const execute = async () => {
      let query = Pet.findOneAndUpdate(
        { _id: petId, ownerId, state: 'ACTIVE', version: expectedVersion },
        { $set: { state: 'ARCHIVED' }, $inc: { version: 1 } },
        { returnDocument: 'after', runValidators: true },
      );
      if (typeof query.select === 'function') query = query.select(PET_VIEW_SELECT);
      const archived = await runLean(query);
      if (archived) return toCustomerPetView(archived);

      let currentQuery = Pet.findOne({ _id: petId, ownerId });
      if (typeof currentQuery.select === 'function') currentQuery = currentQuery.select('_id state version');
      const current = await runLean(currentQuery);
      if (!current) {
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Pet not found');
      }
      if (current.version !== expectedVersion) {
        throw new AppError(409, 'VERSION_CONFLICT', 'Pet changed before the archive request');
      }
      throw new AppError(409, 'INVALID_STATE', 'Only an active pet can be archived');
    };
    if (typeof idempotencyStore?.execute !== 'function') return commandUnavailable();
    return idempotencyStore.execute({
      actorId: ownerId,
      operation: 'PET_ARCHIVE',
      resourceId: petId,
      key: idempotencyKey,
      fingerprint: canonicalFingerprint({ petId, expectedVersion }),
      handler: execute,
    });
  }

  return Object.freeze({ list, create, archive });
}
