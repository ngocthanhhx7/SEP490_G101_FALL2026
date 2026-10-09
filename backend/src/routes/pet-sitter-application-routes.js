import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { PetSitterApplication } from '../models/pet-sitter-application.js';
import { receivePetSitterApplicationFiles } from '../middlewares/pet-sitter-upload.js';
import { ipRateLimit } from '../services/ip-rate-limiter.js';
import {
  cancelPendingPetSitterApplication,
  resendPetSitterApplicationOtp,
  submitPetSitterApplication,
  verifyPetSitterApplicationOtp,
} from '../services/pet-sitter-application-services.js';

const applicationBodySchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  age: z.string(),
  gender: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']),
  location: z.string(),
  experience: z.string(),
  acceptedSpecies: z.union([z.string(), z.array(z.string())]),
  bio: z.string(),
  nationalId: z.string(),
}).strict();

const verifyBodySchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'OTP must be six decimal digits'),
}).strict();

function parseBody(schema) {
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

function readApplicationToken(request, _response, next) {
  const authorization = request.get('authorization');
  const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) return next(new AppError('VALIDATION_ERROR', 400, { field: 'Authorization' }));
  request.applicationToken = match[1];
  return next();
}

function sendResult(response, result) {
  if (result.statusCode === 204) return response.status(204).end();
  return response.status(result.statusCode).json(result.body);
}

export function createPetSitterApplicationRouter() {
  const router = Router();
  router.get('/me', async (request, response, next) => {
    if (!request.user) return next(new AppError('AUTHENTICATION_REQUIRED', 401));
    if (request.user.accountType !== 'PET_SITTER_APPLICANT') {
      return next(new AppError('FORBIDDEN', 403));
    }
    const application = await PetSitterApplication.findOne({
      _id: request.user.userId,
      status: 'SUBMITTED_FOR_REVIEW',
      emailVerifiedAt: { $ne: null },
    }).select('fullName email status submittedAt');
    if (!application) return next(new AppError('SITTER_APPLICATION_NOT_FOUND', 404));
    return response.status(200).json({
      id: String(application._id),
      fullName: application.fullName,
      email: application.email,
      status: application.status,
      submittedAt: application.submittedAt,
    });
  });

  router.post(
    '/',
    ipRateLimit('SITTER_APPLICATION', config.ipRateLimits.sitterApplication),
    receivePetSitterApplicationFiles,
    parseBody(applicationBodySchema),
    async (request, response) => sendResult(
      response,
      await submitPetSitterApplication(request.validatedBody, request.files ?? {}),
    ),
  );

  router.post(
    '/verify-otp',
    ipRateLimit('SITTER_VERIFY', config.ipRateLimits.sitterVerify),
    parseBody(verifyBodySchema),
    readApplicationToken,
    async (request, response) => sendResult(
      response,
      await verifyPetSitterApplicationOtp(request.applicationToken, request.validatedBody.otp),
    ),
  );

  router.post(
    '/resend-otp',
    ipRateLimit('SITTER_RESEND', config.ipRateLimits.sitterResend),
    readApplicationToken,
    async (request, response) => sendResult(
      response,
      await resendPetSitterApplicationOtp(request.applicationToken),
    ),
  );

  router.delete(
    '/pending',
    readApplicationToken,
    async (request, response) => sendResult(
      response,
      await cancelPendingPetSitterApplication(request.applicationToken),
    ),
  );

  return router;
}
