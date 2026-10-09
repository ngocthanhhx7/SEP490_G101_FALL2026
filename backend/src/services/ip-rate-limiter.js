import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { RegistrationIpRateLimit } from '../models/registration-ip-rate-limit.js';
import { sha256 } from '../utils/registration.js';
import { AppError } from '../errors/app-error.js';
import { config } from '../config/env.js';

function normalizeIp(ip) {
  if (typeof ip !== 'string') throw new AppError('IP_RATE_LIMITED', 429);
  const value = ip.trim().toLowerCase();
  if (value.startsWith('::ffff:') && isIP(value.slice(7)) === 4) return value.slice(7);
  return isIP(value) ? value : (() => { throw new AppError('IP_RATE_LIMITED', 429); })();
}

export async function consumeIpBucket(ipHash, endpoint, limit, { windowMs = config.ipRateLimits.windowMs } = {}) {
  if (!['REGISTER', 'RESEND', 'VERIFY', 'LOGIN_REQUEST', 'LOGIN_VERIFY', 'SITTER_APPLICATION', 'SITTER_RESEND', 'SITTER_VERIFY'].includes(endpoint) || !Number.isInteger(limit) || limit < 1) {
    throw new TypeError('Invalid IP rate-limit bucket configuration');
  }
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const attemptId = randomUUID();
  const bucketKey = `${ipHash}:${endpoint}`;

  let bucket;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      bucket = await RegistrationIpRateLimit.findOneAndUpdate(
        { bucketKey },
        [
          {
            $set: {
              ipHash: { $ifNull: ['$ipHash', { $literal: ipHash }] },
              endpoint: { $ifNull: ['$endpoint', { $literal: endpoint }] },
              bucketKey: { $ifNull: ['$bucketKey', { $literal: bucketKey }] },
              requestTimestamps: {
                $filter: {
                  input: { $ifNull: ['$requestTimestamps', []] },
                  as: 'timestamp',
                  cond: { $gte: ['$$timestamp', { $literal: cutoff }] },
                },
              },
              updatedAt: '$$NOW',
            },
          },
          {
            $set: {
              lastAttemptAllowed: { $lt: [{ $size: '$requestTimestamps' }, limit] },
              lastAttemptId: { $literal: attemptId },
              lastRequestAt: '$$NOW',
              requestTimestamps: {
                $cond: [
                  { $lt: [{ $size: '$requestTimestamps' }, limit] },
                  { $concatArrays: ['$requestTimestamps', ['$$NOW']] },
                  '$requestTimestamps',
                ],
              },
            },
          },
        ],
        {
          upsert: true,
          new: true,
          timestamps: false,
          projection: { requestTimestamps: 1, lastAttemptAllowed: 1, lastAttemptId: 1 },
        },
      );
      break;
    } catch (error) {
      if (error?.code !== 11000 || attempt > 0) throw error;
    }
  }

  const allowed = bucket.lastAttemptId === attemptId && bucket.lastAttemptAllowed === true;
  if (allowed) return { allowed: true, remaining: Math.max(0, limit - bucket.requestTimestamps.length) };

  const oldest = bucket.requestTimestamps[0];
  const retryAfterSeconds = oldest
    ? Math.max(1, Math.ceil((oldest.getTime() + windowMs - now.getTime()) / 1000))
    : Math.ceil(windowMs / 1000);
  return { allowed: false, retryAfterSeconds };
}

export function ipRateLimit(endpoint, limit, options) {
  return async function ipRateLimitMiddleware(request, _response, next) {
    try {
      const ip = normalizeIp(request.ip);
      const result = await consumeIpBucket(sha256(ip), endpoint, limit, options);
      if (!result.allowed) {
        return next(new AppError('IP_RATE_LIMITED', 429, { retryAfterSeconds: result.retryAfterSeconds }));
      }
      request.rateLimit = { endpoint, remaining: result.remaining };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
