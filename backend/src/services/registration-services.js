import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { Customer } from '../models/customer.js';
import { PendingRegistration } from '../models/pending-registration.js';
import { RegistrationEvent } from '../models/registration-event.js';
import { RegistrationOtp } from '../models/registration-otp.js';
import { issueOtp, makeContactKey, releaseContactReservation, reserveContactSend } from './issue-otp.js';
import {
  generateToken,
  maskDestination,
  normalizeEmail,
  normalizePhoneVN,
  sha256,
  validateFullName,
  verifyOtpHmac,
} from '../utils/registration.js';

function normalizeContact(contactType, contact) {
  if (contactType === 'email') return normalizeEmail(contact);
  if (contactType === 'phone') return normalizePhoneVN(contact);
  throw new AppError('VALIDATION_ERROR', 400, { field: 'contactType' });
}

function asPendingNotFound() {
  throw new AppError('REGISTRATION_NOT_FOUND', 404);
}

async function findRegistration(identity) {
  const now = new Date();
  let registration;
  if (identity.registrationToken) {
    registration = await PendingRegistration.findOne({
      registrationTokenHash: sha256(identity.registrationToken),
      expiresAt: { $gt: now },
    });
  } else {
    const contactValue = normalizeContact(identity.contactType, identity.contact);
    registration = await PendingRegistration.findOne({
      contactType: identity.contactType,
      contactValue,
      expiresAt: { $gt: now },
    });
  }
  if (!registration) asPendingNotFound();
  if (registration.status === 'COMPLETED') throw new AppError('REGISTRATION_COMPLETED', 409, { status: 'COMPLETED' });
  if (registration.status !== 'PENDING_VERIFICATION') asPendingNotFound();
  return registration;
}

async function writeEvent(eventType, registration, outcome = {}) {
  try {
    await RegistrationEvent.create({
      eventType,
      registrationId: registration?._id ?? null,
      contactRef: registration?.contactStateId ? String(registration.contactStateId) : null,
      outcome,
    });
  } catch {
    // Auditing is best-effort and must not change the registration result.
  }
}

async function classifyDuplicateRegistration(contactType, contactValue) {
  const field = contactType === 'email' ? 'email' : 'phone';
  const existingCustomer = await Customer.exists({ [field]: contactValue });
  if (existingCustomer) throw new AppError('CONTACT_ALREADY_USED', 409, { suggestedAction: 'LOGIN' });
  const existingPending = await PendingRegistration.findOne({
    contactType,
    contactValue,
    status: 'PENDING_VERIFICATION',
    expiresAt: { $gt: new Date() },
  });
  if (existingPending) throw new AppError('REGISTRATION_PENDING', 409);
  throw new AppError('INTERNAL_ERROR', 500);
}

