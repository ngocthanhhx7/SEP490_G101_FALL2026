import mongoose from 'mongoose';

const { Schema } = mongoose;

const contactVerificationStateSchema = new Schema({
  contactKey: { type: String, required: true },
  lastOtpSentAt: { type: Date, default: null },
  otpSendTimestamps: { type: [Date], default: [] },
  sendReservation: { type: String, default: null },
  sendReservationExpiresAt: { type: Date, default: null },
  revision: { type: Number, min: 0, default: 0, required: true },
}, { timestamps: true, collection: 'contact_verification_states' });

contactVerificationStateSchema.index({ contactKey: 1 }, {
  unique: true,
  name: 'uniq_contact_verification_key',
});

export const ContactVerificationState = mongoose.models.ContactVerificationState
  ?? mongoose.model('ContactVerificationState', contactVerificationStateSchema);
