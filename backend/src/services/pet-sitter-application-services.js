import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { ContactVerificationState } from '../models/contact-verification-state.js';
import { PetSitterApplication } from '../models/pet-sitter-application.js';
import { PetSitterApplicationEvent } from '../models/pet-sitter-application-event.js';
import { getOtpProvider } from '../providers/index.js';
import { generateToken, hmacOtp, maskEmail, normalizeEmail, normalizePhoneVN, sha256, validateFullName, verifyOtpHmac } from '../utils/registration.js';
import { makeContactKey, releaseContactReservation, reserveContactSend } from './issue-otp.js';
import { encryptSensitiveValue, persistApplicationFiles, removeApplicationFiles } from './pet-sitter-application-storage.js';

const MAX_APPLICATION_OTP_ATTEMPTS = config.maxWrongOtp;

function normalizedApplication(input) {
  const fullName = validateFullName(input.fullName);
  const email = normalizeEmail(input.email);
  const phone = normalizePhoneVN(input.phone);
  const age = Number(input.age);
  if (!Number.isInteger(age) || age < 18 || age > 100) throw new AppError('VALIDATION_ERROR', 400, { field: 'age' });

  const allowedGenders = ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'];
  if (!allowedGenders.includes(input.gender)) throw new AppError('VALIDATION_ERROR', 400, { field: 'gender' });
  if (typeof input.location !== 'string' || input.location.trim().length < 3 || input.location.trim().length > 200) {
    throw new AppError('VALIDATION_ERROR', 400, { field: 'location' });
  }
  const experienceMap = {
    'under-one': 'UNDER_ONE',
    'one-to-three': 'ONE_TO_THREE',
    'over-three': 'OVER_THREE',
    UNDER_ONE: 'UNDER_ONE',
    ONE_TO_THREE: 'ONE_TO_THREE',
    OVER_THREE: 'OVER_THREE',
  };
  const experience = experienceMap[input.experience];
  if (!experience) throw new AppError('VALIDATION_ERROR', 400, { field: 'experience' });

  const acceptedSpecies = [...new Set((Array.isArray(input.acceptedSpecies) ? input.acceptedSpecies : [input.acceptedSpecies])
    .map((value) => ({ dog: 'DOG', cat: 'CAT', DOG: 'DOG', CAT: 'CAT' })[value]))].filter(Boolean);
  if (acceptedSpecies.length === 0) throw new AppError('VALIDATION_ERROR', 400, { field: 'acceptedSpecies' });

  if (typeof input.bio !== 'string' || input.bio.trim().length < 20 || input.bio.trim().length > 1000) {
    throw new AppError('VALIDATION_ERROR', 400, { field: 'bio' });
  }
  if (typeof input.nationalId !== 'string' || !/^\d{12}$/.test(input.nationalId)) {
    throw new AppError('VALIDATION_ERROR', 400, { field: 'nationalId' });
  }

  return {
    fullName,
    email,
    phone,
    age,
    gender: input.gender,
    location: input.location.trim(),
    experience,
    acceptedSpecies,
    bio: input.bio.trim(),
    nationalIdEncrypted: encryptSensitiveValue(input.nationalId),
  };
}

async function writeEvent(application, eventType, outcome = {}) {
  try {
    await PetSitterApplicationEvent.create({
      applicationId: application._id,
      emailRef: sha256(application.email),
      eventType,
      outcome,
    });
  } catch {
    // Safe audit logging is best-effort and must not change application outcomes.
  }
}

async function commitSendReservation(session, email, reservation, sentAt) {
  const contactKey = makeContactKey('email', email);
  const state = await ContactVerificationState.updateOne(
    { contactKey, sendReservation: reservation },
    [{
      $set: {
        otpSendTimestamps: {
          $concatArrays: [
            {
              $filter: {
                input: { $ifNull: ['$otpSendTimestamps', []] },
                as: 'sentAt',
                cond: { $gte: ['$$sentAt', { $literal: new Date(sentAt.getTime() - config.contactQuota.windowMs) }] },
              },
            },
            { $literal: [sentAt] },
          ],
        },
        lastOtpSentAt: { $literal: sentAt },
        sendReservation: null,
        sendReservationExpiresAt: null,
        updatedAt: { $literal: sentAt },
        revision: { $add: ['$revision', 1] },
      },
    }],
    { session, timestamps: false },
  );
  if (state.modifiedCount !== 1) throw new AppError('INTERNAL_ERROR', 500);
}