export async function registerService(input, { provider } = {}) {
  const fullName = validateFullName(input?.fullName);
  const emailSelected = typeof input?.email === 'string';
  const phoneSelected = typeof input?.phone === 'string';
  if (emailSelected === phoneSelected) throw new AppError('VALIDATION_ERROR', 400, { field: 'contact' });

  const contactType = emailSelected ? 'email' : 'phone';
  const contactValue = normalizeContact(contactType, emailSelected ? input.email : input.phone);
  const customerField = emailSelected ? 'email' : 'phone';
  if (await Customer.exists({ [customerField]: contactValue })) {
    throw new AppError('CONTACT_ALREADY_USED', 409, { suggestedAction: 'LOGIN' });
  }

  const now = new Date();
  await PendingRegistration.findOneAndDelete({
    contactType,
    contactValue,
    status: 'PENDING_VERIFICATION',
    expiresAt: { $lte: now },
  });
  const existingPending = await PendingRegistration.findOne({
    contactType,
    contactValue,
    status: 'PENDING_VERIFICATION',
    expiresAt: { $gt: now },
  });
  if (existingPending) throw new AppError('REGISTRATION_PENDING', 409);

  const contactKey = makeContactKey(contactType, contactValue);
  let reservation;
  let reservedState;
  try {
    ({ reservation, reservedState } = await reserveContactSend(contactKey, { busyCode: 'REGISTRATION_PENDING' }));
  } catch (error) {
    if (error?.code === 'OTP_RESEND_TOO_SOON') {
      const racedPending = await PendingRegistration.findOne({
        contactType,
        contactValue,
        status: 'PENDING_VERIFICATION',
        expiresAt: { $gt: new Date() },
      });
      if (racedPending) throw new AppError('REGISTRATION_PENDING', 409);
    }
    throw error;
  }

  const { raw: registrationToken, hash: registrationTokenHash } = generateToken();
  let pending;
  try {
    pending = await PendingRegistration.create({
      fullName,
      contactType,
      contactValue,
      status: 'PENDING_VERIFICATION',
      contactStateId: reservedState._id,
      registrationTokenHash,
      expiresAt: new Date(now.getTime() + config.pendingTtlMs),
    });
  } catch (error) {
    await releaseContactReservation(contactKey, reservation).catch(() => {});
    if (error?.code === 11000) return classifyDuplicateRegistration(contactType, contactValue);
    const appError = new AppError('INTERNAL_ERROR', 500);
    appError.cause = error;
    throw appError;
  }

  try {
    const delivery = await issueOtp(pending, { isInitial: true, provider, reservation });
    await writeEvent('REGISTRATION_CREATED', pending, { outcome: 'otp_sent' });
    return {
      statusCode: 201,
      body: {
        registrationToken,
        contactType,
        maskedDestination: delivery.maskedDestination,
        message: 'OTP sent',
      },
    };
  } catch (error) {
    // issueOtp preserves pending data after provider failure for contact recovery.
    await releaseContactReservation(contactKey, reservation).catch(() => {});
    throw error;
  }
}

export async function resendService(identity, { provider } = {}) {
  const pending = await findRegistration(identity);
  if (pending.verificationBlocked) throw new AppError('PENDING_OTP_ATTEMPTS_EXHAUSTED', 429);
  if (pending.initialOtpIssuedAt && pending.resendCount >= config.maxResend) {
    throw new AppError('PENDING_RESEND_LIMIT_REACHED', 429);
  }

  const delivery = await issueOtp(pending, { provider });
  return {
    statusCode: 200,
    body: {
      contactType: delivery.contactType,
      maskedDestination: delivery.maskedDestination,
      message: 'A new OTP has been sent.',
    },
  };
}

function mapVerificationRace(registrationId) {
  return PendingRegistration.findById(registrationId).lean().then((current) => {
    if (current?.status === 'COMPLETED') throw new AppError('REGISTRATION_COMPLETED', 409, { status: 'COMPLETED' });
    if (!current || current.expiresAt <= new Date()) asPendingNotFound();
    if (current.verificationBlocked || current.wrongOtpAttempts >= config.maxWrongOtp) {
      throw new AppError('PENDING_OTP_ATTEMPTS_EXHAUSTED', 429);
    }
    throw new AppError('OTP_NOT_VALID', 400);
  });
}

