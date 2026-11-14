import {
  GROOMING_MIN_LEAD_MINUTES, GROOMING_QUESTIONS, GROOMING_SLOT_MINUTES
} from '../../constants/grooming.js';
import { groomingWindow } from '../../utils/grooming-slot-time.js';
import { groomingQuoteInput, groomingSlotsInput } from '../../validators/grooming-booking.validator.js';
import { fail } from '../../validators/pet-care.validator.js';

// Customer-facing shop grooming (UC-58): the reads of steps 1 to 4 (options, time slots, final price) and the booking of step 5.
export function createGroomingService({ shopServices, slots, pricing, booking, facilityAddress = null, hotline = null, clock = Date.now }) {
  function customerId(actor) {
    if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('CUSTOMER') || actor.synthetic) fail('FORBIDDEN', 'Customer required', 403);
    return actor.userId;
  }
  return {
    async options(actor) {
      customerId(actor);
      const { firstDate, lastDate } = groomingWindow(clock());
      return {
        shop: { address: facilityAddress?.trim() || null, hotline: hotline?.trim() || null },
        window: { slotMinutes: GROOMING_SLOT_MINUTES, firstDate, lastDate, minLeadMinutes: GROOMING_MIN_LEAD_MINUTES },
        services: await shopServices.list(),
        questions: GROOMING_QUESTIONS
      };
    },
    slots: (actor, body) => slots.list(customerId(actor), groomingSlotsInput(body)),
    quote: (actor, body) => pricing.quote(customerId(actor), groomingQuoteInput(body)),
    book: (actor, body, idempotencyKey) => booking.book(customerId(actor), body, idempotencyKey),
    listAppointments: (actor, query) => booking.list(customerId(actor), query),
    readAppointment: (actor, id) => booking.read(customerId(actor), id)
  };
}