function applicationNotFound() {
  throw new AppError('SITTER_APPLICATION_NOT_FOUND', 404);
}

async function findApplicationByToken(token) {
  const application = await PetSitterApplication.findOne({ applicationTokenHash: sha256(token) })
    .select('+applicationTokenHash +otp.codeVerifier');
  if (!application) applicationNotFound();
  return application;
}

async function deleteApplication(application) {
  await removeApplicationFiles(application._id).catch(() => {});
  await PetSitterApplication.deleteOne({ _id: application._id });
}

async function cleanExpiredForContact(email, phone) {
  const expired = await PetSitterApplication.find({
    status: 'PENDING_EMAIL_VERIFICATION',
    expiresAt: { $lte: new Date() },
    $or: [{ email }, { phone }],
  }).select('_id');
  for (const application of expired) await deleteApplication(application);
}

export async function submitPetSitterApplication(input, files, { provider } = {}) {
  const applicant = normalizedApplication(input);
  const portrait = files.portrait?.[0];
  const nationalIdFront = files.nationalIdFront?.[0];
  const nationalIdBack = files.nationalIdBack?.[0];
  if (!portrait || !nationalIdFront || !nationalIdBack) {
    throw new AppError('VALIDATION_ERROR', 400, { fields: ['portrait', 'nationalIdFront', 'nationalIdBack'] });
  }

  await cleanExpiredForContact(applicant.email, applicant.phone);
  if (await PetSitterApplication.exists({ $or: [{ email: applicant.email }, { phone: applicant.phone }] })) {
    throw new AppError('SITTER_APPLICATION_EXISTS', 409);
  }

  const contactKey = makeContactKey('email', applicant.email);
  const { reservation } = await reserveContactSend(contactKey);
  const { raw: applicationToken, hash: applicationTokenHash } = generateToken();
  const applicationId = new mongoose.Types.ObjectId();
  let createdApplication;
  let providerAttempted = false;
  let providerAccepted = false;
  try {
    const persisted = await persistApplicationFiles(applicationId, files);
    const createdAt = new Date();
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    createdApplication = await PetSitterApplication.create({
      _id: applicationId,
      ...applicant,
      documents: persisted.documents,
      documentMediaTypes: persisted.mediaTypes,
      status: 'PENDING_EMAIL_VERIFICATION',
      applicationTokenHash,
      wrongOtpAttempts: 0,
      verificationBlocked: false,
      otp: {
        codeVerifier: hmacOtp(otp, String(applicationId)),
        status: 'DELIVERY_PENDING',
        initialOtpIssuedAt: null,
        resendCount: 0,
      },
      expiresAt: new Date(createdAt.getTime() + config.pendingTtlMs),
    });

    providerAttempted = true;
    await (provider ?? getOtpProvider('email')).sendOtp(applicant.email, otp);
    providerAccepted = true;
    const issuedAt = new Date();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const activated = await PetSitterApplication.updateOne(
          { _id: applicationId, status: 'PENDING_EMAIL_VERIFICATION', 'otp.status': 'DELIVERY_PENDING' },
          {
            $set: {
              'otp.status': 'ACTIVE',
              'otp.issuedAt': issuedAt,
              'otp.expiresAt': new Date(issuedAt.getTime() + config.otpTtlMs),
              'otp.initialOtpIssuedAt': issuedAt,
            },
          },
          { session },
        );
        if (activated.modifiedCount !== 1) throw new AppError('INTERNAL_ERROR', 500);
        await commitSendReservation(session, applicant.email, reservation, issuedAt);
      });
    } finally {
      await session.endSession();
    }

    await writeEvent(createdApplication, 'APPLICATION_CREATED', { outcome: 'otp_sent' });
    await writeEvent(createdApplication, 'OTP_SEND_ACCEPTED', { providerAccepted: true });
    return {
      statusCode: 201,
      body: {
        applicationToken,
        maskedDestination: maskEmail(applicant.email),
        expiresAt: new Date(issuedAt.getTime() + config.otpTtlMs).toISOString(),
        message: 'OTP sent',
      },
    };
  } catch (error) {
    await releaseContactReservation(contactKey, reservation).catch(() => {});
    if (createdApplication) await writeEvent(createdApplication, 'OTP_SEND_FAILED', { outcome: 'not_accepted' });
    if (createdApplication) await deleteApplication(createdApplication).catch(() => {});
    else await removeApplicationFiles(applicationId).catch(() => {});
    if (error instanceof AppError) throw error;
    if (error?.code === 11000) throw new AppError('SITTER_APPLICATION_EXISTS', 409);
    const failed = new AppError(providerAttempted && !providerAccepted ? 'OTP_DELIVERY_FAILED' : 'INTERNAL_ERROR', providerAttempted && !providerAccepted ? 502 : 500);
    failed.cause = error;
    throw failed;
  }
}

