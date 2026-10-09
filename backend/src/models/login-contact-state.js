import mongoose from 'mongoose';

const loginContactStateSchema = new mongoose.Schema({
  contactKey: { type: String, required: true },
  lastOtpSentAt: { type: Date, default: null },
  otpSendTimestamps: { type: [Date], default: [] },
  sendReservation: { type: String, default: null, select: false },
  sendReservationExpiresAt: { type: Date, default: null, select: false },
}, { timestamps: true, collection: 'login_contact_states' });

loginContactStateSchema.index({ contactKey: 1 }, { unique: true, name: 'uniq_login_contact_state' });
loginContactStateSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86_400, name: 'ttl_login_contact_state' });

export const LoginContactState = mongoose.models.LoginContactState
  ?? mongoose.model('LoginContactState', loginContactStateSchema);
