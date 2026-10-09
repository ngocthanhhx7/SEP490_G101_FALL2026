import mongoose from 'mongoose';

const { Schema } = mongoose;

const pendingRegistrationSchema = new Schema({
  fullName: { type: String, required: true, minlength: 2, maxlength: 100 },
  contactType: { type: String, enum: ['email', 'phone'], required: true, immutable: true },
  contactValue: { type: String, required: true, immutable: true },
  status: {
    type: String,
    enum: ['PENDING_VERIFICATION', 'COMPLETED'],
    default: 'PENDING_VERIFICATION',
    required: true,
  },
  contactStateId: { type: Schema.Types.ObjectId, ref: 'ContactVerificationState', required: true },
  registrationTokenHash: { type: String, required: true },
  wrongOtpAttempts: { type: Number, min: 0, default: 0, required: true },
  initialOtpIssuedAt: { type: Date, default: null },
  resendCount: { type: Number, min: 0, default: 0, required: true },
  verificationBlocked: { type: Boolean, default: false, required: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, collection: 'pending_registrations' });

pendingRegistrationSchema.index({ contactType: 1, contactValue: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'PENDING_VERIFICATION' },
  name: 'uniq_pending_contact',
});
pendingRegistrationSchema.index({ contactType: 1, contactValue: 1 }, {
  name: 'pending_contact_lookup_all_statuses',
});
pendingRegistrationSchema.index({ registrationTokenHash: 1 }, {
  unique: true,
  name: 'uniq_registration_token_hash',
});
pendingRegistrationSchema.index({ expiresAt: 1 }, {
  expireAfterSeconds: 0,
  name: 'ttl_pending_registration_expiry',
});

export const PendingRegistration = mongoose.models.PendingRegistration
  ?? mongoose.model('PendingRegistration', pendingRegistrationSchema);