async function requirePendingApplication(application) {
  if (application.status === 'SUBMITTED_FOR_REVIEW') return false;
  if (application.status !== 'PENDING_EMAIL_VERIFICATION') applicationNotFound();
  if (application.expiresAt <= new Date()) {
    await deleteApplication(application);
    applicationNotFound();
  }
  if (application.verificationBlocked || application.wrongOtpAttempts >= MAX_APPLICATION_OTP_ATTEMPTS) {
    throw new AppError('PENDING_OTP_ATTEMPTS_EXHAUSTED', 429);
  }
  return true;
}

export async function resendPetSitterApplicationOtp(token, { provider } = {}) {
  const application = await findApplicationByToken(token);
  const pending = await requirePendingApplication(application);
  if (!pending) throw new AppError('SITTER_APPLICATION_SUBMITTED', 409);
  if (application.otp.initialOtpIssuedAt && application.otp.resendCount >= config.maxResend) {
    throw new AppError('PENDING_RESEND_LIMIT_REACHED', 429);
  }

  const contactKey = makeContactKey('email', application.email);
  const { reservation } = await reserveContactSend(contactKey);
  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  let providerAccepted = false;
  try {
    await (provider ?? getOtpProvider('email')).sendOtp(application.email, otp);
    providerAccepted = true;
    const issuedAt = new Date();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const updated = await PetSitterApplication.findOneAndUpdate(
          {
            _id: application._id,
            status: 'PENDING_EMAIL_VERIFICATION',
            verificationBlocked: false,
            wrongOtpAttempts: { $lt: MAX_APPLICATION_OTP_ATTEMPTS },
            expiresAt: { $gt: issuedAt },
            $or: [
              { 'otp.initialOtpIssuedAt': null },
              { 'otp.resendCount': { $lt: config.maxResend } },
            ],
          },
          {
            $set: {
              'otp.codeVerifier': hmacOtp(otp, String(application._id)),
              'otp.status': 'ACTIVE',
              'otp.issuedAt': issuedAt,
              'otp.expiresAt': new Date(issuedAt.getTime() + config.otpTtlMs),
              'otp.initialOtpIssuedAt': application.otp.initialOtpIssuedAt ?? issuedAt,
            },
            $inc: { 'otp.resendCount': application.otp.initialOtpIssuedAt ? 1 : 0 },
          },
          { new: true, session, runValidators: true },
        );
        if (!updated) throw new AppError('SITTER_APPLICATION_NOT_FOUND', 404);
        await commitSendReservation(session, application.email, reservation, issuedAt);
      });
    } finally {
      await session.endSession();
    }
    await writeEvent(application, 'OTP_SEND_ACCEPTED', { resend: true, providerAccepted: true });
    return {
      statusCode: 200,
      body: {
        maskedDestination: maskEmail(application.email),
        expiresAt: new Date(issuedAt.getTime() + config.otpTtlMs).toISOString(),
        message: 'A new OTP has been sent.',
      },
    };
  } catch (error) {
    await releaseContactReservation(contactKey, reservation).catch(() => {});
    if (error instanceof AppError) throw error;
    await writeEvent(application, 'OTP_SEND_FAILED', { resend: true });
    const failed = new AppError(providerAccepted ? 'INTERNAL_ERROR' : 'OTP_DELIVERY_FAILED', providerAccepted ? 500 : 502);
    failed.cause = error;
    throw failed;
  }
}

