import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { groomingModels } from '../../models/grooming-appointment.model.js';
import {
  GROOMING_BLOCKING_APPOINTMENT_STATUSES, GROOMING_MIN_LEAD_MINUTES, GROOMING_RELEASED_PET_STATUS, GROOMING_SLOT_MINUTES
} from '../../constants/grooming.js';
import { groomingCoveredSlots, groomingLocalDate, groomingLocalTime, groomingSlotKey, groomingWindow } from '../../utils/grooming-slot-time.js';
import { groomingAppointmentId, groomingBookingInput, groomingIdempotencyKey, groomingListQuery } from '../../validators/grooming-booking.validator.js';
import { AppError } from '../../utils/app-error.js';
import { fail } from '../../validators/pet-care.validator.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { paginate } from '../pagination.service.js';

const SLOT_MS = GROOMING_SLOT_MINUTES * 60000;
const MAX_ATTEMPTS = 4;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const notFound = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'Appointment not found');
const slotTaken = startAt => new AppError(409, 'GROOMING_SLOT_TAKEN', 'The time slot is no longer available', { startAt: startAt.toISOString() });
const idempotencyConflict = () => new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request');

// What the customer sees: no check-in photos, notes or staff identities.
export function toGroomingAppointmentView(doc, hotline = null) {
  return {
    id: String(doc._id), code: doc.code, status: doc.status,
    slot: { startAt: doc.slot.startAt.toISOString(), endAt: doc.slot.endAt.toISOString(), localDate: doc.slot.localDate, startLocalTime: doc.slot.startLocalTime },
    pets: doc.pets.map(pet => ({
      petId: String(pet.petId), name: pet.petSnapshot.name, status: pet.status, durationMinutes: pet.durationMinutes, finalPriceVnd: pet.finalPriceVnd,
      services: pet.services.map(service => ({ serviceId: String(service.serviceId), name: service.name, durationMinutes: service.durationMinutes,
        sizeLabel: service.sizeLabel ?? null, priceVnd: service.priceVnd }))
    })),
    pricing: { subtotalVnd: doc.pricing.subtotalVnd, tierDiscountVnd: doc.pricing.tierDiscountVnd, totalVnd: doc.pricing.totalVnd, currency: doc.pricing.currency },
    tier: { code: doc.tier.code ?? null, discountBps: doc.tier.discountBps ?? 0, discountBlockedReason: doc.tier.discountBlockedReason ?? null },
    shop: { address: doc.shop.address, hotline },
    depositRequired: false,
    bookedAt: doc.bookedAt.toISOString()
  };
}

