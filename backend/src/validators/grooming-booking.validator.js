import { exact, fail, id } from './pet-care.validator.js';
import {
  GROOMING_BITE_ANSWERS, GROOMING_MAX_PETS, GROOMING_MAX_SERVICES_PER_PET, GROOMING_SKIN_ANSWERS
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