export async function verifyService(identity, otp) {
  const pending = await findRegistration(identity);
  if (pending.verificationBlocked || pending.wrongOtpAttempts >= config.maxWrongOtp) {
    throw new AppError('PENDING_OTP_ATTEMPTS_EXHAUSTED', 429);
  }

  const now = new Date();
  const activeOtp = await RegistrationOtp.findOne({
    registrationId: pending._id,
    status: 'ACTIVE',
  }).sort({ issuedAt: -1 });
  if (!activeOtp || !activeOtp.expiresAt || now >= activeOtp.expiresAt) {
    throw new AppError('OTP_NOT_VALID', 400);
  }

  if (!verifyOtpHmac(otp, String(pending._id), activeOtp.codeVerifier)) {
    const attempts = await PendingRegistration.findOneAndUpdate(
      {
        _id: pending._id,
        status: 'PENDING_VERIFICATION',
        verificationBlocked: false,
        wrongOtpAttempts: { $lt: config.maxWrongOtp },
        expiresAt: { $gt: now },
      },
      [
        {
          $set: {
            wrongOtpAttempts: { $add: ['$wrongOtpAttempts', 1] },
            verificationBlocked: { $gte: [{ $add: ['$wrongOtpAttempts', 1] }, config.maxWrongOtp] },
            updatedAt: { $literal: now },
          },
        },
      ],
      { new: true, timestamps: false },
    );
    if (!attempts) return mapVerificationRace(pending._id);
    await writeEvent(
      attempts.verificationBlocked ? 'OTP_ATTEMPTS_EXHAUSTED' : 'OTP_INVALID',
      attempts,
      { wrongOtpAttempts: attempts.wrongOtpAttempts },
    );
    throw new AppError('OTP_INVALID', 400);
  }

  const session = await mongoose.startSession();
  let customer;
  try {
    await session.withTransaction(async () => {
      const currentPending = await PendingRegistration.findById(pending._id).session(session).lean();
      if (currentPending?.status === 'COMPLETED') {
        throw new AppError('REGISTRATION_COMPLETED', 409, { status: 'COMPLETED' });
      }
      if (!currentPending || currentPending.expiresAt <= now) asPendingNotFound();
      if (currentPending.verificationBlocked || currentPending.wrongOtpAttempts >= config.maxWrongOtp) {
        throw new AppError('PENDING_OTP_ATTEMPTS_EXHAUSTED', 429);
      }

      const role = await mongoose.connection.collection('roles').findOne(
        { code: 'CUSTOMER', isActive: true },
        { session },
      );
      if (!role?._id) throw new AppError('INTERNAL_ERROR', 500);

      const customerId = new mongoose.Types.ObjectId();
      const completed = await PendingRegistration.updateOne(
        {
          _id: pending._id,
          status: 'PENDING_VERIFICATION',
          verificationBlocked: false,
          wrongOtpAttempts: { $lt: config.maxWrongOtp },
          expiresAt: { $gt: now },
        },
        { $set: { status: 'COMPLETED', customerId, updatedAt: now } },
        { session, timestamps: false },
      );
      if (completed.modifiedCount !== 1) return mapVerificationRace(pending._id);

      const consumed = await RegistrationOtp.updateOne(
        {
          _id: activeOtp._id,
          registrationId: pending._id,
          status: 'ACTIVE',
          expiresAt: { $gt: now },
        },
        { $set: { status: 'CONSUMED' } },
        { session },
      );
      if (consumed.modifiedCount !== 1) throw new AppError('OTP_NOT_VALID', 400);

      const contactField = pending.contactType;
      const customerValues = {
        _id: customerId,
        fullName: pending.fullName,
        roleId: role._id,
        status: 'ACTIVE',
        emailVerifiedAt: contactField === 'email' ? now : null,
        phoneVerifiedAt: contactField === 'phone' ? now : null,
        [contactField]: pending.contactValue,
      };
      [customer] = await Customer.create([customerValues], { session });
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error?.code === 11000) {
      const existing = await Customer.exists({ [pending.contactType]: pending.contactValue });
      if (existing) throw new AppError('CONTACT_ALREADY_USED', 409, { suggestedAction: 'LOGIN' });
    }
    throw new AppError('INTERNAL_ERROR', 500);
  } finally {
    await session.endSession();
  }

  await writeEvent('REGISTRATION_COMPLETED', pending, { customerId: String(customer._id) });
  return {
    statusCode: 200,
    body: {
      status: 'ACTIVE',
      message: 'Registration successful',
      nextAction: 'LOGIN',
    },
  };
}
