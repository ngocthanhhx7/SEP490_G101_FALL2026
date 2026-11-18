import { Schema } from 'mongoose';

export function bookingChangeModels(connection) {
  const options = { strict: 'throw', versionKey: false, bufferCommands: false };
  const item = new Schema({
    visitId: String, oldVersion: Number, oldStartAt: Date, oldEndAt: Date, newStartAt: Date, newEndAt: Date
  }, { ...options, _id: false });
  const request = new Schema({
    bookingId: Schema.Types.ObjectId, customerId: Schema.Types.ObjectId, scope: String,
    items: [item], pendingVisitIds: [String], keptVisitIds: [String], removedVisitIds: [String], state: String,
    version: Number, sentAt: Date, expiresAt: Date, recheckAt: Date, resolvedAt: Date, resolvedBy: String
  }, options);
  request.index({ state: 1, expiresAt: 1, _id: 1 });
  request.index({ state: 1, recheckAt: 1, _id: 1 });
  request.index({ bookingId: 1, state: 1, expiresAt: 1, _id: 1 });
  // A visit can belong to only one pending customer request. Terminal requests
  // keep their historical items without holding the visit.
  request.index({ pendingVisitIds: 1 }, { unique: true, partialFilterExpression: { state: 'PENDING' } });
  return { BookingChangeRequest: connection.models.BookingChangeRequest
    ?? connection.model('BookingChangeRequest', request, 'bookingchangerequests') };
}
