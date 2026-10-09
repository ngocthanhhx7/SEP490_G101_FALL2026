import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';
import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

const emailSchema = z.string().email();

export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new AppError('VALIDATION_ERROR', 400, { field: 'email' });
  const normalized = value.toLowerCase();
  if (!emailSchema.safeParse(normalized).success) {
    throw new AppError('VALIDATION_ERROR', 400, { field: 'email' });
  }
  return normalized;
}

export function normalizePhoneVN(value) {
  if (typeof value !== 'string') throw new AppError('VALIDATION_ERROR', 400, { field: 'phone' });
  const parsed = parsePhoneNumberFromString(value, 'VN');
  if (!parsed?.isValid() || parsed.country !== 'VN') {
    throw new AppError('VALIDATION_ERROR', 400, { field: 'phone' });
  }
  return parsed.number;
}

export function validateFullName(value) {
  if (typeof value !== 'string') throw new AppError('VALIDATION_ERROR', 400, { field: 'fullName' });
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  if (length < 2 || length > 100 || !/^[\p{L}\p{M} '-]+$/u.test(normalized) || !/\p{L}/u.test(normalized)) {
    throw new AppError('VALIDATION_ERROR', 400, { field: 'fullName' });
  }
  return normalized;
}

export function generateToken() {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function generateOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hmacOtp(otp, registrationId) {
  return createHmac('sha256', config.otpHmacSecret)
    .update(`${registrationId}:${otp}`)
    .digest('hex');
}

export function verifyOtpHmac(candidateOtp, registrationId, expectedVerifier) {
  const candidate = Buffer.from(hmacOtp(candidateOtp, registrationId), 'hex');
  const expected = Buffer.from(expectedVerifier, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function maskEmail(email) {
  const at = email.lastIndexOf('@');
  if (at < 1) return '**';
  return `${email[0]}**${email.slice(at)}`;
}

export function maskPhone(phone) {
  const parsed = parsePhoneNumberFromString(phone, 'VN');
  const digits = parsed?.country === 'VN'
    ? parsed.formatNational().replace(/\D/g, '')
    : phone.replace(/\D/g, '');
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
}

export function maskDestination(contactType, contactValue) {
  return contactType === 'email' ? maskEmail(contactValue) : maskPhone(contactValue);
}