export async function verifyPetSitterApplicationOtp(token, submittedOtp) {
  const application = await findApplicationByToken(token);
  if (application.status === 'SUBMITTED_FOR_REVIEW') {
    return { statusCode: 200, body: { status: 'SUBMITTED_FOR_REVIEW', message: 'Your application is under review.' } };
  }
  await requirePendingApplication(application);

  const now = new Date();
  if (application.otp.status !== 'ACTIVE' || !application.otp.expiresAt || now >= application.otp.expiresAt) {
    throw new AppError('OTP_NOT_VALID', 400);
  }

  if (!verifyOtpHmac(submittedOtp, String(application._id), application.otp.codeVerifier)) {
    const update = await PetSitterApplication.findOneAndUpdate(
      {
        _id: application._id,
        status: 'PENDING_EMAIL_VERIFICATION',
        verificationBlocked: false,
        wrongOtpAttempts: { $lt: MAX_APPLICATION_OTP_ATTEMPTS },
        'otp.status': 'ACTIVE',
        'otp.expiresAt': { $gt: now },
      },
      [{
        $set: {
          wrongOtpAttempts: { $add: ['$wrongOtpAttempts', 1] },
          verificationBlocked: { $gte: [{ $add: ['$wrongOtpAttempts', 1] }, MAX_APPLICATION_OTP_ATTEMPTS] },
          updatedAt: { $literal: now },
        },
      }],
      { new: true, timestamps: false },
    );
    if (!update) throw new AppError('OTP_NOT_VALID', 400);
    await writeEvent(update, 'OTP_INVALID', { wrongAttempts: update.wrongOtpAttempts });
    throw new AppError('OTP_INVALID', 400);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const completed = await PetSitterApplication.updateOne(
        {
          _id: application._id,
          status: 'PENDING_EMAIL_VERIFICATION',
          verificationBlocked: false,
          wrongOtpAttempts: { $lt: MAX_APPLICATION_OTP_ATTEMPTS },
          expiresAt: { $gt: now },
          'otp.status': 'ACTIVE',
          'otp.expiresAt': { $gt: now },
        },
        {
          $set: {
            status: 'SUBMITTED_FOR_REVIEW',
            emailVerifiedAt: now,
            submittedAt: now,
            expiresAt: null,
            'otp.status': 'CONSUMED',
          },
        },
        { session },
      );
      if (completed.modifiedCount !== 1) throw new AppError('OTP_NOT_VALID', 400);
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('INTERNAL_ERROR', 500);
  } finally {
    await session.endSession();
  }

  await writeEvent(application, 'OTP_VERIFIED', { verified: true });
  await writeEvent(application, 'APPLICATION_SUBMITTED', { status: 'SUBMITTED_FOR_REVIEW' });
  return {
    statusCode: 200,
    body: {
      status: 'SUBMITTED_FOR_REVIEW',
      message: 'Your Pet Sitter application has been submitted for review.',
      nextAction: 'WAIT_FOR_REVIEW',
      submittedAt: now.toISOString(),
    },
  };
}

export async function cancelPendingPetSitterApplication(token) {
  const application = await findApplicationByToken(token);
  if (!(await requirePendingApplication(application))) throw new AppError('SITTER_APPLICATION_SUBMITTED', 409);
  await writeEvent(application, 'APPLICATION_CANCELLED', { outcome: 'cancelled_by_applicant' });
  await deleteApplication(application);
  return { statusCode: 204, body: null };
}

export async function cleanupExpiredPetSitterApplications() {
  const expired = await PetSitterApplication.find({
    status: 'PENDING_EMAIL_VERIFICATION',
    expiresAt: { $lte: new Date() },
  }).select('_id').lean();
  for (const application of expired) {
    await removeApplicationFiles(application._id).catch(() => {});
    await PetSitterApplication.deleteOne({ _id: application._id, status: 'PENDING_EMAIL_VERIFICATION' });
  }
  return expired.length;
}

export function startPetSitterApplicationCleanup() {
  const run = () => cleanupExpiredPetSitterApplications().catch(() => {});
  void run();
  const timer = setInterval(run, 5 * 60 * 1000);
  timer.unref?.();
  return () => clearInterval(timer);
}
