import { AppError } from '../utils/app-error.js';

const ADDRESS_ID = /^[a-f\d]{24}$/i;
const ADDRESS_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const ACCESS_LEAD_MS = 60 * 60 * 1000;
const CUSTOMER_FIELDS = new Set(['label', 'location', 'privateAccessNotes', 'isDefault']);
const UPDATE_FIELDS = new Set([...CUSTOMER_FIELDS, 'expectedVersion', 'confirmOpenBookingImpact']);

function requireActor(actor, role) {
  if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles)
    || typeof actor.userId !== 'string' || !ADDRESS_ID.test(actor.userId)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!actor.roles.includes(role)) throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
  return actor.userId;
}

function requireId(value, field = 'addressId') {
  if (typeof value !== 'string' || !ADDRESS_ID.test(value)) {
    throw new AppError(422, 'VALIDATION_FAILED', `${field} is invalid`);
  }
  return value;
}

function requireIdempotencyKey(value) {
  if (typeof value !== 'string' || !ADDRESS_IDEMPOTENCY_KEY.test(value)) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Idempotency key is required');
  }
  return value;
}

function requireVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Address version is required');
  }
  return value;
}

function requireOnlyKeys(input, allowed, required = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !allowed.has(key))
    || required.some(key => !Object.hasOwn(input, key))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Address command is invalid');
  }
}

function normalizeSingleLine(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').replace(/[\s\u00a0]+/gu, ' ').trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
  return normalized;
}

export function normalizeServiceLocation(value) {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return null;
  const lines = value.normalize('NFC').replace(/\r\n?/gu, '\n').split('\n')
    .map(line => line.replace(/[\t\u00a0 ]+/gu, ' ').trim()).filter(Boolean);
  const location = lines.join('\n');
  if (!location || location.length > 500) return null;
  return location;
}

export function normalizePrivateAccessNotes(value = '') {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return null;
  const lines = value.normalize('NFC').replace(/\r\n?/gu, '\n').split('\n')
    .map(line => line.replace(/[\t\u00a0 ]+/gu, ' ').trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines.at(-1)) lines.pop();
  const notes = lines.join('\n');
  if (notes.length > 1000) return null;
  return notes;
}

function normalizeCreate(input) {
  requireOnlyKeys(input, CUSTOMER_FIELDS, ['label', 'location']);
  if (input.isDefault !== undefined && typeof input.isDefault !== 'boolean') {
    throw new AppError(422, 'VALIDATION_FAILED', 'Address command is invalid');
  }
  const label = normalizeSingleLine(input.label, 60);
  const location = normalizeServiceLocation(input.location);
  const privateAccessNotes = normalizePrivateAccessNotes(input.privateAccessNotes);
  if (!label || !location || privateAccessNotes === null) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Address command is invalid');
  }
  return { label, location, privateAccessNotes, isDefault: input.isDefault === true };
}

function normalizeUpdate(input) {
  requireOnlyKeys(input, UPDATE_FIELDS, ['expectedVersion']);
  const expectedVersion = requireVersion(input.expectedVersion);
  if (input.confirmOpenBookingImpact !== undefined && typeof input.confirmOpenBookingImpact !== 'boolean') {
    throw new AppError(422, 'VALIDATION_FAILED', 'Address command is invalid');
  }
  if (!['label', 'location', 'privateAccessNotes', 'isDefault'].some(key => Object.hasOwn(input, key))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Address command is invalid');
  }
  const changes = {};
  if (Object.hasOwn(input, 'label')) {
    changes.label = normalizeSingleLine(input.label, 60);
    if (!changes.label) throw new AppError(422, 'VALIDATION_FAILED', 'Address command is invalid');
  }
  if (Object.hasOwn(input, 'location')) {
    changes.location = normalizeServiceLocation(input.location);
    if (!changes.location) throw new AppError(422, 'VALIDATION_FAILED', 'Address command is invalid');
  }
  if (Object.hasOwn(input, 'privateAccessNotes')) {
    changes.privateAccessNotes = normalizePrivateAccessNotes(input.privateAccessNotes);
    if (changes.privateAccessNotes === null) throw new AppError(422, 'VALIDATION_FAILED', 'Address command is invalid');
  }
  if (Object.hasOwn(input, 'isDefault')) {
    if (typeof input.isDefault !== 'boolean') throw new AppError(422, 'VALIDATION_FAILED', 'Address command is invalid');
    changes.isDefault = input.isDefault;
  }
  return {
    expectedVersion,
    confirmOpenBookingImpact: input.confirmOpenBookingImpact === true,
    changes
  };
}

