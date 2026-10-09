import mongoose from 'mongoose';

const authSessionSchema = new mongoose.Schema({
  principalType: { type: String, enum: ['CUSTOMER', 'PET_SITTER_APPLICANT'], default: 'CUSTOMER', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  petSitterApplicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'PetSitterApplication', default: null },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'auth_sessions' });

authSessionSchema.index({ customerId: 1, expiresAt: 1 }, { name: 'auth_sessions_by_customer' });
authSessionSchema.index({ petSitterApplicationId: 1, expiresAt: 1 }, { name: 'auth_sessions_by_sitter_application' });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_auth_sessions' });

authSessionSchema.pre('validate', function validatePrincipal(next) {
  const hasCustomer = Boolean(this.customerId);
  const hasApplication = Boolean(this.petSitterApplicationId);
  if (hasCustomer === hasApplication
    || (this.principalType === 'CUSTOMER' && !hasCustomer)
    || (this.principalType === 'PET_SITTER_APPLICANT' && !hasApplication)) {
    this.invalidate('principalType', 'Exactly one matching login principal is required');
  }
  next();
});

export const AuthSession = mongoose.models.AuthSession
  ?? mongoose.model('AuthSession', authSessionSchema);
