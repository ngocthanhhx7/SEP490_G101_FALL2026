import { AppError } from '../../utils/app-error.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REAPPLY_DELAY_MS = 30 * DAY_MS;
const APPLICATION_CODE = /^[A-Za-z0-9_-]{22,128}$/;
const CHALLENGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OTP_CODE = /^\d{6}$/;
const PUBLIC_STATES = new Set(['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED']);

function invalidRequest() {
  throw new AppError(422, 'VALIDATION_FAILED', 'Application status request is invalid');
}

function unverifiable() {
  return new AppError(401, 'APPLICATION_STATUS_VERIFICATION_FAILED', 'Application status could not be verified');
}

function statusUnavailable() {
  return new AppError(503, 'APPLICATION_STATUS_UNAVAILABLE', 'Application status is temporarily unavailable');
}

function normalizePortError(error, fallback) {
  if (error?.status === 429 || error?.code === 'OTP_RATE_LIMITED' || error?.code === 'RATE_LIMITED') {
    const retryAfter = Number(error?.details?.retryAfterSeconds);
    const details = Number.isFinite(retryAfter) && retryAfter > 0
      ? { retryAfterSeconds: Math.min(3600, Math.ceil(retryAfter)) } : {};
    return new AppError(429, 'RATE_LIMITED', 'Please wait before trying again', details);
  }
  if (error?.status >= 500 || error?.code === 'PROVIDER_UNAVAILABLE') return statusUnavailable();
  return fallback();
}

function hasOnlyKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.has(key))
    && [...keys].every(key => Object.hasOwn(value, key));
}

function parseDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function publicProjection(record, now) {
  if (!record || typeof record !== 'object' || !PUBLIC_STATES.has(record.state)) throw statusUnavailable();
  const submittedAt = parseDate(record.submittedAt);
  if (!submittedAt) throw statusUnavailable();

  const result = {
    state: record.state,
    submittedAt: submittedAt.toISOString(),
    rejectionReason: null,
    reapplyEligibleAt: null,
    canReapply: false
  };

  if (record.state !== 'REJECTED') return Object.freeze(result);

  const rejectedAt = parseDate(record.rejectedAt);
  const eligibleAt = rejectedAt && new Date(rejectedAt.getTime() + REAPPLY_DELAY_MS);
  if (!eligibleAt || (record.reapplyAt && parseDate(record.reapplyAt)?.getTime() !== eligibleAt.getTime())) {
    throw statusUnavailable();
  }
  if (record.decisionReason !== null && record.decisionReason !== undefined
    && (typeof record.decisionReason !== 'string' || record.decisionReason.length > 1000
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(record.decisionReason))) {
    throw statusUnavailable();
  }

  result.rejectionReason = typeof record.decisionReason === 'string' ? record.decisionReason : null;
  result.reapplyEligibleAt = eligibleAt.toISOString();
  result.canReapply = now >= eligibleAt.getTime();
  return Object.freeze(result);
}

/**
 * Application status access is deliberately composed from two narrow ports:
 * the OTP port must bind and consume its challenge to this application, while
 * the repository must return only the applicant-facing status projection.
 * Neither port is implemented here; P06/P16/P34 own those integrations.
 */
export function createApplicationStatusService({ applications, statusOtp, clock = Date.now } = {}) {
  if (typeof applications?.findApplicantStatusById !== 'function'
    || typeof statusOtp?.beginForApplication !== 'function'
    || typeof statusOtp?.verifyForApplication !== 'function'
    || typeof clock !== 'function') {
    throw new TypeError('Application status repository, scoped OTP port and clock are required');
  }

  async function requestVerification(input) {
    if (!hasOnlyKeys(input, new Set(['applicationCode']))
      || typeof input.applicationCode !== 'string' || !APPLICATION_CODE.test(input.applicationCode)) invalidRequest();

    let challenge;
    try {
      challenge = await statusOtp.beginForApplication({
        applicationCode: input.applicationCode,
        purpose: 'APPLICATION_STATUS'
      });
    } catch (error) {
      throw normalizePortError(error, statusUnavailable);
    }
    if (!challenge || typeof challenge.challengeId !== 'string' || !CHALLENGE_ID.test(challenge.challengeId)
      || !Number.isSafeInteger(challenge.expiresInSeconds) || challenge.expiresInSeconds < 1
      || !Number.isSafeInteger(challenge.resendAfterSeconds) || challenge.resendAfterSeconds < 0) {
      throw statusUnavailable();
    }

    // The port must return the same shape for unknown and known codes and
    // enforce cooldown, send limits and lockout by application on the server.
    return Object.freeze({
      status: 'PENDING',
      challengeId: challenge.challengeId,
      expiresInSeconds: challenge.expiresInSeconds,
      resendAfterSeconds: challenge.resendAfterSeconds
    });
  }

  async function verifyAndReadStatus(input) {
    if (!hasOnlyKeys(input, new Set(['applicationCode', 'challengeId', 'code']))
      || typeof input.applicationCode !== 'string' || !APPLICATION_CODE.test(input.applicationCode)
      || typeof input.challengeId !== 'string' || !CHALLENGE_ID.test(input.challengeId)
      || typeof input.code !== 'string' || !OTP_CODE.test(input.code)) invalidRequest();

    let proof;
    try {
      proof = await statusOtp.verifyForApplication({
        applicationCode: input.applicationCode,
        challengeId: input.challengeId,
        code: input.code,
        purpose: 'APPLICATION_STATUS'
      });
    } catch (error) {
      throw normalizePortError(error, unverifiable);
    }
    if (proof?.verified !== true || typeof proof.applicationId !== 'string' || !proof.applicationId) {
      throw unverifiable();
    }

    let record;
    try {
      record = await applications.findApplicantStatusById({ applicationId: proof.applicationId });
    } catch {
      throw statusUnavailable();
    }
    if (!record) throw unverifiable();
    const now = clock();
    if (!Number.isFinite(now)) throw new TypeError('clock must return a timestamp');
    return publicProjection(record, now);
  }

  return Object.freeze({ requestVerification, verifyAndReadStatus });
}
