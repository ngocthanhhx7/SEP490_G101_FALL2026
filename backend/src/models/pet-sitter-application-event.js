import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  applicationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  emailRef: { type: String, required: true },
  eventType: {
    type: String,
    enum: ['APPLICATION_CREATED', 'OTP_SEND_ACCEPTED', 'OTP_SEND_FAILED', 'OTP_INVALID', 'OTP_VERIFIED', 'APPLICATION_SUBMITTED', 'APPLICATION_CANCELLED'],
    required: true,
  },
  occurredAt: { type: Date, default: Date.now, required: true },
  outcome: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { versionKey: false, collection: 'pet_sitter_application_events' });

eventSchema.index({ applicationId: 1, occurredAt: -1 }, { name: 'sitter_application_event_timeline' });

export const PetSitterApplicationEvent = mongoose.models.PetSitterApplicationEvent
  ?? mongoose.model('PetSitterApplicationEvent', eventSchema);
