import mongoose from 'mongoose';

const { Schema } = mongoose;

const registrationEventSchema = new Schema({
  eventType: {
    type: String,
    enum: [
      'REGISTRATION_CREATED',
      'OTP_SEND_ACCEPTED',
      'OTP_SEND_FAILED',
      'OTP_INVALID',
      'OTP_ATTEMPTS_EXHAUSTED',
      'REGISTRATION_COMPLETED',
      'PERSISTENCE_FAILURE',
    ],
    required: true,
  },
  registrationId: { type: Schema.Types.ObjectId, default: null },
  contactRef: { type: String, default: null },
  occurredAt: { type: Date, default: Date.now, required: true },
  correlationId: { type: String, default: null },
  outcome: { type: Schema.Types.Mixed, default: {} },
}, { versionKey: false, collection: 'registration_events' });

registrationEventSchema.index({ registrationId: 1, occurredAt: -1 }, {
  name: 'registration_event_timeline',
});

export const RegistrationEvent = mongoose.models.RegistrationEvent
  ?? mongoose.model('RegistrationEvent', registrationEventSchema);
