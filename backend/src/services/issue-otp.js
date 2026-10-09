import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { ContactVerificationState } from '../models/contact-verification-state.js';
import { PendingRegistration } from '../models/pending-registration.js';
import { RegistrationOtp } from '../models/registration-otp.js';
import { RegistrationEvent } from '../models/registration-event.js';
import { getOtpProvider } from '../providers/index.js';
import { generateOtp, hmacOtp, maskDestination, sha256 } from '../utils/registration.js';

const OTP_RETENTION_MS = 24 * 60 * 60 * 1000;

export function makeContactKey(contactType, normalizedContact) {
  return sha256(`${contactType}:${normalizedContact}`);
}

function classifyReservationFailure(state, now, busyCode) {
  const timestamps = (state?.otpSendTimestamps ?? [])
    .map((timestamp) => new Date(timestamp))
    .filter((timestamp) => timestamp.getTime() >= now.getTime() - config.contactQuota.windowMs)
    .sort((left, right) => left - right);

  const reservationExpiresAt = state?.sendReservationExpiresAt
    ? new Date(state.sendReservationExpiresAt)
    : null;
  if (state?.sendReservation && reservationExpiresAt > now) {
    throw new AppError(busyCode, busyCode === 'REGISTRATION_PENDING' ? 409 : 429, {
      retryAfterSeconds: Math.max(1, Math.ceil((reservationExpiresAt - now) / 1000)),
    });
  }

  const cooldownAt = state?.lastOtpSentAt
    ? new Date(state.lastOtpSentAt).getTime() + config.resendCooldownMs
    : 0;
  if (cooldownAt > now.getTime()) {
    throw new AppError('OTP_RESEND_TOO_SOON', 429, {
      retryAfterSeconds: Math.max(1, Math.ceil((cooldownAt - now.getTime()) / 1000)),
    });
  }

  if (timestamps.length >= config.contactQuota.count) {
    const retryAt = timestamps[0].getTime() + config.contactQuota.windowMs;
    throw new AppError('OTP_RATE_LIMITED', 429, {
      retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now.getTime()) / 1000)),
    });
  }

  throw new AppError('OTP_RESEND_TOO_SOON', 429, { retryAfterSeconds: 1 });
}

