import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { ipRateLimit } from '../services/ip-rate-limiter.js';
import { registerService, resendService, verifyService } from '../services/registration-services.js';

const registrationBody = z.object({
  fullName: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
}).strict().superRefine((body, context) => {
  if ((body.email === undefined) === (body.phone === undefined)) {
    context.addIssue({ code: 'custom', path: ['contact'], message: 'Supply exactly one contact method' });
  }
});

const resendBody = z.object({
  contactType: z.enum(['email', 'phone']).optional(),
  contact: z.string().optional(),
}).strict();

const verifyBody = z.object({
  contactType: z.enum(['email', 'phone']).optional(),
  contact: z.string().optional(),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be six decimal digits'),
}).strict();

export function rejectAuthenticated(request, _response, next) {
  const authenticated = Boolean(
    request.user
    || request.auth?.userId
    || request.auth?.sub
    || request.isAuthenticated?.(),
  );
  if (authenticated) return next(new AppError('ALREADY_AUTHENTICATED', 403));
  return next();
}

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

function readBearerIdentity(request, _response, next) {
  const authorization = request.get('authorization');
  let registrationToken;
  if (authorization !== undefined) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
    if (!match) return next(new AppError('VALIDATION_ERROR', 400, { field: 'Authorization' }));
    registrationToken = match[1];
  }

  const { contactType, contact } = request.validatedBody;
  const contactMode = contactType !== undefined || contact !== undefined;
  if (contactMode && (!contactType || typeof contact !== 'string')) {
    return next(new AppError('VALIDATION_ERROR', 400, { field: 'contact' }));
  }
  if (Boolean(registrationToken) === contactMode) {
    return next(new AppError('VALIDATION_ERROR', 400, { field: 'identity' }));
  }

  request.registrationIdentity = registrationToken
    ? { registrationToken }
    : { contactType, contact };
  return next();
}

function sendResult(response, result) {
  return response.status(result.statusCode).json(result.body);
}

export function createRegistrationRouter() {
  const router = Router();
  router.post(
    '/',
    rejectAuthenticated,
    ipRateLimit('REGISTER', config.ipRateLimits.register),
    validateBody(registrationBody),
    async (request, response) => sendResult(response, await registerService(request.validatedBody)),
  );
  router.post(
    '/resend',
    ipRateLimit('RESEND', config.ipRateLimits.resend),
    validateBody(resendBody),
    readBearerIdentity,
    async (request, response) => sendResult(response, await resendService(request.registrationIdentity)),
  );
  router.post(
    '/verify',
    ipRateLimit('VERIFY', config.ipRateLimits.verify),
    validateBody(verifyBody),
    readBearerIdentity,
    async (request, response) => sendResult(
      response,
      await verifyService(request.registrationIdentity, request.validatedBody.otp),
    ),
  );
  return router;
}
