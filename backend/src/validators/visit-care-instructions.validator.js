import { AppError } from '../utils/app-error.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_:-]{8,128}$/;
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u;

export const CARE_INSTRUCTIONS_LIMITS = Object.freeze({
  petNoteMax: 1000,
  taskLabelMax: 200,
  homeAccessNoteMax: 1000,
  maxPets: 20,
  maxTasks: 30
});

function invalid(message = 'Care instructions input is invalid', fieldErrors) {
  throw new AppError(422, 'VALIDATION_FAILED', message, fieldErrors ? { fieldErrors } : undefined);
}

export function parseCareObjectId(value, field = 'id') {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    invalid(`${field} is invalid`, { [field]: 'Mã không hợp lệ.' });
  }
  return value.toLowerCase();
}

export function parseCareIdempotencyKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) {
    invalid('Idempotency key is required');
  }
  return value;
}

function cleanText(value, field, max, required = false) {
  if (value === undefined || value === null) {
    if (required) invalid(`${field} is required`, { [field]: 'Vui lòng nhập thông tin này.' });
    return '';
  }
  if (typeof value !== 'string' || CONTROL_CHARS.test(value)) {
    invalid(`${field} is invalid`, { [field]: 'Nội dung không hợp lệ.' });
  }
  const trimmed = value.trim();
  if (required && !trimmed) invalid(`${field} is required`, { [field]: 'Vui lòng nhập thông tin này.' });
  if (trimmed.length > max) invalid(`${field} is too long`, { [field]: `Tối đa ${max} ký tự.` });
  return trimmed;
}

export function parseVisitCareInstructionsInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid();
  const allowed = new Set(['expectedVersion', 'pets', 'tasks', 'homeAccessNote', 'applyToLater', 'applyFromNextVisit', 'targetVersions']);
  if (Object.keys(body).some(key => !allowed.has(key))) invalid('Unsupported fields in care instructions');

  if (body.expectedVersion !== undefined && (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0)) {
    invalid('expectedVersion is invalid');
  }
  if (body.applyToLater !== undefined && typeof body.applyToLater !== 'boolean') {
    invalid('applyToLater must be a boolean');
  }

  if (body.applyFromNextVisit !== undefined && typeof body.applyFromNextVisit !== 'boolean') {
    invalid('applyFromNextVisit must be a boolean');
  }
  if (body.applyFromNextVisit && !body.applyToLater) invalid('Applying from the next visit requires a later-visit selection');
  if (body.applyToLater && (body.expectedVersion === undefined || !Array.isArray(body.targetVersions))) {
    invalid('Selected and later visit versions are required');
  }
  if (body.targetVersions !== undefined && (!Array.isArray(body.targetVersions) || body.targetVersions.length > 59
    || !body.applyToLater && body.targetVersions.length > 0)) {
    invalid('targetVersions must list the later visits to update');
  }
  const targetVersions = new Map();
  for (const row of body.targetVersions ?? []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || Object.keys(row).some(key => !['visitId', 'version'].includes(key))
      || !Number.isSafeInteger(row.version) || row.version < 0) invalid('Invalid later visit version');
    const visitId = parseCareObjectId(row.visitId, 'targetVersions.visitId');
    if (targetVersions.has(visitId)) invalid('Duplicate later visit');
    targetVersions.set(visitId, row.version);
  }

  if (!Array.isArray(body.pets) || body.pets.length > CARE_INSTRUCTIONS_LIMITS.maxPets) {
    invalid('pets must be an array');
  }
  const seenPets = new Set();
  const pets = body.pets.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) invalid(`pets.${index} is invalid`);
    const petAllowed = new Set(['petId', 'feeding', 'medicine', 'behavior']);
    if (Object.keys(row).some(key => !petAllowed.has(key))) invalid(`pets.${index} has unsupported fields`);
    const petId = parseCareObjectId(row.petId, `pets.${index}.petId`);
    if (seenPets.has(petId)) invalid(`Duplicate petId ${petId}`);
    seenPets.add(petId);
    return {
      petId,
      feeding: cleanText(row.feeding, `pets.${index}.feeding`, CARE_INSTRUCTIONS_LIMITS.petNoteMax, false),
      medicine: cleanText(row.medicine, `pets.${index}.medicine`, CARE_INSTRUCTIONS_LIMITS.petNoteMax, false),
      behavior: cleanText(row.behavior, `pets.${index}.behavior`, CARE_INSTRUCTIONS_LIMITS.petNoteMax, false)
    };
  });

  if (!Array.isArray(body.tasks) || body.tasks.length > CARE_INSTRUCTIONS_LIMITS.maxTasks) {
    invalid('tasks must be an array');
  }
  const seenTaskIds = new Set();
  const tasks = body.tasks.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) invalid(`tasks.${index} is invalid`);
    const taskAllowed = new Set(['itemId', 'label', 'required']);
    if (Object.keys(row).some(key => !taskAllowed.has(key))) invalid(`tasks.${index} has unsupported fields`);
    const itemId = row.itemId === undefined || row.itemId === null || row.itemId === ''
      ? null
      : cleanText(row.itemId, `tasks.${index}.itemId`, 80, false);
    if (itemId) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(itemId)) invalid(`tasks.${index}.itemId is invalid`);
      if (seenTaskIds.has(itemId)) invalid(`Duplicate task itemId ${itemId}`);
      seenTaskIds.add(itemId);
    }
    const label = cleanText(row.label, `tasks.${index}.label`, CARE_INSTRUCTIONS_LIMITS.taskLabelMax, true);
    if (row.required !== undefined && typeof row.required !== 'boolean') {
      invalid(`tasks.${index}.required must be a boolean`);
    }
    return { itemId, label, required: row.required === true };
  });

  const homeAccessNote = cleanText(
    body.homeAccessNote,
    'homeAccessNote',
    CARE_INSTRUCTIONS_LIMITS.homeAccessNoteMax,
    false
  );

  return {
    expectedVersion: body.expectedVersion,
    pets,
    tasks,
    homeAccessNote,
    applyToLater: body.applyToLater === true,
    applyFromNextVisit: body.applyFromNextVisit === true,
    targetVersions
  };
}
