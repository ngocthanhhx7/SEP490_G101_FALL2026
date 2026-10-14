import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../utils/app-error.js';
import { identityModels } from '../models/identity.model.js';
import { userModel as createUserModel } from '../models/user.model.js';
import { createContactChangeAuditService } from './contact-change-audit.service.js';
import { canonicalizeContact } from './contact-crypto.service.js';

const CODE_LIFETIME_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;
const MAX_CODES_PER_HOUR = 5;
const MAX_FAILED_ATTEMPTS = 5;
const CONTACT_LOCK_MS = 15 * 60 * 1000;
const PURPOSES = new Set(['REGISTER', 'LOGIN', 'CONTACT_CHANGE']);

function secret(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < 32) {
    throw new TypeError('otpSecret must contain at least 32 bytes');
  }
  return Buffer.from(value, 'utf8');
}

function safeEqual(left, right) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function invalidOtp() {
  return new AppError(400, 'OTP_INVALID_OR_EXPIRED', 'Verification could not be completed');
}

function limitedOtp(retryAfterMs) {
  throw new AppError(429, 'OTP_RATE_LIMITED', 'Please wait before requesting or entering another code', {
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
  });
}

export function createOtpService({ connection, User, models = identityModels(connection), contactDelivery,
  sessionService, contactCrypto, otpSecret, clock = Date.now, createId = randomUUID,
  createCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
  verificationHandlers = {}, logger = () => {} }) {
  const hmacKey = secret(otpSecret);
  const userStore = User ?? createUserModel(connection);
  const contactAudit = createContactChangeAuditService({ connection });
  if (typeof contactDelivery?.send !== 'function' || typeof sessionService?.issueInTransaction !== 'function'
    || typeof contactCrypto?.lookup !== 'function' || typeof contactCrypto?.encrypt !== 'function'
    || typeof clock !== 'function' || typeof createId !== 'function' || typeof createCode !== 'function'
    || !verificationHandlers || typeof verificationHandlers !== 'object' || typeof logger !== 'function') {
    throw new TypeError('Invalid OTP service dependencies');
  }

  const lookup = (channel, value) => {
    const result = contactCrypto.lookup(channel, canonicalizeContact(channel, value));
    return { canonicalValue: result.canonicalValue, contactLookup: result.lookupKey };
  };
  const codeDigest = ({ challengeId, contactLookup, purpose, code }) => createHmac('sha256', hmacKey)
    .update(`otp\0${challengeId}\0${contactLookup}\0${purpose}\0${code}`).digest('hex');

  async function begin({ channel, contact, purpose, actor } = {}) {
    if (!PURPOSES.has(purpose)) throw new AppError(422, 'VALIDATION_FAILED', 'OTP request is invalid');
    if (purpose === 'CONTACT_CHANGE' && (!actor?.sessionId || !Types.ObjectId.isValid(actor?.userId))) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    const { canonicalValue, contactLookup } = lookup(channel, contact);
    if (purpose === 'CONTACT_CHANGE') {
      const linkedElsewhere = await models.Contact.exists({
        channel, lookupKey: contactLookup, state: 'VERIFIED', userId: { $ne: new Types.ObjectId(actor.userId) }
      });
      if (linkedElsewhere) throw new AppError(409, 'CONTACT_UNAVAILABLE', 'Contact verification could not be started');
    }
    const now = clock();
    const challengeId = createId();
    const code = createCode();
    if (typeof challengeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)
      || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('Secure OTP generation failed');
    const expiresAt = new Date(now + CODE_LIFETIME_MS);

    async function reserveChallenge() {
      return connection.transaction(async mongoSession => {
        const throttle = await models.OtpThrottle.findOne({ contactLookup }).select('+contactLookup').session(mongoSession).lean();
        const lockedUntil = throttle?.lockedUntil?.getTime?.() ?? 0;
        if (lockedUntil > now) limitedOtp(lockedUntil - now);
        const priorFailureCount = lockedUntil && lockedUntil <= now ? 0 : (throttle?.failedCount ?? 0);
        const sentAt = (throttle?.sentAt ?? []).map(value => new Date(value).getTime()).filter(value => value > now - HOURLY_WINDOW_MS);
        const lastSentAt = throttle?.lastSentAt ? new Date(throttle.lastSentAt).getTime() : 0;
        if (lastSentAt && lastSentAt + RESEND_COOLDOWN_MS > now) limitedOtp(lastSentAt + RESEND_COOLDOWN_MS - now);
        if (sentAt.length >= MAX_CODES_PER_HOUR) limitedOtp(sentAt[0] + HOURLY_WINDOW_MS - now);

        await models.OtpChallenge.updateMany({
          contactLookup, purpose, usedAt: null
        }, { $set: { usedAt: new Date(now), invalidationReason: 'RESENT' } }, { session: mongoSession });
        await models.OtpChallenge.create([{
          challengeId, contactLookup, channel, purpose,
          codeDigest: codeDigest({ challengeId, contactLookup, purpose, code }),
          expiresAt, resendAt: new Date(now + RESEND_COOLDOWN_MS),
          failedCount: 0, requesterSessionId: purpose === 'CONTACT_CHANGE' ? actor.sessionId : null,
          requesterUserId: purpose === 'CONTACT_CHANGE' ? actor.userId : null,
          usedAt: null, invalidationReason: null
        }], { session: mongoSession });
        await models.OtpThrottle.updateOne({ contactLookup }, {
          $set: {
            sentAt: [...sentAt.map(value => new Date(value)), new Date(now)], lastSentAt: new Date(now),
            failedCount: priorFailureCount, lockedUntil: null, expiresAt: new Date(now + HOURLY_WINDOW_MS)
          }
        }, { upsert: true, session: mongoSession });
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    }
    try { await reserveChallenge(); }
    catch (error) {
      // A concurrent first send can race on the unique throttle key; re-read policy once.
      if (error?.code !== 11000) throw error;
      await reserveChallenge();
    }

    let delivery;
    try {
      delivery = await contactDelivery.send({
        kind: 'OTP', channel, to: canonicalValue, purpose, operationId: challengeId,
        code, expiresAt: expiresAt.toISOString()
      });
    } catch {
      delivery = { status: 'FAILED', code: 'PROVIDER_UNAVAILABLE' };
    }
    try { logger({ event: 'OTP_DELIVERY', status: delivery?.status ?? 'FAILED', code: delivery?.code ?? 'PROVIDER_ERROR' }); } catch { /* never let logging affect authentication */ }
    if (delivery?.status !== 'ACCEPTED') {
      await models.OtpChallenge.updateOne({ challengeId, usedAt: null }, {
        $set: { usedAt: new Date(clock()), invalidationReason: 'DELIVERY_FAILED' }
      });
      if (purpose === 'CONTACT_CHANGE') {
        throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Contact verification could not be started');
      }
    }
    return Object.freeze({ status: 'PENDING', challengeId, expiresInSeconds: 300, resendAfterSeconds: 60 });
  }

  async function verify({ challengeId, channel, contact, purpose, code, displayName, policyVersions, actor } = {}) {
    if (typeof challengeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)
      || !PURPOSES.has(purpose) || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      throw new AppError(422, 'VALIDATION_FAILED', 'OTP verification request is invalid');
    }
    if (purpose === 'CONTACT_CHANGE' && (!actor?.sessionId || !actor?.userId)) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    if (purpose === 'REGISTER' && typeof verificationHandlers.REGISTER !== 'function') {
      throw new AppError(503, 'REGISTRATION_UNAVAILABLE', 'Customer registration is not configured');
    }
    const { canonicalValue, contactLookup } = lookup(channel, contact);
    const now = clock();

    let outcome;
    try {
      outcome = await connection.transaction(async mongoSession => {
      const throttle = await models.OtpThrottle.findOne({ contactLookup }).select('+contactLookup').session(mongoSession).lean();
      const lockedUntil = throttle?.lockedUntil?.getTime?.() ?? 0;
      if (lockedUntil > now) return { failure: 'RATE_LIMITED', retryAfterMs: lockedUntil - now };
      const challenge = await models.OtpChallenge.findOne({
        challengeId, contactLookup, purpose, usedAt: null
      }).select('+contactLookup +codeDigest +requesterSessionId +requesterUserId').session(mongoSession).lean();
      if (!challenge) return { failure: 'INVALID' };
      if (challenge.expiresAt.getTime() <= now) {
        await models.OtpChallenge.updateOne({ _id: challenge._id, usedAt: null }, {
          $set: { usedAt: new Date(now), invalidationReason: 'EXPIRED' }
        }, { session: mongoSession });
        return { failure: 'INVALID' };
      }
      if (challenge.requesterSessionId && (challenge.requesterSessionId !== actor?.sessionId
        || challenge.requesterUserId !== actor?.userId)) return { failure: 'INVALID' };

      const expected = codeDigest({ challengeId, contactLookup, purpose, code });
      if (!safeEqual(challenge.codeDigest, expected)) {
        const failedCount = (throttle?.failedCount ?? 0) + 1;
        const locked = failedCount >= MAX_FAILED_ATTEMPTS;
        const lockedUntilAt = locked ? new Date(now + CONTACT_LOCK_MS) : null;
        await models.OtpChallenge.updateOne({ _id: challenge._id, usedAt: null }, {
          $set: { failedCount, ...(locked ? { usedAt: new Date(now), invalidationReason: 'LOCKED' } : {}) }
        }, { session: mongoSession });
        await models.OtpThrottle.updateOne({ contactLookup }, {
          $set: { failedCount, lockedUntil: lockedUntilAt, expiresAt: new Date(now + HOURLY_WINDOW_MS) }
        }, { upsert: true, session: mongoSession });
        if (locked) {
          await models.OtpChallenge.updateMany({ contactLookup, usedAt: null }, {
            $set: { usedAt: new Date(now), invalidationReason: 'LOCKED' }
          }, { session: mongoSession });
        }
        return { failure: 'INVALID' };
      }

      const consumed = await models.OtpChallenge.updateOne({ _id: challenge._id, usedAt: null }, {
        $set: { usedAt: new Date(now) }
      }, { session: mongoSession });
      if (consumed.modifiedCount !== 1) return { failure: 'INVALID' };
      await models.OtpThrottle.updateOne({ contactLookup }, {
        $set: { failedCount: 0, lockedUntil: null, expiresAt: new Date(now + HOURLY_WINDOW_MS) }
      }, { upsert: true, session: mongoSession });

      if (purpose === 'LOGIN') {
        const contactRecord = await models.Contact.findOne({ channel, lookupKey: contactLookup, state: 'VERIFIED' })
          .select('+lookupKey').session(mongoSession).lean();
        if (!contactRecord) return { result: Object.freeze({ status: 'VERIFIED', authenticated: false }) };
        const user = await userStore.findById(contactRecord.userId).session(mongoSession);
        if (!user || user.state !== 'ACTIVE' || user.synthetic === true) return { result: Object.freeze({ status: 'VERIFIED', authenticated: false }) };
        const session = await sessionService.issueInTransaction(user, mongoSession);
        return { result: Object.freeze({ status: 'VERIFIED', authenticated: true, session }) };
      }

      const handler = verificationHandlers[purpose];
      if (handler && typeof handler !== 'function') throw new TypeError('Invalid OTP verification handler');
      if (handler) {
        const result = await handler({
          channel, canonicalValue, contactLookup, challengeId, displayName, policyVersions, actor, session: mongoSession, now
        });
        if (purpose === 'REGISTER') {
          if (!result?.session) throw new AppError(503, 'REGISTRATION_UNAVAILABLE', 'Customer registration is not configured');
          return { result: Object.freeze({ status: 'VERIFIED', authenticated: true, session: result.session }) };
        }
        return { result: Object.freeze({ status: 'VERIFIED', authenticated: false }) };
      }
      if (purpose === 'CONTACT_CHANGE') {
        if (!Types.ObjectId.isValid(actor.userId)) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
        const owner = await userStore.findOne({ _id: actor.userId, state: 'ACTIVE' }).session(mongoSession).lean();
        if (!owner || owner.authEpoch === undefined) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
        const activeSession = await models.AuthSession.findOne({
          sessionId: actor.sessionId, userId: owner._id, revokedAt: null, expiresAt: { $gt: new Date(now) }
        }).session(mongoSession).lean();
        if (!activeSession || activeSession.authEpochAtIssue !== owner.authEpoch) {
          throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
        }
        const existing = await models.Contact.findOne({ channel, lookupKey: contactLookup, state: 'VERIFIED' })
          .select('+lookupKey').session(mongoSession).lean();
        if (existing?.userId?.toString() === actor.userId) {
          return { result: Object.freeze({ status: 'VERIFIED', authenticated: false }) };
        }
        if (existing) return { failure: 'CONTACT_UNAVAILABLE' };
        const previousContacts = await models.Contact.find({ userId: owner._id, channel, state: 'VERIFIED' })
          .select('_id').session(mongoSession).lean();
        await models.Contact.updateMany({ userId: owner._id, channel, state: 'VERIFIED' }, {
          $set: { state: 'REPLACED' }
        }, { session: mongoSession });
        const [createdContact] = await models.Contact.create([{
          userId: owner._id, channel, canonicalCiphertext: contactCrypto.encrypt(canonicalValue),
          lookupKey: contactLookup, state: 'VERIFIED', verifiedAt: new Date(now)
        }], { session: mongoSession });
        await contactAudit.record({
          eventId: challengeId,
          actorId: owner._id.toString(),
          contactId: createdContact._id.toString(),
          action: previousContacts.length ? 'CONTACT_REPLACED' : 'CONTACT_LINKED',
          channel,
          occurredAt: new Date(now),
          session: mongoSession
        });
        return { result: Object.freeze({ status: 'VERIFIED', authenticated: false }) };
      }
      return { result: Object.freeze({ status: 'VERIFIED', authenticated: false }) };
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) {
      if (purpose === 'CONTACT_CHANGE' && error?.code === 11000) {
        await models.OtpChallenge.updateOne({ challengeId, usedAt: null }, { $set: { usedAt: new Date(clock()) } });
        throw new AppError(409, 'CONTACT_UNAVAILABLE', 'Contact verification could not be completed');
      }
      throw error;
    }
    if (outcome.failure === 'CONTACT_UNAVAILABLE') {
      throw new AppError(409, 'CONTACT_UNAVAILABLE', 'Contact verification could not be completed');
    }
    if (outcome.failure === 'RATE_LIMITED') limitedOtp(outcome.retryAfterMs);
    if (outcome.failure) throw invalidOtp();
    return outcome.result;
  }

  return Object.freeze({ begin, verify });
}
