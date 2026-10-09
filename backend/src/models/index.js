import { Customer } from './customer.js';
import { PendingRegistration } from './pending-registration.js';
import { ContactVerificationState } from './contact-verification-state.js';
import { RegistrationOtp } from './registration-otp.js';
import { RegistrationIpRateLimit } from './registration-ip-rate-limit.js';
import { RegistrationEvent } from './registration-event.js';
import { Role } from './role.js';
import { LoginOtpChallenge } from './login-otp-challenge.js';
import { LoginContactState } from './login-contact-state.js';
import { AuthSession } from './auth-session.js';
import { PetSitterApplication } from './pet-sitter-application.js';
import { PetSitterApplicationEvent } from './pet-sitter-application-event.js';
import { PetSitter } from './pet-sitter.js';

export const models = Object.freeze({
  Customer,
  PendingRegistration,
  ContactVerificationState,
  RegistrationOtp,
  RegistrationIpRateLimit,
  RegistrationEvent,
  Role,
  LoginOtpChallenge,
  LoginContactState,
  AuthSession,
  PetSitterApplication,
  PetSitterApplicationEvent,
  PetSitter,
});

export async function ensureModelIndexes() {
  await Promise.all(Object.values(models).map((model) => model.createIndexes()));
}
