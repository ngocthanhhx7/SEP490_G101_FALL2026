import { Router } from 'express';
import { AppError, metadata } from '../utils/app-error.js';
import { normalizeCustomerDisplayName } from '../services/customer-registration.service.js';

const CHALLENGE_KEYS = new Set(['channel', 'contact', 'purpose']);
const VERIFICATION_KEYS = new Set(['challengeId', 'channel', 'contact', 'purpose', 'code']);
const REGISTRATION_VERIFICATION_KEYS = new Set([...VERIFICATION_KEYS, 'displayName', 'policyVersions']);

function hasOnlyKeys(body, keys) {
  return body && typeof body === 'object' && !Array.isArray(body)
    && Object.keys(body).every(key => keys.has(key))
    && [...keys].every(key => Object.hasOwn(body, key));
}

function respond(res, req, status, data) {
  res.status(status).json({ data, meta: metadata(req) });
}

export function authModule({ otpService, sessionService, accountSettingsService, requireAuthenticated, requireCsrf,
  secureCookies = true } = {}) {
  if (typeof otpService?.begin !== 'function' || typeof otpService?.verify !== 'function'
    || typeof sessionService?.authenticate !== 'function' || typeof sessionService?.verifyCsrf !== 'function'
    || typeof sessionService?.getCurrentUser !== 'function'
    || typeof sessionService?.setCookie !== 'function' || typeof sessionService?.clearCookie !== 'function'
    || typeof sessionService?.revoke !== 'function' || typeof requireAuthenticated !== 'function'
    || typeof accountSettingsService?.listVerifiedContacts !== 'function'
    || typeof requireCsrf !== 'function' || typeof secureCookies !== 'boolean') {
    throw new TypeError('OTP, session and authentication middleware dependencies are required');
  }
  const router = Router();
  const authenticated = requireAuthenticated;
  const csrfProtected = requireCsrf;

  router.get('/me', authenticated, async (req, res) => {
    const user = await sessionService.getCurrentUser(req.auth);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    const contacts = await accountSettingsService.listVerifiedContacts(req.auth);
    return respond(res, req, 200, { user, contacts });
  });

  router.post('/otp-challenges', async (req, res) => {
    if (!hasOnlyKeys(req.body, CHALLENGE_KEYS)) {
      return respond(res, req, 422, { code: 'VALIDATION_FAILED', message: 'OTP request is invalid' });
    }
    const challenge = await otpService.begin(req.body);
    return respond(res, req, 202, {
      challengeId: challenge.challengeId,
      expiresInSeconds: challenge.expiresInSeconds,
      resendAfterSeconds: challenge.resendAfterSeconds
    });
  });

  router.post('/otp-verifications', async (req, res) => {
    if (!hasOnlyKeys(req.body, REGISTRATION_VERIFICATION_KEYS) || req.body.purpose !== 'REGISTER') {
      return respond(res, req, 422, { code: 'VALIDATION_FAILED', message: 'OTP verification request is invalid' });
    }
    const displayName = normalizeCustomerDisplayName(req.body.displayName);
    const result = await otpService.verify({ ...req.body, displayName });
    if (result.status !== 'VERIFIED' || result.authenticated !== true || !result.session) {
      throw new AppError(503, 'REGISTRATION_UNAVAILABLE', 'Customer registration could not be completed');
    }
    sessionService.setCookie(res, result.session, { secure: secureCookies });
    return respond(res, req, 200, {
      verified: true,
      authenticated: true,
      user: result.session.user,
      csrfToken: result.session.csrfToken,
      expiresAt: new Date(result.session.expiresAt).toISOString()
    });
  });

  router.post('/sessions', async (req, res) => {
    if (!hasOnlyKeys(req.body, VERIFICATION_KEYS) || req.body.purpose !== 'LOGIN') {
      return respond(res, req, 422, { code: 'VALIDATION_FAILED', message: 'Session request is invalid' });
    }
    const result = await otpService.verify(req.body);
    if (!result.authenticated) return respond(res, req, 200, { authenticated: false });
    sessionService.setCookie(res, result.session, { secure: secureCookies });
    return respond(res, req, 200, {
      authenticated: true,
      user: result.session.user,
      csrfToken: result.session.csrfToken,
      expiresAt: new Date(result.session.expiresAt).toISOString()
    });
  });

  router.post('/me/contact-changes', authenticated, csrfProtected, async (req, res) => {
    if (!hasOnlyKeys(req.body, new Set(['channel', 'contact']))) {
      return respond(res, req, 422, { code: 'VALIDATION_FAILED', message: 'Contact change request is invalid' });
    }
    const challenge = await otpService.begin({ ...req.body, purpose: 'CONTACT_CHANGE', actor: req.auth });
    return respond(res, req, 202, {
      challengeId: challenge.challengeId,
      expiresInSeconds: challenge.expiresInSeconds,
      resendAfterSeconds: challenge.resendAfterSeconds
    });
  });

  router.post('/me/contact-verifications', authenticated, csrfProtected, async (req, res) => {
    if (!hasOnlyKeys(req.body, VERIFICATION_KEYS) || req.body.purpose !== 'CONTACT_CHANGE') {
      return respond(res, req, 422, { code: 'VALIDATION_FAILED', message: 'Contact verification request is invalid' });
    }
    const result = await otpService.verify({ ...req.body, actor: req.auth });
    return respond(res, req, 200, { verified: result.status === 'VERIFIED' });
  });

  router.delete('/sessions/current', authenticated, csrfProtected, async (req, res) => {
    await sessionService.revoke(req);
    sessionService.clearCookie(res, { secure: secureCookies });
    res.sendStatus(204);
  });

  return { name: 'auth', mount: '/api/v1', router };
}
