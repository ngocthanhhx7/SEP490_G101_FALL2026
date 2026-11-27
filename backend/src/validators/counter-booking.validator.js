import { exact, fail, id, instant, number } from './pet-care.validator.js';
import { isGroomingDate } from '../utils/grooming-slot-time.js';
import { GROOMING_BITE_ANSWERS, GROOMING_SKIN_ANSWERS } from '../constants/grooming.js';

function petIds(value) {
  if (!Array.isArray(value) || !value.length || value.length > 10 || new Set(value).size !== value.length)
    fail('VALIDATION_FAILED', 'Choose one to ten different pets');
  return value.map(id);
}

export function counterBookingInput(body) {
  exact(body, ['customerId', 'petIds', 'date', 'slot', 'paymentMethod', 'lines', 'pickup', 'answers'],
    ['customerId', 'date', 'slot', 'paymentMethod', 'lines', 'pickup']);
  const customerId = id(body.customerId);
  if (body.petIds !== undefined) petIds(body.petIds);
  if (!isGroomingDate(body.date) || !/^(?:[01]\d|2[0-3]):00$/.test(body.slot))
    fail('VALIDATION_FAILED', 'Valid date and shop hour required');
  if (!['COUNTER_CASH', 'COUNTER_VIETQR'].includes(body.paymentMethod))
    fail('VALIDATION_FAILED', 'Counter payment method required');
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 20)
    fail('VALIDATION_FAILED', 'One to twenty service lines required');
  const lines = body.lines.map(line => {
    exact(line, ['serviceId', 'petIds', 'location', 'visitCount', 'starts', 'addressId', 'dayCount'], ['serviceId', 'petIds', 'location']);
    if (!['HOME', 'FACILITY', 'OUTDOOR'].includes(line.location)) fail('VALIDATION_FAILED', 'Invalid service location');
    const row = { serviceId: id(line.serviceId), petIds: petIds(line.petIds), location: line.location };
    if (line.visitCount !== undefined) row.visitCount = number(line.visitCount, 1, 60, true);
    if (line.dayCount !== undefined) row.dayCount = number(line.dayCount, 1, 60, true);
    if (line.starts !== undefined) {
      if (!Array.isArray(line.starts) || line.starts.length !== row.visitCount) fail('VALIDATION_FAILED', 'Schedule every visit');
      row.starts = line.starts.map(start => new Date(instant(start)).toISOString());
    }
    if (line.location !== 'FACILITY') row.addressId = id(line.addressId);
    else if (line.addressId !== undefined) fail('VALIDATION_FAILED', 'Facility address is resolved by server');
    return row;
  });
  exact(body.pickup, ['enabled', 'addressId'], ['enabled']);
  if (typeof body.pickup.enabled !== 'boolean') fail('VALIDATION_FAILED', 'Invalid pickup choice');
  const pickup = body.pickup.enabled ? { enabled: true, addressId: id(body.pickup.addressId) } : { enabled: false };
  if (!pickup.enabled && body.pickup.addressId !== undefined) fail('VALIDATION_FAILED', 'Unexpected pickup address');
  const answers = body.answers ?? [];
  if (!Array.isArray(answers) || answers.length > 10) fail('VALIDATION_FAILED', 'Invalid grooming answers');
  const seen = new Set();
  for (const answer of answers) {
    exact(answer, ['petId', 'biteOrScratch', 'skinCondition'], ['petId', 'biteOrScratch', 'skinCondition']);
    id(answer.petId);
    if (seen.has(answer.petId) || !GROOMING_BITE_ANSWERS.includes(answer.biteOrScratch) ||
      !GROOMING_SKIN_ANSWERS.includes(answer.skinCondition)) fail('VALIDATION_FAILED', 'Complete each pet grooming answer');
    seen.add(answer.petId);
  }
  return { customerId, date: body.date, slot: body.slot, paymentMethod: body.paymentMethod, lines, pickup, answers };
}