// Booking of a shop grooming appointment (UC-58 step 5, GBR-40):
//  - price and capacity are recomputed here, never taken from the customer;
//  - every slot the pets need is held in ONE transaction, so a slot that is full leaves nothing behind;
//  - the same Idempotency-Key with the same content answers with the appointment already saved.
export function createGroomingBooking({ connection, clock = Date.now, pricing, shiftSource, codes, facilityAddress = null, hotline = null }) {
  const { GroomingAppointment, GroomingSlot, GroomingCommand } = groomingModels(connection);
  const uow = createUnitOfWork(connection);
  const address = facilityAddress?.trim() || null;
  const contact = hotline?.trim() || null;

  function checkStart(startAt, now) {
    if (!groomingWindow(now).dates.includes(groomingLocalDate(startAt))) fail('VALIDATION_FAILED', 'Slot is outside the booking window');
    if (startAt.getTime() < now + GROOMING_MIN_LEAD_MINUTES * 60000) fail('VALIDATION_FAILED', 'Slot starts too soon');
  }

  // Places per slot the shop can offer for this combination of services (a sitter must offer every chosen service).
  async function capacityOf(serviceIds, startAt, longest) {
    const roster = await shiftSource.openRoster({ serviceIds, from: startAt, to: new Date(startAt.getTime() + longest * SLOT_MS) });
    const capacity = new Map();
    for (let index = 0; index < longest; index += 1) {
      const slot = new Date(startAt.getTime() + index * SLOT_MS);
      capacity.set(groomingSlotKey(slot), roster.sittersFor(slot, new Date(slot.getTime() + SLOT_MS)).length);
    }
    return capacity;
  }

  // Q6: a pet cannot have two shop appointments at overlapping times. Only BOOKED and CHECKED_IN appointments keep a pet busy,
  // and a pet released with no charge no longer does.
  async function assertPetsFree(pets, session = null) {
    const ids = pets.map(pet => pet.petId), keys = [...new Set(pets.flatMap(pet => pet.slotKeys))];
    const found = await GroomingAppointment.find({
      status: { $in: GROOMING_BLOCKING_APPOINTMENT_STATUSES },
      pets: { $elemMatch: { petId: { $in: ids }, status: { $ne: GROOMING_RELEASED_PET_STATUS }, slotKeys: { $in: keys } } }
    }).select('pets.petId pets.status pets.slotKeys').session(session).lean();
    for (const pet of pets) {
      const busy = found.some(doc => doc.pets.some(other => String(other.petId) === String(pet.petId)
        && other.status !== GROOMING_RELEASED_PET_STATUS && other.slotKeys.some(key => pet.slotKeys.includes(key))));
      if (busy) {
        throw new AppError(409, 'GROOMING_PET_ALREADY_BOOKED', `${pet.petSnapshot.name} đã có lịch tại cửa hàng vào giờ này. Vui lòng chọn giờ khác.`,
          { petId: String(pet.petId), petName: pet.petSnapshot.name });
      }
    }
  }

  async function book(customerId, body, rawKey) {
    const input = groomingBookingInput(body), key = groomingIdempotencyKey(rawKey);
    const owner = new Types.ObjectId(String(customerId));
    const commandId = digest([String(customerId), 'grooming-book', key]);
    const fingerprint = digest({ startAt: input.startAt.toISOString(), expectedTotalVnd: input.expectedTotalVnd,
      pets: [...input.pets].sort((a, b) => a.petId.localeCompare(b.petId)).map(pet => ({ ...pet, serviceIds: [...pet.serviceIds].sort() })) });
    const replay = async session => {
      const prior = await GroomingCommand.findById(commandId).session(session ?? null).lean();
      if (prior && prior.fingerprint !== fingerprint) throw idempotencyConflict();
      return prior?.result ?? null;
    };
    const earlier = await replay();
    if (earlier) return earlier;

    const now = clock();
    checkStart(input.startAt, now);
    if (!address) throw new AppError(409, 'FACILITY_ADDRESS_REQUIRED', 'The shop address is not configured');
    const priced = await pricing.price(String(customerId), { pets: input.pets });
    if (priced.totalVnd !== input.expectedTotalVnd) {
      throw new AppError(409, 'GROOMING_PRICE_CHANGED', 'Giá vừa thay đổi. Vui lòng xem lại giá cuối trước khi xác nhận.',
        { expectedTotalVnd: input.expectedTotalVnd, totalVnd: priced.totalVnd });
    }
    const pets = priced.pets.map(row => ({
      petId: row.pet._id,
      petSnapshot: { name: row.pet.name, species: row.pet.species, ...(row.pet.breedCode ? { breedCode: row.pet.breedCode } : {}),
        ...(row.pet.weightKg === undefined ? {} : { weightKg: row.pet.weightKg }), petVersion: row.pet.version ?? 0 },
      services: row.lines.map(line => ({ serviceId: new Types.ObjectId(line.serviceId), serviceVersion: line.serviceVersion, name: line.label,
        durationMinutes: line.durationMinutes, ...(line.sizeLabel ? { sizeLabel: line.sizeLabel } : {}), priceVnd: line.amountVnd,
        priceVersion: line.priceVersion, policyVersion: line.policyVersion })),
      answers: row.answers, finalPriceVnd: row.priceVnd, durationMinutes: row.durationMinutes,
      slotKeys: groomingCoveredSlots(input.startAt, row.durationMinutes).map(groomingSlotKey)
    }));
    const need = new Map();
    for (const pet of pets) for (const slotKey of pet.slotKeys) need.set(slotKey, (need.get(slotKey) ?? 0) + 1);
    const longest = Math.max(...pets.map(pet => pet.slotKeys.length));
    const capacity = await capacityOf([...new Set(input.pets.flatMap(row => row.serviceIds))], input.startAt, longest);
    // Checked before anything is written: a booking that can never fit leaves no slot record behind.
    if ([...need].some(([slotKey, count]) => count > (capacity.get(slotKey) ?? 0))) throw slotTaken(input.startAt);
    await assertPetsFree(pets);
    const code = await codes.nextCode();
    const longestMinutes = Math.max(...pets.map(pet => pet.durationMinutes));
    const slot = { startAt: input.startAt, endAt: new Date(input.startAt.getTime() + longestMinutes * 60000),
      localDate: groomingLocalDate(input.startAt), startLocalTime: groomingLocalTime(input.startAt) };

    const run = () => uow.run(async session => {
      const winner = await replay(session);
      if (winner) return winner;
      await assertPetsFree(pets, session);
      const at = new Date(now);
      for (const [slotKey, count] of [...need].sort(([a], [b]) => a.localeCompare(b))) {
        await GroomingSlot.collection.updateOne({ _id: slotKey }, { $setOnInsert: { held: 0 } }, { upsert: true, session });
        // Conditional increment without upsert: only "no document matched" means the slot is full.
        const held = await GroomingSlot.collection.updateOne({ _id: slotKey, held: { $lte: capacity.get(slotKey) - count } },
          { $inc: { held: count }, $set: { updatedAt: at } }, { session });
        if (held.matchedCount === 0) throw slotTaken(input.startAt);
      }
      const doc = new GroomingAppointment({
        code, customerId: owner, slot, status: 'BOOKED', pets,
        tier: { code: priced.tier.code, discountBps: priced.tier.discountBps, discountBlockedReason: priced.tier.blockedReason },
        pricing: { subtotalVnd: priced.subtotalVnd, tierDiscountVnd: priced.tierDiscountVnd, totalVnd: priced.totalVnd, currency: 'VND' },
        shop: { address }, bookedAt: at
      });
      await doc.validate();
      // The driver insert keeps the document unchanged when the transaction is retried.
      const plain = doc.toObject();
      await GroomingAppointment.collection.insertOne(plain, { session });
      const view = toGroomingAppointmentView(plain, contact);
      await GroomingCommand.collection.insertOne({ _id: commandId, fingerprint, result: view, createdAt: at }, { session });
      return view;
    });
    // A duplicate key can come from two requests creating the same new slot record or from a repeated key: try again, never read it as "full".
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (error?.code !== 11000 || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }

  return {
    book,
    async list(customerId, query) {
      const { page, limit, status } = groomingListQuery(query);
      const result = await paginate(GroomingAppointment, { filter: { customerId: new Types.ObjectId(String(customerId)), ...(status ? { status } : {}) },
        page, limit, sort: { 'slot.startAt': -1, _id: -1 } });
      return { ...result, items: result.items.map(doc => toGroomingAppointmentView(doc, contact)) };
    },
    async read(customerId, appointmentId) {
      const id = groomingAppointmentId(appointmentId);
      const doc = id && await GroomingAppointment.findOne({ _id: id, customerId: new Types.ObjectId(String(customerId)) }).lean();
      if (!doc) throw notFound();
      return toGroomingAppointmentView(doc, contact);
    }
  };
}
