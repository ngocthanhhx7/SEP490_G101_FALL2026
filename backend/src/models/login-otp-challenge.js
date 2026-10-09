import mongoose from 'mongoose';

const loginOtpChallengeSchema = new mongoose.Schema({
  contactKey: { type: String, required: true },
  contactType: { type: String, enum: ['email', 'phone'], required: true },
  principalType: { type: String, enum: ['CUSTOMER', 'PET_SITTER_APPLICANT'], default: 'CUSTOMER', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  petSitterApplicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'PetSitterApplication', default: null },
  codeVerifier: { type: String, required: true, select: false },
  status: {
    type: String,
    enum: ['DELIVERY_PENDING', 'ACTIVE', 'CONSUMED', 'INVALIDATED', 'BLOCKED'],
    required: true,
  },
  attempts: { type: Number, min: 0, default: 0, required: true },
  issuedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
  deleteAt: { type: Date, required: true },
}, { timestamps: true, collection: 'login_otp_challenges' });

loginOtpChallengeSchema.pre('validate', function validatePrincipal(next) {
  const hasCustomer = Boolean(this.customerId);
  const hasApplication = Boolean(this.petSitterApplicationId);
  if (hasCustomer === hasApplication
    || (this.principalType === 'CUSTOMER' && !hasCustomer)
    || (this.principalType === 'PET_SITTER_APPLICANT' && !hasApplication)) {
    this.invalidate('principalType', 'Exactly one matching login principal is required');
  }
  next();
});

loginOtpChallengeSchema.index({ contactKey: 1, issuedAt: -1 }, { name: 'login_challenge_by_contact' });
loginOtpChallengeSchema.index({ contactKey: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'ACTIVE' },
  name: 'uniq_active_login_challenge_per_contact',
});
loginOtpChallengeSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_login_challenges' });

export const LoginOtpChallenge = mongoose.models.LoginOtpChallenge
  ?? mongoose.model('LoginOtpChallenge', loginOtpChallengeSchema);
