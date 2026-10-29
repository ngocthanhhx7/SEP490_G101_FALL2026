import { createAuthController } from '../controllers/auth.controller.js';
import { Router } from 'express';

export function authModule({
  otpService,
  sessionService,
  accountSettingsService,
  requireAuthenticated,
  requireCsrf,
  secureCookies = true
} = {}) {
  if (
    typeof otpService?.begin !== 'function' ||
    typeof otpService?.verify !== 'function' ||
    typeof sessionService?.authenticate !== 'function' ||
    typeof sessionService?.verifyCsrf !== 'function' ||
    typeof sessionService?.getCurrentUser !== 'function' ||
    typeof sessionService?.setCookie !== 'function' ||
    typeof sessionService?.clearCookie !== 'function' ||
    typeof sessionService?.revoke !== 'function' ||
    typeof requireAuthenticated !== 'function' ||
    typeof accountSettingsService?.listVerifiedContacts !== 'function' ||
    typeof requireCsrf !== 'function' ||
    typeof secureCookies !== 'boolean'
  ) {
    throw new TypeError(
      'OTP, session and authentication middleware dependencies are required'
    );
  }
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  const authenticated = requireAuthenticated;
  const csrfProtected = requireCsrf;

  router.get(
    '/me',
    authenticated,
    createAuthController({ sessionService, accountSettingsService }).getMe
  );

  router.post(
    '/otp-challenges',
    createAuthController({ otpService }).createOtpChallenges
  );

  router.post(
    '/otp-verifications',
    createAuthController({ otpService, sessionService, secureCookies })
      .createOtpVerifications
  );

  router.post(
    '/sessions',
    createAuthController({ otpService, sessionService, secureCookies })
      .createSessions
  );

  router.post(
    '/me/contact-changes',
    authenticated,
    csrfProtected,
    createAuthController({ otpService }).createMeContactChanges
  );

  router.post(
    '/me/contact-verifications',
    authenticated,
    csrfProtected,
    createAuthController({ otpService }).createMeContactVerifications
  );

  router.delete(
    '/sessions/current',
    authenticated,
    csrfProtected,
    createAuthController({ sessionService, secureCookies })
      .deleteSessionsCurrent
  );

  return { name: 'auth', mount: '/api/v1', router };
}
