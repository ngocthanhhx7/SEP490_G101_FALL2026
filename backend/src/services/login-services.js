import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { AuthSession } from '../models/auth-session.js';
import { Customer } from '../models/customer.js';
import { LoginContactState } from '../models/login-contact-state.js';
import { LoginOtpChallenge } from '../models/login-otp-challenge.js';
import { PetSitterApplication } from '../models/pet-sitter-application.js';
import { getOtpProvider } from '../providers/index.js';
import {
  generateOtp,
  generateToken,
  hmacOtp,
  normalizeEmail,
  normalizePhoneVN,
  sha256,
  verifyOtpHmac,
} from '../utils/registration.js';

const GENERIC_REQUEST_RESULT = Object.freeze({
  statusCode: 202,
  body: { message: 'If this contact belongs to an eligible account, a verification code will be sent.' },
});

function normalizedContact(contactType, contact) {
  if (contactType === 'email') return normalizeEmail(contact);
  if (contactType === 'phone') return normalizePhoneVN(contact);
  throw new AppError('VALIDATION_ERROR', 400, { field: 'contactType' });
}

function contactKey(contactType, contactValue) {
  return sha256(`${contactType}:${contactValue}`);
}

async function reserveContact(key) {
  try {
    await LoginContactState.updateOne(
      { contactKey: key },
      { $setOnInsert: { contactKey: key, otpSendTimestamps: [] } },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - config.contactQuota.windowMs);
  const reservation = randomUUID();
  const state = await LoginContactState.findOneAndUpdate(
    {
      contactKey: key,
      $and: [
        { $or: [{ sendReservationExpiresAt: null }, { sendReservationExpiresAt: { $lte: now } }] },
        { $or: [{ lastOtpSentAt: null }, { lastOtpSentAt: { $lte: new Date(now.getTime() - config.resendCooldownMs) } }] },
        {
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
      ],
    },
    [
      {
        $set: {
          otpSendTimestamps: {
            $filter: {
              input: { $ifNull: ['$otpSendTimestamps', []] },
              as: 'sentAt',
              cond: { $gte: ['$$sentAt', { $literal: cutoff }] },
            },
          },
          sendReservation: { $literal: reservation },
          sendReservationExpiresAt: { $literal: new Date(now.getTime() + config.reservationTtlMs) },
          updatedAt: { $literal: now },
        },
      },
    ],
    { new: true, timestamps: false },
  );
  return state ? reservation : null;
}

async function releaseReservation(key, reservation) {
  await LoginContactState.updateOne(
    { contactKey: key, sendReservation: reservation },
    { $set: { sendReservation: null, sendReservationExpiresAt: null } },
  );
}

async function issueLoginOtp(principal, contactType, contactValue, key) {
  const reservation = await reserveContact(key);
  if (!reservation) return;

  const challengeId = new mongoose.Types.ObjectId();
  const otp = generateOtp();
  const now = new Date();
  const challenge = new LoginOtpChallenge({
    _id: challengeId,
    contactKey: key,
    contactType,
    principalType: principal.principalType,
    customerId: principal.principalType === 'CUSTOMER' ? principal.document._id : null,
    petSitterApplicationId: principal.principalType === 'PET_SITTER_APPLICANT' ? principal.document._id : null,
    codeVerifier: hmacOtp(otp, String(challengeId)),
    status: 'DELIVERY_PENDING',
    attempts: 0,
    expiresAt: new Date(now.getTime() + config.otpTtlMs),
    deleteAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });

  try {
    await challenge.save();
    await getOtpProvider(contactType).sendOtp(contactValue, otp);

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await LoginOtpChallenge.updateMany(
          { contactKey: key, status: 'ACTIVE' },
          { $set: { status: 'INVALIDATED' } },
          { session },
        );
        const activated = await LoginOtpChallenge.updateOne(
          { _id: challengeId, status: 'DELIVERY_PENDING' },
          { $set: { status: 'ACTIVE', issuedAt: new Date() } },
          { session },
        );
        if (activated.modifiedCount !== 1) throw new Error('Login OTP challenge activation failed');

        const sentAt = new Date();
        const committed = await LoginContactState.updateOne(
          { contactKey: key, sendReservation: reservation },
          {
            $push: { otpSendTimestamps: sentAt },
            $set: {
              lastOtpSentAt: sentAt,
              sendReservation: null,
              sendReservationExpiresAt: null,
            },
          },
          { session },
        );
        if (committed.modifiedCount !== 1) throw new Error('Login OTP send reservation was lost');
      });
    } finally {
      await session.endSession();
    }
  } catch {
    await LoginOtpChallenge.deleteOne({ _id: challengeId, status: 'DELIVERY_PENDING' }).catch(() => {});
    await releaseReservation(key, reservation).catch(() => {});
    // Keep login OTP requests indistinguishable for unknown contacts and delivery failures.
  }
}

