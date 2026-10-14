import { ApiError, createApiClient } from './api-client.js';

export const PET_ID_PATTERN = /^[0-9a-f]{24}$/i;

export const PET_FIELD_STATUSES = Object.freeze([
  'KNOWN',
  'UNKNOWN',
  'NOT_PROVIDED',
  'NOT_APPLICABLE',
  'NEEDS_CONFIRMATION',
]);

export const PET_FIELD_KEYS = Object.freeze([
  'breed',
  'approximate_age',
  'identifying_marks',
  'weight_kg',
  'handling_preferences',
  'feeding_instructions',
  'water_instructions',
  'dog_walk_instructions',
  'dog_toileting_cues',
  'cat_litter_instructions',
  'cat_carrier_and_approach',
  'customer_reported_health_notes',
  'medication_instructions',
  'vaccination_records',
  'emergency_contact',
  'veterinary_contact',
]);

const PET_STATES = new Set(['ACTIVE', 'ARCHIVED']);
const PET_SPECIES = new Set(['DOG', 'CAT']);
const STATUS_SET = new Set(PET_FIELD_STATUSES);
const FIELD_KEY_SET = new Set(PET_FIELD_KEYS);
const CUSTOMER_EDITABLE_FIELD_KEY_SET = new Set(PET_FIELD_KEYS.filter(key => key !== 'medication_instructions'));
const FIELD_SOURCE_SET = new Set(['CUSTOMER_REPORTED', 'DOCUMENT_ATTACHED']);
const SPECIES_NOT_APPLICABLE_FIELDS = Object.freeze({
  DOG: Object.freeze(['cat_litter_instructions', 'cat_carrier_and_approach']),
  CAT: Object.freeze(['dog_walk_instructions', 'dog_toileting_cues']),
});

function requirePetId(id) {
  if (typeof id !== 'string' || !PET_ID_PATTERN.test(id)) {
    throw new ApiError('INVALID_RESOURCE_ID', 400);
  }
  return id;
}

function requireExpectedVersion(version) {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new ApiError('INVALID_VERSION', 400);
  }
  return version;
}

function hasValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function isDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function sanitizeFieldValue(key, value) {
  const textFields = new Set([
    'breed', 'identifying_marks', 'handling_preferences', 'feeding_instructions',
    'water_instructions', 'dog_walk_instructions', 'dog_toileting_cues',
    'cat_litter_instructions', 'cat_carrier_and_approach',
    'customer_reported_health_notes',
  ]);
  if (textFields.has(key)) {
    if (typeof value !== 'string' || !value.trim()) throw new ApiError('INVALID_PET_FIELD_VALUE', 422);
    return value.trim();
  }

  if (key === 'approximate_age') {
    if (!value || typeof value !== 'object' || !Number.isFinite(value.amount) || value.amount < 0
      || !['YEARS', 'MONTHS'].includes(value.unit)) throw new ApiError('INVALID_PET_FIELD_VALUE', 422);
    return { amount: value.amount, unit: value.unit, estimated: true };
  }
  if (key === 'weight_kg') {
    if (!value || typeof value !== 'object' || !Number.isFinite(value.amount) || value.amount <= 0
      || !isDateOnly(value.measuredAt)) throw new ApiError('INVALID_PET_FIELD_VALUE', 422);
    return { amount: value.amount, unit: 'KG', measuredAt: value.measuredAt };
  }
  if (key === 'vaccination_records') {
    if (!Array.isArray(value)) throw new ApiError('INVALID_PET_FIELD_VALUE', 422);
    return value.map((record) => {
      if (!record || typeof record !== 'object' || typeof record.name !== 'string' || !record.name.trim()
        || (record.date !== undefined && !isDateOnly(record.date))) {
        throw new ApiError('INVALID_PET_FIELD_VALUE', 422);
      }
      return { name: record.name.trim(), ...(record.date ? { date: record.date } : {}) };
    });
  }
  if (key === 'emergency_contact') {
    if (!value || typeof value !== 'object'
      || !['name', 'relationship', 'phone'].every((property) => typeof value[property] === 'string')) {
      throw new ApiError('INVALID_PET_FIELD_VALUE', 422);
    }
    return { name: value.name.trim(), relationship: value.relationship.trim(), phone: value.phone.trim() };
  }
  if (key === 'veterinary_contact') {
    if (!value || typeof value !== 'object' || typeof value.name !== 'string' || !value.name.trim()) {
      throw new ApiError('INVALID_PET_FIELD_VALUE', 422);
    }
    const safe = { name: value.name.trim() };
    if (typeof value.phone === 'string' && value.phone.trim()) safe.phone = value.phone.trim();
    if (typeof value.address === 'string' && value.address.trim()) safe.address = value.address.trim();
    return safe;
  }
  throw new ApiError('INVALID_PET_FIELDS', 400);
}

