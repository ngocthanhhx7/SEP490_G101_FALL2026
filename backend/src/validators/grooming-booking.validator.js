import { Types } from 'mongoose';
import { exact, fail, id } from './pet-care.validator.js';
import { PAGE_QUERY_KEYS, parsePageQuery } from './pagination.validator.js';
import {
  GROOMING_APPOINTMENT_STATUSES, GROOMING_BITE_ANSWERS, GROOMING_IDEMPOTENCY_KEY, GROOMING_MAX_PETS, GROOMING_MAX_SERVICES_PER_PET,
  GROOMING_SKIN_ANSWERS
} from '../constants/grooming.js';
import { isGroomingDate } from '../utils/grooming-slot-time.js';

function serviceIds(value) {
  if (!Array.isArray(value) || !value.length || value.length > GROOMING_MAX_SERVICES_PER_PET || new Set(value).size !== value.length) {
    fail('VALIDATION_FAILED', 'Each pet needs one or more different services');
  }
  value.forEach(id);
  return value;
}

function answers(value) {
  exact(value, ['biteOrScratch', 'skinCondition'], ['biteOrScratch', 'skinCondition']);
  if (!GROOMING_BITE_ANSWERS.includes(value.biteOrScratch) || !GROOMING_SKIN_ANSWERS.includes(value.skinCondition)) {
    fail('VALIDATION_FAILED', 'Unknown answer');
  }
  return { biteOrScratch: value.biteOrScratch, skinCondition: value.skinCondition };
}

function pets(value, mapPet) {
  if (!Array.isArray(value) || !value.length || value.length > GROOMING_MAX_PETS) fail('VALIDATION_FAILED', 'One or more pets required');
  const rows = value.map(mapPet);
  if (new Set(rows.map(row => row.petId)).size !== rows.length) fail('VALIDATION_FAILED', 'Each pet can be chosen once');
  return rows;
}

export function groomingSlotsInput(body) {
  exact(body, ['date', 'pets'], ['date', 'pets']);
  if (!isGroomingDate(body.date)) fail('VALIDATION_FAILED', 'Valid date required');
  return {
    date: body.date,
    pets: pets(body.pets, row => {
      exact(row, ['petId', 'serviceIds'], ['petId', 'serviceIds']);
      return { petId: id(row.petId), serviceIds: serviceIds(row.serviceIds) };
    })
  };
}

export function groomingQuoteInput(body) {
  exact(body, ['pets'], ['pets']);
  return {
    pets: pets(body.pets, row => {
      exact(row, ['petId', 'serviceIds', 'answers'], ['petId', 'serviceIds', 'answers']);
      return { petId: id(row.petId), serviceIds: serviceIds(row.serviceIds), answers: answers(row.answers) };
    })
  };
}

const priced = row => {
  exact(row, ['petId', 'serviceIds', 'answers'], ['petId', 'serviceIds', 'answers']);
  return { petId: id(row.petId), serviceIds: serviceIds(row.serviceIds), answers: answers(row.answers) };
};

// The start must be the exact ISO string the slots endpoint returned (an hour boundary in UTC is one in +07:00 too).
export function groomingBookingInput(body) {
  exact(body, ['startAt', 'pets', 'expectedTotalVnd'], ['startAt', 'pets', 'expectedTotalVnd']);
  const start = typeof body.startAt === 'string' ? new Date(body.startAt) : null;
  if (!start || !Number.isFinite(start.getTime()) || start.toISOString() !== body.startAt || start.getTime() % 3600000 !== 0) {
    fail('VALIDATION_FAILED', 'Valid slot start required');
  }
  if (!Number.isSafeInteger(body.expectedTotalVnd) || body.expectedTotalVnd < 0) fail('VALIDATION_FAILED', 'Expected total must be a whole number of dong');
  return { startAt: start, pets: pets(body.pets, priced), expectedTotalVnd: body.expectedTotalVnd };
}

export function groomingIdempotencyKey(value) {
  if (typeof value !== 'string' || !GROOMING_IDEMPOTENCY_KEY.test(value)) fail('VALIDATION_FAILED', 'Idempotency-Key of 8 to 200 characters required');
  return value;
}

export function groomingListQuery(query = {}) {
  if (Object.keys(query).some(key => ![...PAGE_QUERY_KEYS, 'status'].includes(key))) fail('VALIDATION_FAILED', 'Unknown query field');
  const page = parsePageQuery(query);
  if (query.status !== undefined && !GROOMING_APPOINTMENT_STATUSES.includes(query.status)) fail('VALIDATION_FAILED', 'Unknown status');
  return { ...page, ...(query.status === undefined ? {} : { status: query.status }) };
}

// An id that is not an ObjectId is simply not found: nothing tells the caller whether another customer owns it.
export const groomingAppointmentId = value => (typeof value === 'string' && /^[a-f0-9]{24}$/iu.test(value) ? new Types.ObjectId(value) : null);
