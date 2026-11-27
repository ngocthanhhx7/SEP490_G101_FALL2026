import {
  GROOMING_MIN_LEAD_MINUTES, GROOMING_QUESTIONS, GROOMING_SLOT_MINUTES
} from '../../constants/grooming.js';
import { groomingWindow } from '../../utils/grooming-slot-time.js';
import { groomingQuoteInput, groomingSlotsInput } from '../../validators/grooming-booking.validator.js';
import { exact, fail, id } from '../../validators/pet-care.validator.js';
import { hasUnpaidGrooming } from './grooming-unpaid.service.js';

// Customer-facing shop grooming (UC-58): the reads of steps 1 to 4 (options, time slots, final price) and the booking of step 5.
export function createGroomingService({ shopServices, slots, pricing, booking, connection, facilityAddress = null, hotline = null, clock = Date.now, pickup }) {
  function customerId(actor) {
    if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('CUSTOMER') || actor.synthetic) fail('FORBIDDEN', 'Customer required', 403);
    return actor.userId;
  }
  return {
    async options(actor) {
      const customer = customerId(actor);
      const { firstDate, lastDate } = groomingWindow(clock());
      return {
        shop: { address: facilityAddress?.trim() || null, hotline: hotline?.trim() || null },
        window: { slotMinutes: GROOMING_SLOT_MINUTES, firstDate, lastDate, minLeadMinutes: GROOMING_MIN_LEAD_MINUTES },
        services: await shopServices.list(),
        groomingPaymentOutstanding: connection ? await hasUnpaidGrooming(connection, customer) : false,
        questions: GROOMING_QUESTIONS
      };
    },
    slots: (actor, body) => slots.list(customerId(actor), groomingSlotsInput(body)),
    pickupQuote: (actor, body) => {
      const customer = customerId(actor);
      exact(body, ['addressId'], ['addressId']);
      if (!pickup) fail('PICKUP_DISTANCE_UNAVAILABLE', 'Pickup distance unavailable', 503);
      return pickup.quoteForCustomer(customer, id(body.addressId));
    },
    quote: (actor, body) => pricing.quote(customerId(actor), groomingQuoteInput(body)),
    book: (actor, body, idempotencyKey) => booking.book(customerId(actor), body, idempotencyKey),
    cancelAppointment: (actor, id, body) => booking.cancel(customerId(actor), id, body),
    listAppointments: (actor, query) => booking.list(customerId(actor), query),
    readAppointment: (actor, id) => booking.read(customerId(actor), id)
  };
}
