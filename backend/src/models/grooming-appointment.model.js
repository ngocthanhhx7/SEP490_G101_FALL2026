import { Schema } from 'mongoose';
import {
  GROOMING_APPOINTMENT_STATUSES, GROOMING_BITE_ANSWERS, GROOMING_DISCOUNT_BLOCK_REASONS, GROOMING_PET_STATUSES, GROOMING_SKIN_ANSWERS
} from '../constants/grooming.js';

const oid = Schema.Types.ObjectId;
const money = { type: Number, min: 0, validate: Number.isSafeInteger };
const count = { type: Number, min: 0, validate: Number.isSafeInteger };
const embedded = { _id: false, strict: 'throw' };
const options = { strict: 'throw', bufferCommands: false, versionKey: false };

// Collection names are explicit: renaming a model must never create an empty replacement collection.
export const GROOMING_COLLECTIONS = Object.freeze({
  appointments: 'groomingappointments', slots: 'groomingslots', commands: 'groomingcommands', counters: 'groomingcounters'
});

// One document per appointment; Grooming Pet (I.3) is embedded so one pet can change through arrayFilters
// while the whole appointment stays one atomic unit.
// Grooming Booking writes: code, customerId, slot, tier, pricing, shop, bookedAt and each pet up to
// finalPriceVnd, slotKeys and status. Check-in, work and payment fields are reserved for later use cases.
function appointmentSchema() {
  const service = new Schema({
    serviceId: { type: oid, required: true }, serviceVersion: count, name: { type: String, required: true, maxlength: 160 },
    durationMinutes: { ...count, required: true }, sizeLabel: { type: String, maxlength: 120 },
    priceVnd: { ...money, required: true }, priceVersion: count, policyVersion: count
  }, embedded);
  const snapshot = new Schema({
    name: { type: String, required: true, maxlength: 100 }, species: { type: String, enum: ['DOG', 'CAT'], required: true },
    breedCode: { type: String, maxlength: 80 }, weightKg: { type: Number, min: 0 }, petVersion: count
  }, embedded);
  // A "very risky" biting answer is never stored: that pet cannot be booked online.
  const answers = new Schema({
    biteOrScratch: { type: String, enum: GROOMING_BITE_ANSWERS.filter(value => value !== 'YES'), required: true },
    skinCondition: { type: String, enum: GROOMING_SKIN_ANSWERS, required: true }
  }, embedded);
  const pet = new Schema({
    petId: { type: oid, required: true }, petSnapshot: { type: snapshot, required: true },
    services: { type: [service], required: true }, answers: { type: answers, required: true },
    finalPriceVnd: { ...money, required: true }, durationMinutes: { ...count, required: true },
    slotKeys: { type: [String], required: true },
    status: { type: String, enum: GROOMING_PET_STATUSES, default: 'BOOKED', required: true },
    surchargeVnd: money, surchargeConsent: Boolean,
    checkInPhotos: [new Schema({ storageRef: { type: String, maxlength: 300 } }, embedded)],
    checkInCondition: { type: String, maxlength: 2000 }, confirmedDifficulty: { type: String, maxlength: 40 },
    assignedSitterId: oid, startedAt: Date, readyAt: Date, stoppedAt: Date, stopReason: { type: String, maxlength: 1000 },
    handedBack: Boolean,
    cancellation: new Schema({ at: Date, byStaffId: oid, reason: { type: String, maxlength: 1000 } }, embedded)
  }, { strict: 'throw' });
  const slot = new Schema({
    startAt: { type: Date, required: true }, endAt: { type: Date, required: true },
    localDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, startLocalTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ }
  }, embedded);
  const tier = new Schema({
    code: { type: String, enum: ['MEMBER', 'SILVER', 'GOLD', null] }, discountBps: { ...count, max: 10000 }, policyVersion: count,
    discountBlockedReason: { type: String, enum: [...GROOMING_DISCOUNT_BLOCK_REASONS, null] }
  }, embedded);
  const pricing = new Schema({
    subtotalVnd: { ...money, required: true }, tierDiscountVnd: { ...money, required: true }, totalVnd: { ...money, required: true },
    currency: { type: String, enum: ['VND'], required: true }
  }, embedded);
  const schema = new Schema({
    code: { type: String, required: true, match: /^GR-\d{4,}$/ },
    customerId: { type: oid, required: true },
    slot: { type: slot, required: true },
    status: { type: String, enum: GROOMING_APPOINTMENT_STATUSES, default: 'BOOKED', required: true },
    pets: { type: [pet], required: true, validate: value => value.length >= 1 && value.length <= 10 },
    tier: { type: tier, required: true }, pricing: { type: pricing, required: true },
    shop: { type: new Schema({ address: { type: String, required: true, maxlength: 500 } }, embedded), required: true },
    bookedAt: { type: Date, required: true },
    version: { ...count, default: 0 },
    checkIn: new Schema({ at: Date, byStaffId: oid }, embedded),
    noShow: new Schema({ at: Date, byStaffId: oid }, embedded),
    payment: new Schema({
      method: { type: String, enum: ['CASH', 'VIETQR'] }, paidAt: Date, amountVnd: money, tipVnd: money, cashGivenVnd: money,
      payosOrderCode: { type: String, maxlength: 80 }, receivedBy: oid
    }, embedded),
    closedAt: Date, handedBackAt: Date
  }, options);
  schema.index({ code: 1 }, { unique: true });
  schema.index({ customerId: 1, 'slot.startAt': -1 });
  schema.index({ 'slot.localDate': 1, status: 1, 'slot.startAt': 1 });
  schema.index({ 'pets.petId': 1, 'slot.startAt': 1 });
  return schema;
}

export function groomingModels(connection) {
  const define = (name, schema, collection) => connection.models[name] ?? connection.model(name, schema, collection);
  return {
    GroomingAppointment: define('GroomingAppointment', appointmentSchema(), GROOMING_COLLECTIONS.appointments),
    // One document per one-hour slot, keyed like 2026-11-05T10:00+07:00. Capacity is never stored here.
    GroomingSlot: define('GroomingSlot', new Schema({ _id: String, held: { ...count, required: true }, updatedAt: Date }, options), GROOMING_COLLECTIONS.slots),
    GroomingCommand: define('GroomingCommand', new Schema({
      _id: String, fingerprint: { type: String, required: true }, result: Schema.Types.Mixed, createdAt: { type: Date, required: true }
    }, options), GROOMING_COLLECTIONS.commands),
    GroomingCounter: define('GroomingCounter', new Schema({ _id: String, value: { ...count, required: true } }, options), GROOMING_COLLECTIONS.counters)
  };
}