function normalizeArchive(input) {
  requireOnlyKeys(input, new Set(['expectedVersion', 'confirmOpenBookingImpact']), ['expectedVersion']);
  if (input.confirmOpenBookingImpact !== undefined && typeof input.confirmOpenBookingImpact !== 'boolean') {
    throw new AppError(422, 'VALIDATION_FAILED', 'Address command is invalid');
  }
  return { expectedVersion: requireVersion(input.expectedVersion), confirmOpenBookingImpact: input.confirmOpenBookingImpact === true };
}

function addressView(address) {
  return Object.freeze({
    id: address._id?.toString?.() ?? address.id,
    label: address.label,
    location: address.location,
    privateAccessNotes: address.privateAccessNotes ?? '',
    isDefault: address.isDefault === true,
    state: address.state,
    version: address.version,
    createdAt: new Date(address.createdAt).toISOString(),
    updatedAt: new Date(address.updatedAt).toISOString()
  });
}

function requireRepository(repository) {
  const methods = [
    'runCustomerAddressCommand', 'listActiveAddresses', 'findActiveAddress', 'countActiveAddresses',
    'countOpenBookingsUsingAddress', 'createAddress', 'updateAddress', 'archiveAddress',
    'findAssignedVisitSnapshot'
  ];
  if (!repository || methods.some(method => typeof repository[method] !== 'function')) {
    throw new TypeError('A transactional, owner-scoped customer address repository is required');
  }
}

function requireConfirmation(count, confirmed) {
  if (count > 0 && !confirmed) {
    throw new AppError(409, 'ADDRESS_BOOKING_CONFIRMATION_REQUIRED',
      'Confirm the address change before continuing', { decisionIds: ['ADDRESS_OPEN_BOOKING_IMPACT'] });
  }
}

function conflict() {
  throw new AppError(409, 'ADDRESS_VERSION_CONFLICT', 'Address has changed');
}

