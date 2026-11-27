import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { groomingModels } from '../../models/grooming-appointment.model.js';
import {
  GROOMING_CANCEL_MIN_LEAD_MINUTES, GROOMING_MIN_LEAD_MINUTES, GROOMING_RELEASED_PET_STATUS
} from '../../constants/grooming.js';
import { groomingCoveredSlots, groomingLocalDate, groomingLocalTime, groomingSlotKey, groomingWindow } from '../../utils/grooming-slot-time.js';
import {
  groomingAppointmentId, groomingBookingInput, groomingCancelInput, groomingIdempotencyKey, groomingListQuery
} from '../../validators/grooming-booking.validator.js';
import { AppError } from '../../utils/app-error.js';
import { fail } from '../../validators/pet-care.validator.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { paginate } from '../pagination.service.js';
import { createEmployeeScheduleRepository } from '../employee-scheduling/employee-schedule.repository.js';
import { assertGroomingReservations } from './grooming-reservation.service.js';
import { readBusyGroomingAppointments } from './grooming-pet-occupancy.service.js';
import { petCareModels } from '../../models/pet-care.model.js';
import { payrollModels } from '../../models/payroll.model.js';
import { assertNoUnpaidGrooming } from './grooming-unpaid.service.js';

const MAX_ATTEMPTS = 4;
const CANCEL_LEAD_MS = GROOMING_CANCEL_MIN_LEAD_MINUTES * 60000;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const notFound = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'Appointment not found');
const slotTaken = startAt => new AppError(409, 'GROOMING_SLOT_TAKEN', 'The time slot is no longer available', { startAt: startAt.toISOString() });
const idempotencyConflict = () => new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request');
const notCancellable = status => new AppError(409, 'GROOMING_APPOINTMENT_NOT_CANCELLABLE', 'Lịch hẹn này không còn huỷ được.', { status });
const cancelTooLate = (startAt, hotline) => new AppError(409, 'GROOMING_CANCEL_TOO_LATE', hotline
  ? `Lịch hẹn này không còn huỷ được tại đây. Vui lòng gọi cửa hàng theo số ${hotline}.`
  : 'Lịch hẹn này không còn huỷ được tại đây. Vui lòng gọi cửa hàng.', { startAt: startAt.toISOString(), hotline });

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
    bookedAt: doc.bookedAt.toISOString(),
    ...(doc.cancellation?.at ? { cancellation: { at: doc.cancellation.at.toISOString(), byRole: doc.cancellation.byRole } } : {})
  };
}

