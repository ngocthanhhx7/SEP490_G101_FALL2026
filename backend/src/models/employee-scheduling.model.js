import { Schema } from 'mongoose';

export function employeeSchedulingModels(connection) {
  const options = { strict: 'throw', bufferCommands: false, versionKey: false };
  const availability = new Schema({ _id: String, zone: String, workingWindows: [Schema.Types.Mixed],
    areas: [String], dayOffDates: [String], state: String, version: Number, effectiveFrom: String }, options);
  const revision = new Schema({ sitterId: String, effectiveFrom: String, version: Number,
    workingWindows: [Schema.Types.Mixed] }, options);
  revision.index({ sitterId: 1, effectiveFrom: -1, version: -1 }, { unique: true });
  const command = new Schema({ _id: String, fingerprint: String, result: Schema.Types.Mixed, createdAt: Date }, options);
  const offer = new Schema({ visitId: Schema.Types.ObjectId, sitterId: String, state: String, version: Number,
    offeredAt: Date, deadline: Date, startAt: Date, endAt: Date, serviceName: String, areaCode: String,
    pets: [Schema.Types.Mixed], decidedAt: Date }, options);
  offer.index({ sitterId: 1, _id: -1 });
  offer.index({ visitId: 1, state: 1, deadline: 1 });
  const event = new Schema({ type: String, actorId: String, sitterId: String, visitId: String,
    offerId: String, at: Date, detail: Schema.Types.Mixed }, options);
  const proposal = new Schema({ customerId: String, bookingId: String, visitId: String, sitterId: String,
    slots: [Schema.Types.Mixed], availabilityVersion: Number, visitVersion: Number, state: String, version: Number,
    expiresAt: Date, priceSnapshot: Schema.Types.Mixed, petSnapshots: [Schema.Types.Mixed], paymentState: String,
    paymentRequired: Boolean, createdBy: String, createdAt: Date, confirmedAt: Date, selectedSlot: Schema.Types.Mixed }, options);
  proposal.index({ customerId: 1, createdAt: -1, _id: -1 });
  const definitions = { EmployeeAvailability: availability, EmployeeAvailabilityRevision: revision,
    EmployeeScheduleCommand: command, EmployeeVisitOffer: offer, EmployeeScheduleEvent: event, EmployeeScheduleProposal: proposal };
  return Object.fromEntries(Object.entries(definitions).map(([name, schema]) => [name,
    connection.models[name] ?? connection.model(name, schema)]));
}