export function createCustomerAddressService({ repository, clock = Date.now } = {}) {
  requireRepository(repository);
  if (typeof clock !== 'function') throw new TypeError('A server clock is required');

  function runCommand({ customerId, operation, addressId = null, idempotencyKey, payload, execute }) {
    return repository.runCustomerAddressCommand({
      customerId, operation, addressId, idempotencyKey: requireIdempotencyKey(idempotencyKey), payload, execute
    });
  }

  return Object.freeze({
    list: async (actor, query = {}) => {
      const customerId = requireActor(actor, 'CUSTOMER');
      const allowed = new Set(['limit', 'cursor']);
      if (!query || typeof query !== 'object' || Array.isArray(query)
        || Object.keys(query).some(key => !allowed.has(key))) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Address list query is invalid');
      }
      const limit = query.limit === undefined ? DEFAULT_PAGE_SIZE : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Address list limit is invalid');
      }
      const cursor = query.cursor === undefined ? null : query.cursor;
      if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 256 || /[\u0000-\u001f\u007f]/u.test(cursor))) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Address cursor is invalid');
      }
      const page = await repository.listActiveAddresses({ customerId, limit, cursor });
      return Object.freeze({
        addresses: Object.freeze(page.addresses.map(addressView)),
        nextCursor: page.nextCursor ?? null,
        limit
      });
    },

    create: async (actor, input, idempotencyKey) => {
      const customerId = requireActor(actor, 'CUSTOMER');
      const values = normalizeCreate(input);
      return runCommand({ customerId, operation: 'ADDRESS_CREATE', idempotencyKey, payload: values,
        execute: async transaction => {
          const count = await repository.countActiveAddresses({ customerId, transaction });
          const isDefault = values.isDefault || count === 0;
          const created = await repository.createAddress({ customerId,
            values: { ...values, isDefault, state: 'ACTIVE', version: 0 }, now: new Date(clock()), transaction });
          return addressView(created);
        }
      });
    },

    update: async (actor, addressId, input, idempotencyKey) => {
      const customerId = requireActor(actor, 'CUSTOMER');
      const id = requireId(addressId);
      const command = normalizeUpdate(input);
      return runCommand({ customerId, operation: 'ADDRESS_UPDATE', addressId: id, idempotencyKey,
        payload: command, execute: async transaction => {
          const current = await repository.findActiveAddress({ customerId, addressId: id, transaction });
          if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Address not found');
          if (current.version !== command.expectedVersion) conflict();

          const publicOrPrivateLocationChanged = ['location', 'privateAccessNotes']
            .some(field => Object.hasOwn(command.changes, field) && command.changes[field] !== (current[field] ?? ''));
          if (publicOrPrivateLocationChanged) {
            const openBookings = await repository.countOpenBookingsUsingAddress({ customerId, addressId: id, transaction });
            requireConfirmation(openBookings, command.confirmOpenBookingImpact);
          }
          const updated = await repository.updateAddress({ customerId, addressId: id,
            expectedVersion: command.expectedVersion, changes: command.changes, now: new Date(clock()), transaction });
          if (!updated) conflict();
          return addressView(updated);
        }
      });
    },

    archive: async (actor, addressId, input, idempotencyKey) => {
      const customerId = requireActor(actor, 'CUSTOMER');
      const id = requireId(addressId);
      const command = normalizeArchive(input);
      return runCommand({ customerId, operation: 'ADDRESS_ARCHIVE', addressId: id, idempotencyKey,
        payload: command, execute: async transaction => {
          const current = await repository.findActiveAddress({ customerId, addressId: id, transaction });
          if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Address not found');
          if (current.version !== command.expectedVersion) conflict();
          const openBookings = await repository.countOpenBookingsUsingAddress({ customerId, addressId: id, transaction });
          requireConfirmation(openBookings, command.confirmOpenBookingImpact);
          const archivedAt = new Date(clock());
          const archived = await repository.archiveAddress({ customerId, addressId: id,
            expectedVersion: command.expectedVersion, archivedAt, transaction });
          if (!archived) conflict();
          return Object.freeze({ id, state: 'ARCHIVED', isDefault: false, version: archived.version, archivedAt: archivedAt.toISOString() });
        }
      });
    },

    accessNotes: async (actor, visitId) => {
      const sitterId = requireActor(actor, 'PET_SITTER');
      const id = requireId(visitId, 'visitId');
      const snapshot = await repository.findAssignedVisitSnapshot({ visitId: id, sitterId });
      if (!snapshot) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
      if (!['ASSIGNED', 'IN_PROGRESS'].includes(snapshot.state)) {
        throw new AppError(403, 'ACCESS_WINDOW_CLOSED', 'Home access notes are not available');
      }
      if (snapshot.handoverRequired === true && snapshot.handoverAccepted !== true) {
        throw new AppError(403, 'HANDOVER_REQUIRED', 'Confirm the visit handover before viewing access notes');
      }
      const startAt = new Date(snapshot.startAt).getTime();
      const now = clock();
      if (!Number.isFinite(startAt) || !Number.isFinite(now) || now < startAt - ACCESS_LEAD_MS
        || snapshot.checkOutAt !== null && snapshot.checkOutAt !== undefined) {
        throw new AppError(403, 'ACCESS_WINDOW_CLOSED', 'Home access notes are not available');
      }
      return Object.freeze({ visitId: id,
        privateAccessNotes: typeof snapshot.privateAccessNotesSnapshot === 'string' ? snapshot.privateAccessNotesSnapshot : '' });
    }
  });
}