export async function reserveContactSend(contactKey, { busyCode = 'OTP_RESEND_TOO_SOON' } = {}) {
  try {
    await ContactVerificationState.updateOne(
      { contactKey },
      { $setOnInsert: { contactKey } },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - config.contactQuota.windowMs);
  const reservation = randomUUID();
  const state = await ContactVerificationState.findOneAndUpdate(
    {
      contactKey,
      $and: [
        {
          $or: [
            { sendReservation: null },
            { sendReservation: { $exists: false } },
            { sendReservationExpiresAt: { $lte: now } },
          ],
        },
        {
          $or: [
            { lastOtpSentAt: null },
            { lastOtpSentAt: { $exists: false } },
            { lastOtpSentAt: { $lte: new Date(now.getTime() - config.resendCooldownMs) } },
          ],
        },
      ],
      $expr: {
        $lt: [
          {
            $size: {
              $filter: {
                input: { $ifNull: ['$otpSendTimestamps', []] },
                as: 'sentAt',
                cond: { $gte: ['$$sentAt', cutoff] },
              },
            },
          },
          config.contactQuota.count,
        ],
      },
    },
    {
      $set: {
        sendReservation: reservation,
        sendReservationExpiresAt: new Date(now.getTime() + config.reservationTtlMs),
      },
      $inc: { revision: 1 },
    },
    { new: true, timestamps: false },
  );

  if (!state) {
    const current = await ContactVerificationState.findOne({ contactKey }).lean();
    classifyReservationFailure(current, new Date(), busyCode);
  }
  return { reservation, reservedState: state };
}

export async function releaseContactReservation(contactKey, reservation) {
  await ContactVerificationState.updateOne(
    { contactKey, sendReservation: reservation },
    { $set: { sendReservation: null, sendReservationExpiresAt: null }, $inc: { revision: 1 } },
  );
}

function pendingError(pending, isInitial, now) {
  if (pending?.status === 'COMPLETED' && pending.expiresAt > now) {
    throw new AppError('REGISTRATION_COMPLETED', 409);
  }
  if (!pending || pending.status !== 'PENDING_VERIFICATION' || pending.expiresAt <= now) {
    throw new AppError('REGISTRATION_NOT_FOUND', 404);
  }
  if (pending.verificationBlocked) throw new AppError('PENDING_OTP_ATTEMPTS_EXHAUSTED', 429);
  if (!isInitial && pending.initialOtpIssuedAt && pending.resendCount >= config.maxResend) {
    throw new AppError('PENDING_RESEND_LIMIT_REACHED', 429);
  }
}

async function recordSafeOutcome(pending, eventType, outcome) {
  try {
    await RegistrationEvent.create({
      eventType,
      registrationId: pending._id,
      contactRef: pending.contactStateId ? String(pending.contactStateId) : null,
      outcome: { result: outcome },
    });
  } catch {
    // Audit failure must not change provider delivery or OTP activation outcome.
  }
}

export async function issueOtp(pendingRegistration, { isInitial = false, provider, reservation: existingReservation } = {}) {
  const registrationId = pendingRegistration?._id;
  if (!registrationId) throw new TypeError('A pending registration document is required');

  const pending = await PendingRegistration.findById(registrationId);
  pendingError(pending, isInitial, new Date());
  const contactKey = makeContactKey(pending.contactType, pending.contactValue);
  const { reservation } = existingReservation
    ? { reservation: existingReservation }
    : await reserveContactSend(contactKey);
  const otp = generateOtp();
  const createdAt = new Date();
  let otpRecord;
  let deliveryAttempted = false;

  try {
    otpRecord = await RegistrationOtp.create({
      registrationId: pending._id,
      codeVerifier: hmacOtp(otp, String(pending._id)),
      status: 'DELIVERY_PENDING',
      deleteAt: new Date(createdAt.getTime() + OTP_RETENTION_MS),
    });

    const selectedProvider = provider ?? getOtpProvider(pending.contactType);
    deliveryAttempted = true;
    await selectedProvider.sendOtp(pending.contactValue, otp);

    const issuedAt = new Date();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const pendingQuery = {
          _id: pending._id,
          status: 'PENDING_VERIFICATION',
          verificationBlocked: false,
          expiresAt: { $gt: issuedAt },
          $or: [
            { initialOtpIssuedAt: null },
            ...(isInitial ? [] : [{ initialOtpIssuedAt: { $ne: null }, resendCount: { $lt: config.maxResend } }]),
          ],
        };
        if (isInitial) pendingQuery.initialOtpIssuedAt = null;

        const updatedPending = await PendingRegistration.findOneAndUpdate(
          pendingQuery,
          [
            {
              $set: {
                initialOtpIssuedAt: { $ifNull: ['$initialOtpIssuedAt', { $literal: issuedAt }] },
                resendCount: {
                  $cond: [
                    { $eq: [{ $ifNull: ['$initialOtpIssuedAt', null] }, null] },
                    '$resendCount',
                    { $add: ['$resendCount', 1] },
                  ],
                },
                updatedAt: { $literal: issuedAt },
              },
            },
          ],
          { new: true, session, timestamps: false },
        );

        if (!updatedPending) {
          const current = await PendingRegistration.findById(pending._id).session(session).lean();
          if (current?.status === 'COMPLETED') throw new AppError('REGISTRATION_COMPLETED', 409);
          if (current?.verificationBlocked) throw new AppError('PENDING_OTP_ATTEMPTS_EXHAUSTED', 429);
          if (current?.initialOtpIssuedAt && current.resendCount >= config.maxResend) {
            throw new AppError('PENDING_RESEND_LIMIT_REACHED', 429);
          }
          throw new AppError('REGISTRATION_NOT_FOUND', 404);
        }

        await RegistrationOtp.updateMany(
          { registrationId: pending._id, status: 'ACTIVE' },
          { $set: { status: 'INVALIDATED' } },
          { session },
        );
        const activation = await RegistrationOtp.updateOne(
          { _id: otpRecord._id, status: 'DELIVERY_PENDING' },
          {
            $set: {
              status: 'ACTIVE',
              issuedAt,
              expiresAt: new Date(issuedAt.getTime() + config.otpTtlMs),
            },
          },
          { session },
        );
        if (activation.modifiedCount !== 1) throw new AppError('INTERNAL_ERROR', 500);

        const contactUpdate = await ContactVerificationState.updateOne(
          { contactKey, sendReservation: reservation },
          [
            {
              $set: {
                otpSendTimestamps: {
                  $concatArrays: [
                    {
                      $filter: {
                        input: { $ifNull: ['$otpSendTimestamps', []] },
                        as: 'sentAt',
                        cond: { $gte: ['$$sentAt', { $literal: new Date(issuedAt.getTime() - config.contactQuota.windowMs) }] },
                      },
                    },
                    { $literal: [issuedAt] },
                  ],
                },
                lastOtpSentAt: { $literal: issuedAt },
                sendReservation: null,
                sendReservationExpiresAt: null,
                updatedAt: { $literal: issuedAt },
                revision: { $add: ['$revision', 1] },
              },
            },
          ],
          { session, timestamps: false },
        );
        if (contactUpdate.modifiedCount !== 1) throw new AppError('INTERNAL_ERROR', 500);
      });
    } finally {
      await session.endSession();
    }

    await recordSafeOutcome(pending, 'OTP_SEND_ACCEPTED', 'accepted');
    return {
      contactType: pending.contactType,
      maskedDestination: maskDestination(pending.contactType, pending.contactValue),
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + config.otpTtlMs),
    };
  } catch (error) {
    if (otpRecord?._id) {
      await RegistrationOtp.deleteOne({ _id: otpRecord._id, status: 'DELIVERY_PENDING' }).catch(() => {});
    }
    await releaseContactReservation(contactKey, reservation).catch(() => {});
    const appError = error instanceof AppError
      ? error
      : new AppError(deliveryAttempted ? 'OTP_DELIVERY_FAILED' : 'INTERNAL_ERROR', deliveryAttempted ? 502 : 500);
    if (!(error instanceof AppError)) appError.cause = error;
    await recordSafeOutcome(pending, 'OTP_SEND_FAILED', appError.code);
    throw appError;
  }
}