// Booking of a shop grooming appointment (UC-58 step 5, GBR-40):
//  - price and capacity are recomputed here, never taken from the customer;
//  - distinct qualified employees are reserved in one transaction across the existing employee guards;
//  - the same Idempotency-Key with the same content answers with the appointment already saved.
export function createGroomingBooking({ connection, clock = Date.now, pricing, shiftSource, codes, facilityAddress = null, hotline = null }) {
  const { GroomingAppointment } = groomingModels(connection);
  const employee = createEmployeeScheduleRepository({ connection, clock, coverageAreas: [] });
  const { Pet } = petCareModels(connection);
  const { PayrollMonthGuard } = payrollModels(connection);
  const uow = createUnitOfWork(connection);
  const address = facilityAddress?.trim() || null;
  const contact = hotline?.trim() || null;

  function checkStart(startAt, now) {
    if (!groomingWindow(now).dates.includes(groomingLocalDate(startAt))) fail('VALIDATION_FAILED', 'Slot is outside the booking window');
    if (startAt.getTime() < now + GROOMING_MIN_LEAD_MINUTES * 60000) fail('VALIDATION_FAILED', 'Slot starts too soon');
  }

  // Q6: a pet cannot have two shop appointments at overlapping times. Only BOOKED and CHECKED_IN appointments keep a pet busy,
  // and a pet released with no charge no longer does.
  async function assertPetsFree(pets, session = null) {
    const ids = pets.map(pet => pet.petId), keys = [...new Set(pets.flatMap(pet => pet.slotKeys))];
    const found = await readBusyGroomingAppointments(GroomingAppointment, ids, keys, session);
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
      const prior = await GroomingAppointment.findOne({ 'requestReceipt.key': commandId }).select('+requestReceipt').session(session ?? null).lean();
      if (prior && prior.requestReceipt.fingerprint !== fingerprint) throw idempotencyConflict();
      return prior?.requestReceipt.result ?? null;
    };
    const earlier = await replay();
    if (earlier) return earlier;

    const now = clock();
    checkStart(input.startAt, now);
    if (!address) throw new AppError(409, 'FACILITY_ADDRESS_REQUIRED', 'The shop address is not configured');
    const code = await codes.nextCode();
    const run = () => uow.run(async session => {
      const winner = await replay(session);
      if (winner) return winner;
      const customer = await connection.db.collection('users').findOneAndUpdate({ _id: owner, state: 'ACTIVE', roles: 'CUSTOMER', synthetic: { $ne: true } },
        { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' });
      if (!customer) fail('FORBIDDEN', 'Current customer account required', 403);
      await assertNoUnpaidGrooming(connection, customerId, session);
      const priced = await pricing.price(String(customerId), { pets: input.pets }, { session });
      for (const { pet } of [...priced.pets].sort((a, b) => String(a.pet._id).localeCompare(String(b.pet._id)))) {
        const guarded = await Pet.collection.updateOne({ _id: pet._id, ownerId: owner, state: 'ACTIVE', version: pet.version },
          { $inc: { bookingGuard: 1 } }, { session });
        if (!guarded.matchedCount) fail('VERSION_CONFLICT', 'Pet changed during booking', 409);
      }
      if (priced.totalVnd !== input.expectedTotalVnd) {
        throw new AppError(409, 'GROOMING_PRICE_CHANGED', 'Giá vừa thay đổi. Vui lòng xem lại giá cuối trước khi xác nhận.',
          { expectedTotalVnd: input.expectedTotalVnd, totalVnd: priced.totalVnd });
      }
      const pets = priced.pets.map(row => ({
        petId: row.pet._id,
        petSnapshot: { name: row.pet.name, species: row.pet.species, ...(row.pet.breedCode ? { breedCode: row.pet.breedCode } : {}),
          ...(row.pet.weightKg === undefined ? {} : { weightKg: row.pet.weightKg }), petVersion: row.pet.version ?? 0, traits: row.pet.traits ?? [] },
        services: row.lines.map(line => ({ serviceId: new Types.ObjectId(line.serviceId), serviceVersion: line.serviceVersion, name: line.label,
          durationMinutes: line.durationMinutes, ...(line.sizeLabel ? { sizeLabel: line.sizeLabel } : {}), priceVnd: line.amountVnd,
          priceVersion: line.priceVersion, policyVersion: line.policyVersion })),
        answers: row.answers, finalPriceVnd: row.priceVnd, durationMinutes: row.durationMinutes,
        slotKeys: groomingCoveredSlots(input.startAt, row.durationMinutes).map(groomingSlotKey)
      }));
      const longestMinutes = Math.max(...pets.map(pet => pet.durationMinutes));
      const slot = { startAt: input.startAt, endAt: new Date(input.startAt.getTime() + longestMinutes * 60000),
        localDate: groomingLocalDate(input.startAt), startLocalTime: groomingLocalTime(input.startAt) };

      await assertPetsFree(pets, session);
      const services = [...new Set(input.pets.flatMap(row => row.serviceIds))];
      let roster = await shiftSource.openRoster({ serviceIds: services, from: slot.startAt, to: slot.endAt, session });
      const selected = assertGroomingReservations(roster, pets, slot.startAt);
      for (const sitterId of [...selected].sort()) await employee.employeeGuard(sitterId, session);
      // Guard writes serialize with home assignment, availability, leave, profile
      // and employment mutations. Retry recomputes capacity and price from scratch.
      roster = await shiftSource.openRoster({ serviceIds: services, from: slot.startAt, to: slot.endAt, session });
      const verified = assertGroomingReservations(roster, pets, slot.startAt);
      if (verified.some((id, index) => id !== selected[index])) throw slotTaken(input.startAt);
      pets.forEach((pet, index) => { pet.reservedSitterId = new Types.ObjectId(selected[index]); });
      const at = new Date(now);
      const doc = new GroomingAppointment({
        code, customerId: owner, slot, status: 'BOOKED', pets,
        tier: { code: priced.tier.code, discountBps: priced.tier.discountBps, discountBlockedReason: priced.tier.blockedReason,
          ...(priced.tier.policyVersion ? { policyVersion: priced.tier.policyVersion } : {}) },
        pricing: { subtotalVnd: priced.subtotalVnd, tierDiscountVnd: priced.tierDiscountVnd, totalVnd: priced.totalVnd, currency: 'VND' },
        shop: { address }, bookedAt: at
      });
      const plain = doc.toObject();
      const view = toGroomingAppointmentView(plain, contact);
      doc.requestReceipt = { key: commandId, fingerprint, result: view };
      await doc.validate();
      await GroomingAppointment.collection.insertOne(doc.toObject(), { session });
      return view;
    });
    // Receipt/code uniqueness conflicts retry the transaction and read the committed receipt.
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (error?.code !== 11000 || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }

  // Customer cancellation (UC-58 postcondition, GBR-40): free until 2 hours before startAt.
  // Uses the same customer -> pet -> employee guard order as booking so concurrent bookings
  // and cancellations serialize cleanly without corrupting held places.
  async function cancel(customerId, appointmentId, body) {
    groomingCancelInput(body);
    const id = groomingAppointmentId(appointmentId);
    if (!id) throw notFound();
    const owner = new Types.ObjectId(String(customerId));
    const run = () => uow.run(async session => {
      const customer = await connection.db.collection('users').findOneAndUpdate(
        { _id: owner, state: 'ACTIVE', roles: 'CUSTOMER', synthetic: { $ne: true } },
        { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' }
      );
      if (!customer) fail('FORBIDDEN', 'Current customer account required', 403);
      const doc = await GroomingAppointment.findOne({ _id: id, customerId: owner }).session(session).lean();
      if (!doc) throw notFound();
      if (doc.status !== 'BOOKED') throw notCancellable(doc.status);
      const now = clock();
      if (doc.slot.startAt.getTime() - now < CANCEL_LEAD_MS) throw cancelTooLate(doc.slot.startAt, contact);
      const petIds = [...new Set(doc.pets.map(pet => String(pet.petId)))].sort();
      for (const petId of petIds) {
        await Pet.collection.updateOne({ _id: new Types.ObjectId(petId), ownerId: owner }, { $inc: { bookingGuard: 1 } }, { session });
      }
      const sitterIds = [...new Set(doc.pets
        .filter(pet => pet.reservedSitterId && pet.status !== GROOMING_RELEASED_PET_STATUS)
        .map(pet => String(pet.reservedSitterId)))].sort();
      for (const sitterId of sitterIds) {
        await PayrollMonthGuard.findOneAndUpdate({ _id: `employee:${sitterId}` }, { $inc: { version: 1 } }, { upsert: true, session });
      }
      const at = new Date(now);
      const updated = await GroomingAppointment.findOneAndUpdate(
        { _id: id, customerId: owner, status: 'BOOKED', version: doc.version ?? 0 },
        {
          $set: {
            status: 'CANCELLED',
            closedAt: at,
            cancellation: { at, byRole: 'CUSTOMER', byUserId: owner },
            'pets.$[].status': GROOMING_RELEASED_PET_STATUS
          },
          $inc: { version: 1 }
        },
        { session, returnDocument: 'after' }
      ).lean();
      if (!updated) throw notCancellable(doc.status);
      return toGroomingAppointmentView(updated, contact);
    });
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
    cancel,
    async list(customerId, query) {
      const { page, limit, status, upcoming } = groomingListQuery(query);
      const now = clock();
      const filter = {
        customerId: new Types.ObjectId(String(customerId)),
        ...(upcoming ? { status: status ?? 'BOOKED', 'slot.startAt': { $gte: new Date(now) } } : (status ? { status } : {}))
      };
      const sort = upcoming ? { 'slot.startAt': 1, _id: 1 } : { 'slot.startAt': -1, _id: -1 };
      const result = await paginate(GroomingAppointment, { filter, page, limit, sort });
      return {
        ...result,
        items: result.items.map(doc => toGroomingAppointmentView(doc, contact)),
        ...(upcoming ? { serverNow: new Date(now).toISOString() } : {})
      };
    },
    async read(customerId, appointmentId) {
      const id = groomingAppointmentId(appointmentId);
      const doc = id && await GroomingAppointment.findOne({ _id: id, customerId: new Types.ObjectId(String(customerId)) }).lean();
      if (!doc) throw notFound();
      return toGroomingAppointmentView(doc, contact);
    }
  };
}
