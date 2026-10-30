import { hasOnlyKeys } from '../validators/auth.validator.js';
import {
  CHALLENGE_KEYS,
  VERIFICATION_KEYS,
  REGISTRATION_VERIFICATION_KEYS
} from '../constants/auth-fields.js';

import { metadata } from '../utils/app-error.js';
function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}
import { AppError } from '../utils/app-error.js';
import { normalizeCustomerDisplayName } from '../services/customer-registration.service.js';

export function createAuthController({
  sessionService,
  accountSettingsService,
  otpService,
  secureCookies
} = {}) {
  return {
    getMe: async (req, res) => {
      const user = await sessionService.getCurrentUser(req.auth);
      if (!user)
        throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
      const contacts = await accountSettingsService.listVerifiedContacts(
        req.auth
      );
      const csrfToken =
        typeof sessionService.resumeCsrf === 'function'
          ? await sessionService.resumeCsrf(req, req.auth)
          : undefined;
      return respond(res, req, 200, {
        user,
        contacts,
        ...(csrfToken ? { csrfToken } : {})
      });
    },
    createOtpChallenges: async (req, res) => {
      if (!hasOnlyKeys(req.body, CHALLENGE_KEYS)) {
        return respond(res, req, 422, {
          code: 'VALIDATION_FAILED',
          message: 'OTP request is invalid'
        });
      }
      if (
        req.body.channel === 'PHONE' &&
        req.body.purpose === 'REGISTER'
      ) {
        throw new AppError(
          503,
          'SMS_UNAVAILABLE',
          'SMS verification is not currently available'
        );
      }
      const challenge = await otpService.begin(req.body);
      return respond(res, req, 202, {
        challengeId: challenge.challengeId,
        expiresInSeconds: challenge.expiresInSeconds,
        resendAfterSeconds: challenge.resendAfterSeconds
      });
    },
    createOtpVerifications: async (req, res) => {
      if (
        !hasOnlyKeys(req.body, REGISTRATION_VERIFICATION_KEYS) ||
        req.body.purpose !== 'REGISTER'
      ) {
        return respond(res, req, 422, {
          code: 'VALIDATION_FAILED',
          message: 'OTP verification request is invalid'
        });
      }
      if (req.body.channel === 'PHONE')
        throw new AppError(
          503,
          'SMS_UNAVAILABLE',
          'SMS verification is not currently available'
        );
      const displayName = normalizeCustomerDisplayName(req.body.displayName);
      const result = await otpService.verify({ ...req.body, displayName });
      if (
        result.status !== 'VERIFIED' ||
        result.authenticated !== true ||
        !result.session
      ) {
        throw new AppError(
          503,
          'REGISTRATION_UNAVAILABLE',
          'Customer registration could not be completed'
        );
      }
      sessionService.setCookie(res, result.session, {
        secure: secureCookies,
        persistent: false
      });
      return respond(res, req, 200, {
        verified: true,
        authenticated: true,
        user: result.session.user,
        csrfToken: result.session.csrfToken,
        expiresAt: new Date(result.session.expiresAt).toISOString()
      });
    },
    createSessions: async (req, res) => {
      const body =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? { ...req.body }
          : null;
      const rememberDevice =
        body && Object.hasOwn(body, 'rememberDevice')
          ? body.rememberDevice
          : false;
      if (body) delete body.rememberDevice;
      if (
        !hasOnlyKeys(body, VERIFICATION_KEYS) ||
        body.purpose !== 'LOGIN' ||
        typeof rememberDevice !== 'boolean'
      ) {
        return respond(res, req, 422, {
          code: 'VALIDATION_FAILED',
          message: 'Session request is invalid'
        });
      }
      const result = await otpService.verify({ ...body, rememberDevice });
      if (!result.authenticated)
        return respond(res, req, 200, { authenticated: false });
      sessionService.setCookie(res, result.session, {
        secure: secureCookies,
        persistent: rememberDevice
      });
      return respond(res, req, 200, {
        authenticated: true,
        user: result.session.user,
        csrfToken: result.session.csrfToken,
        expiresAt: new Date(result.session.expiresAt).toISOString()
      });
    },
    createMeContactChanges: async (req, res) => {
      if (!hasOnlyKeys(req.body, new Set(['channel', 'contact']))) {
        return respond(res, req, 422, {
          code: 'VALIDATION_FAILED',
          message: 'Contact change request is invalid'
        });
      }
      const challenge = await otpService.begin({
        ...req.body,
        purpose: 'CONTACT_CHANGE',
        actor: req.auth
      });
      return respond(res, req, 202, {
        challengeId: challenge.challengeId,
        expiresInSeconds: challenge.expiresInSeconds,
        resendAfterSeconds: challenge.resendAfterSeconds
      });
    },
    createMeContactVerifications: async (req, res) => {
      if (
        !hasOnlyKeys(req.body, VERIFICATION_KEYS) ||
        req.body.purpose !== 'CONTACT_CHANGE'
      ) {
        return respond(res, req, 422, {
          code: 'VALIDATION_FAILED',
          message: 'Contact verification request is invalid'
        });
      }
      const result = await otpService.verify({ ...req.body, actor: req.auth });
      return respond(res, req, 200, { verified: result.status === 'VERIFIED' });
    },
    deleteSessionsCurrent: async (req, res) => {
      await sessionService.revoke(req);
      sessionService.clearCookie(res, { secure: secureCookies });
      res.sendStatus(204);
    }
  };
}
