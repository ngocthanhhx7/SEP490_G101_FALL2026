import mongoose from 'mongoose';

const { Schema } = mongoose;

const registrationOtpSchema = new Schema({
  registrationId: { type: Schema.Types.ObjectId, ref: 'PendingRegistration', required: true },
  codeVerifier: { type: String, required: true },
  status: {
    type: String,
    enum: ['DELIVERY_PENDING', 'ACTIVE', 'CONSUMED', 'INVALIDATED'],
    required: true,
  },
  issuedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  deleteAt: { type: Date, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'registration_otps' });

registrationOtpSchema.index({ registrationId: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'ACTIVE' },
  name: 'uniq_active_otp_per_registration',
});
registrationOtpSchema.index({ registrationId: 1, createdAt: -1 }, {
  name: 'otp_registration_history',
});
registrationOtpSchema.index({ deleteAt: 1 }, {
  expireAfterSeconds: 0,
  name: 'ttl_registration_otp_cleanup',
});

export const RegistrationOtp = mongoose.models.RegistrationOtp
  ?? mongoose.model('RegistrationOtp', registrationOtpSchema);
