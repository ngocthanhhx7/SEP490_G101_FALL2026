import { Schema } from 'mongoose';

export function identityModels(connection) {
  const contactSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    channel: { type: String, enum: ['EMAIL', 'PHONE'], required: true },
    canonicalCiphertext: { type: String, required: true, select: false },
    lookupKey: { type: String, required: true, select: false },
    state: { type: String, enum: ['VERIFIED', 'REPLACED'], required: true },
    verifiedAt: { type: Date, required: true }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  contactSchema.index({ channel: 1, lookupKey: 1 }, {
    unique: true, partialFilterExpression: { state: 'VERIFIED' }
  });

  const otpChallengeSchema = new Schema({
    challengeId: { type: String, required: true },
    contactLookup: { type: String, required: true, select: false },
    channel: { type: String, enum: ['EMAIL', 'PHONE'], required: true },
    purpose: { type: String, enum: ['REGISTER', 'LOGIN', 'CONTACT_CHANGE', 'APPLICATION_STATUS'], required: true },
    codeDigest: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    resendAt: { type: Date, required: true },
    failedCount: { type: Number, required: true, min: 0, default: 0 },
    requesterSessionId: { type: String, default: null, select: false },
    requesterUserId: { type: String, default: null, select: false },
    usedAt: { type: Date, default: null },
    invalidationReason: { type: String, enum: ['RESENT', 'EXPIRED', 'LOCKED', 'DELIVERY_FAILED', null], default: null }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  otpChallengeSchema.index({ challengeId: 1 }, { unique: true });
  otpChallengeSchema.index({ contactLookup: 1, purpose: 1, usedAt: 1, createdAt: -1 });
  otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const otpThrottleSchema = new Schema({
    contactLookup: { type: String, required: true, unique: true, select: false },
    sentAt: { type: [Date], default: [] },
    lastSentAt: { type: Date, default: null },
    failedCount: { type: Number, required: true, min: 0, default: 0 },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  otpThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const webPushSchema = new Schema({
    endpoint: String,
    keys: { p256dh: String, auth: String },
    endpointDigest: String,
    subscriptionId: String,
    since: Date,
    nextAt: Date
  }, { _id: false, strict: 'throw' });
  const sessionSchema = new Schema({
    webPush: { type: webPushSchema, select: false },
    sessionId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    tokenDigest: { type: String, required: true, select: false },
    csrfDigest: { type: String, required: true, select: false },
    authEpochAtIssue: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  sessionSchema.index({ sessionId: 1 }, { unique: true });
  sessionSchema.index({ tokenDigest: 1 }, { unique: true });
  sessionSchema.index({ 'webPush.endpointDigest': 1 }, {
    name: 'auth_session_push_endpoint', unique: true,
    partialFilterExpression: { 'webPush.endpointDigest': { $exists: true } }
  });
  sessionSchema.index({ 'webPush.nextAt': 1 }, {
    name: 'auth_session_push_due',
    partialFilterExpression: { revokedAt: null, 'webPush.nextAt': { $exists: true } }
  });
  // TTL is cleanup only; authenticate() always checks expiresAt and revokedAt.
  sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  return Object.freeze({
    Contact: connection.models.Contact ?? connection.model('Contact', contactSchema),
    OtpChallenge: connection.models.OtpChallenge ?? connection.model('OtpChallenge', otpChallengeSchema),
    OtpThrottle: connection.models.OtpThrottle ?? connection.model('OtpThrottle', otpThrottleSchema),
    AuthSession: connection.models.AuthSession ?? connection.model('AuthSession', sessionSchema)
  });
}
