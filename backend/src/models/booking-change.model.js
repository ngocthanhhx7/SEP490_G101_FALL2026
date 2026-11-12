import { Schema } from 'mongoose';

export function bookingChangeModels(connection) {
  const options = { strict: 'throw', versionKey: false, bufferCommands: false };
  const item = new Schema({
    visitId: String, oldVersion: Number, oldStartAt: Date, oldEndAt: Date, newStartAt: Date, newEndAt: Date
  }, { ...options, _id: false });
  const request = new Schema({
    bookingId: Schema.Types.ObjectId, customerId: Schema.Types.ObjectId, scope: String,
    items: [item], keptVisitIds: [String], removedVisitIds: [String], state: String,
    version: Number, sentAt: Date, expiresAt: Date, recheckAt: Date, resolvedAt: Date, resolvedBy: String
  }, options);
  request.index({ state: 1, expiresAt: 1, _id: 1 });
  request.index({ state: 1, recheckAt: 1, _id: 1 });
  request.index({ bookingId: 1, state: 1, expiresAt: 1, _id: 1 });
  const claim = new Schema({ _id: String, requestId: Schema.Types.ObjectId }, options);
  claim.index({ requestId: 1 });
  const command = new Schema({ _id: String, fingerprint: String, result: Schema.Types.Mixed }, options);
  const notice = new Schema({
    _id: String, requestId: Schema.Types.ObjectId, eventType: String, title: String, message: String,
    recipients: [Schema.Types.Mixed], deepLink: String, nextAttemptAt: Date, deliveredAt: Date
  }, options);
  notice.index({ deliveredAt: 1, nextAttemptAt: 1, _id: 1 });
  const definitions = {
    BookingChangeRequest: request, BookingChangeVisitClaim: claim, BookingChangeCommand: command, BookingChangeNotice: notice
  };
  return Object.fromEntries(Object.entries(definitions).map(([name, schema]) => [
    name, connection.models[name] ?? connection.model(name, schema)
  ]));
}