export async function requestLoginOtp(input) {
  const contactValue = normalizedContact(input.contactType, input.contact);
  const key = contactKey(input.contactType, contactValue);
  const verifiedField = input.contactType === 'email' ? 'emailVerifiedAt' : 'phoneVerifiedAt';
  const customer = await Customer.findOne({
    [input.contactType]: contactValue,
    [verifiedField]: { $ne: null },
    status: 'ACTIVE',
  }).select('_id');

  let principal = customer ? { principalType: 'CUSTOMER', document: customer } : null;
  if (!principal && input.contactType === 'email') {
    const application = await PetSitterApplication.findOne({
      email: contactValue,
      emailVerifiedAt: { $ne: null },
      status: 'SUBMITTED_FOR_REVIEW',
    }).select('_id');
    if (application) principal = { principalType: 'PET_SITTER_APPLICANT', document: application };
  }

  if (principal) await issueLoginOtp(principal, input.contactType, contactValue, key);
  return GENERIC_REQUEST_RESULT;
}

function invalidLoginOtp() {
  throw new AppError('OTP_NOT_VALID', 400);
}

export async function verifyLoginOtp(input) {
  const contactValue = normalizedContact(input.contactType, input.contact);
  const key = contactKey(input.contactType, contactValue);
  const now = new Date();
  const challenge = await LoginOtpChallenge.findOne({
    contactKey: key,
    status: 'ACTIVE',
    expiresAt: { $gt: now },
  }).sort({ issuedAt: -1 }).select('+codeVerifier');

  if (!challenge || challenge.attempts >= config.maxWrongOtp) invalidLoginOtp();

  if (!verifyOtpHmac(input.otp, String(challenge._id), challenge.codeVerifier)) {
    await LoginOtpChallenge.findOneAndUpdate(
      {
        _id: challenge._id,
        status: 'ACTIVE',
        attempts: { $lt: config.maxWrongOtp },
        expiresAt: { $gt: now },
      },
      [{
        $set: {
          attempts: { $add: ['$attempts', 1] },
          status: {
            $cond: [
              { $gte: [{ $add: ['$attempts', 1] }, config.maxWrongOtp] },
              'BLOCKED',
              'ACTIVE',
            ],
          },
          updatedAt: { $literal: now },
        },
      }],
      { new: true, timestamps: false },
    );
    invalidLoginOtp();
  }

  const isApplicant = challenge.principalType === 'PET_SITTER_APPLICANT';
  const principal = isApplicant
    ? await PetSitterApplication.findOne({
      _id: challenge.petSitterApplicationId,
      email: contactValue,
      emailVerifiedAt: { $ne: null },
      status: 'SUBMITTED_FOR_REVIEW',
    }).select('_id fullName status submittedAt')
    : await Customer.findOne({
      _id: challenge.customerId,
      status: 'ACTIVE',
      [input.contactType]: contactValue,
      [input.contactType === 'email' ? 'emailVerifiedAt' : 'phoneVerifiedAt']: { $ne: null },
    }).select('_id fullName');
  if (!principal) invalidLoginOtp();

  const { raw: accessToken, hash: tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + config.loginSessionTtlMs);
  const authSession = await mongoose.startSession();
  try {
    await authSession.withTransaction(async () => {
      const consumed = await LoginOtpChallenge.updateOne(
        {
          _id: challenge._id,
          status: 'ACTIVE',
          attempts: { $lt: config.maxWrongOtp },
          expiresAt: { $gt: new Date() },
        },
        { $set: { status: 'CONSUMED' } },
        { session: authSession },
      );
      if (consumed.modifiedCount !== 1) invalidLoginOtp();

      await AuthSession.create([{
        principalType: isApplicant ? 'PET_SITTER_APPLICANT' : 'CUSTOMER',
        customerId: isApplicant ? null : principal._id,
        petSitterApplicationId: isApplicant ? principal._id : null,
        tokenHash,
        expiresAt,
        revokedAt: null,
      }], { session: authSession });
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    invalidLoginOtp();
  } finally {
    await authSession.endSession();
  }

  return {
    statusCode: 200,
    body: {
      accessToken,
      tokenType: 'Bearer',
      expiresAt: expiresAt.toISOString(),
      user: {
        id: String(principal._id),
        fullName: principal.fullName,
        role: isApplicant ? 'PET_SITTER_APPLICANT' : 'CUSTOMER',
        ...(isApplicant ? { applicationStatus: principal.status, submittedAt: principal.submittedAt } : {}),
      },
    },
  };
}

export async function logout(authSessionId) {
  if (authSessionId) {
    await AuthSession.updateOne(
      { _id: authSessionId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
  return { statusCode: 204, body: null };
}

export async function findAuthSessionByToken(token) {
  return AuthSession.findOne({
    tokenHash: sha256(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('+tokenHash');
}
