import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { ipRateLimit } from '../services/ip-rate-limiter.js';
import { logout, requestLoginOtp, verifyLoginOtp } from '../services/login-services.js';

const contactBody = z.object({
  contactType: z.enum(['email', 'phone']),
  contact: z.string().min(1),
}).strict();

const verifyBody = contactBody.extend({
  otp: z.string().regex(/^\d{6}$/, 'OTP must be six decimal digits'),
}).strict();

function validateBody(schema) {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => issue.path[0]).filter(Boolean))];
      return next(new AppError('VALIDATION_ERROR', 400, { fields }));
    }
    request.validatedBody = parsed.data;
    return next();
  };
}

function sendResult(response, result) {
  if (result.statusCode === 204) return response.status(204).end();
  return response.status(result.statusCode).json(result.body);
}

export function createLoginRouter() {
  const router = Router();

  router.get('/me', (request, _response, next) => {
    if (!request.user) return next(new AppError('AUTHENTICATION_REQUIRED', 401));
    return next();
  }, (request, response) => response.status(200).json({
    id: request.user.userId,
    fullName: request.user.fullName,
    role: request.user.accountType ?? 'CUSTOMER',
    ...(request.user.applicationStatus ? { applicationStatus: request.user.applicationStatus } : {}),
  }));

  router.post(
    '/request-otp',
    ipRateLimit('LOGIN_REQUEST', config.ipRateLimits.loginRequest),
    validateBody(contactBody),
    async (request, response) => sendResult(response, await requestLoginOtp(request.validatedBody)),
  );

  router.post(
    '/verify-otp',
    ipRateLimit('LOGIN_VERIFY', config.ipRateLimits.loginVerify),
    validateBody(verifyBody),
    async (request, response) => sendResult(response, await verifyLoginOtp(request.validatedBody)),
  );

  router.post('/logout', (request, _response, next) => {
    if (!request.authSessionId) return next(new AppError('AUTHENTICATION_REQUIRED', 401));
    return next();
  }, async (request, response) => sendResult(response, await logout(request.authSessionId)));

  return router;
}
