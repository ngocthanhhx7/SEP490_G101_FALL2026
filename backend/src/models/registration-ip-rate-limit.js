import mongoose from 'mongoose';

const { Schema } = mongoose;

const registrationIpRateLimitSchema = new Schema({
  ipHash: { type: String, required: true },
  endpoint: {
    type: String,
    enum: ['REGISTER', 'RESEND', 'VERIFY', 'LOGIN_REQUEST', 'LOGIN_VERIFY', 'SITTER_APPLICATION', 'SITTER_RESEND', 'SITTER_VERIFY'],
    required: true,
  },
  bucketKey: { type: String, required: true },
  requestTimestamps: { type: [Date], default: [] },
  lastAttemptId: { type: String, default: null, select: false },
  lastAttemptAllowed: { type: Boolean, default: null, select: false },
  lastRequestAt: { type: Date, default: null, select: false },
}, { timestamps: true, collection: 'registration_ip_rate_limits' });

registrationIpRateLimitSchema.index({ bucketKey: 1 }, {
  unique: true,
  name: 'uniq_ip_endpoint_bucket',
});
registrationIpRateLimitSchema.index({ updatedAt: 1 }, {
  expireAfterSeconds: 3_600,
  name: 'ttl_ip_rate_limit_idle_bucket',
});

export const RegistrationIpRateLimit = mongoose.models.RegistrationIpRateLimit
  ?? mongoose.model('RegistrationIpRateLimit', registrationIpRateLimitSchema);