function normalizeCareFields(careFields, species) {
  if (!careFields || typeof careFields !== 'object' || Array.isArray(careFields)) {
    throw new ApiError('INVALID_PET_FIELDS', 400);
  }

  const normalized = {};
  for (const [key, field] of Object.entries(careFields)) {
    if (!CUSTOMER_EDITABLE_FIELD_KEY_SET.has(key) || !field || typeof field !== 'object' || Array.isArray(field)
      || !STATUS_SET.has(field.status)) {
      throw new ApiError('INVALID_PET_FIELDS', 400);
    }
    if (field.status === 'NOT_APPLICABLE' && !SPECIES_NOT_APPLICABLE_FIELDS[species]?.includes(key)) {
      throw new ApiError('INVALID_PET_FIELD_STATUS', 422);
    }

    const output = { status: field.status };
    if (field.status === 'KNOWN') {
      if (!hasValue(field.value)) throw new ApiError('KNOWN_FIELD_REQUIRES_VALUE', 422);
      output.value = sanitizeFieldValue(key, field.value);
    } else if (field.status === 'NEEDS_CONFIRMATION' && hasValue(field.priorValue)) {
      output.priorValue = sanitizeFieldValue(key, field.priorValue);
    }

    normalized[key] = output;
  }
  return normalized;
}

function generateIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE');
}

export function isPetView(value, requestedId) {
  if (!(value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.id === 'string' && PET_ID_PATTERN.test(value.id)
    && value.id.toLowerCase() === requestedId.toLowerCase()
    && typeof value.name === 'string' && value.name.trim().length > 0
    && PET_SPECIES.has(value.species)
    && PET_STATES.has(value.state)
    && Number.isSafeInteger(value.version) && value.version >= 0
    && value.careFields && typeof value.careFields === 'object' && !Array.isArray(value.careFields))) return false;

  for (const [key, field] of Object.entries(value.careFields)) {
    if (!FIELD_KEY_SET.has(key) || !field || typeof field !== 'object' || Array.isArray(field)
      || !STATUS_SET.has(field.status)) return false;
    if (field.status === 'KNOWN' && !hasValue(field.value)) return false;
    if (field.status !== 'KNOWN' && Object.hasOwn(field, 'value')) return false;
    if (field.status === 'NEEDS_CONFIRMATION' && Object.hasOwn(field, 'value')) return false;
    if (field.status !== 'NEEDS_CONFIRMATION' && Object.hasOwn(field, 'priorValue')) return false;
    if (field.source !== undefined && !FIELD_SOURCE_SET.has(field.source)) return false;
    if (field.updatedAt !== undefined && (typeof field.updatedAt !== 'string' || Number.isNaN(Date.parse(field.updatedAt)))) return false;
  }
  return true;
}

function requirePetView(result, id, { archived = false } = {}) {
  if (result?.pending) return result;
  // A successful 204 has no resource representation to confirm the command result.
  // Treat it as unresolved and let the page reconcile with a fresh GET.
  if (result?.status === 204) return { ...result, pending: true };
  if (!isPetView(result?.data, id) || (archived && result.data.state !== 'ARCHIVED')) {
    throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  }
  return result;
}

export function createPetProfileApi({
  request, fetchImpl, getCsrfToken, onUnauthorized, timeoutMs,
  createIdempotencyKey = generateIdempotencyKey,
} = {}) {
  let defaultRequest;
  const send = (...args) => {
    if (request) return request(...args);
    // Resolve fetch lazily so importing the adapter does not require a browser global
    // in unit-test or server-rendering environments.
    if (!defaultRequest) defaultRequest = createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs });
    return defaultRequest(...args);
  };

  return Object.freeze({
    async getPet(id, { signal } = {}) {
      const petId = requirePetId(id);
      const result = await send(`/pets/${petId}`, { signal });
      return requirePetView(result, petId);
    },

    async updatePet(id, { name, species, careFields = {} } = {}, { expectedVersion } = {}) {
      const petId = requirePetId(id);
      const version = requireExpectedVersion(expectedVersion);
      if (typeof name !== 'string' || !name.trim() || !PET_SPECIES.has(species)) {
        throw new ApiError('INVALID_PET_INPUT', 422);
      }
      if (!careFields || typeof careFields !== 'object' || Array.isArray(careFields)) {
        throw new ApiError('INVALID_PET_FIELDS', 400);
      }
      const body = { name: name.trim(), species };
      const normalizedCareFields = normalizeCareFields(careFields, species);
      if (Object.keys(normalizedCareFields).length > 0) body.careFields = normalizedCareFields;
      const result = await send(`/pets/${petId}`, {
        method: 'PATCH', body, expectedVersion: version,
        idempotencyKey: createIdempotencyKey(),
      });
      return requirePetView(result, petId);
    },

    async archivePet(id, { expectedVersion } = {}) {
      const petId = requirePetId(id);
      const version = requireExpectedVersion(expectedVersion);
      const result = await send(`/pets/${petId}/archives`, {
        method: 'POST', body: {}, expectedVersion: version,
        idempotencyKey: createIdempotencyKey(),
      });
      return requirePetView(result, petId, { archived: true });
    },
  });
}

export const petProfileApi = createPetProfileApi();
