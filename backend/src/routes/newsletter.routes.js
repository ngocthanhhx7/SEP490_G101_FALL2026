import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { canonicalizeContact } from '../services/contact-crypto.service.js';
import { createNewsletterService } from '../services/newsletter.service.js';
import { AppError, metadata } from '../utils/app-error.js';

export function newsletterModule({ config, connection, clock = Date.now }) {
  const router = Router();
  const service = config.auth?.enabled ? createNewsletterService({ connection, auth: config.auth, clock }) : null;
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/subscriptions', rateLimit({ windowMs: 3600000, limit: 5,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Please try again later'))
  }), async (req, res) => {
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
      throw new AppError(403, 'FORBIDDEN', 'Request origin is not allowed');
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).length !== 1 || !Object.hasOwn(req.body, 'email')) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Email is required');
    }
    const email = canonicalizeContact('EMAIL', req.body.email);
    if (!service) throw new AppError(503, 'NEWSLETTER_UNAVAILABLE', 'Newsletter is temporarily unavailable');
    await service.request(email);
    // This receipt confirms storage only, not mailbox ownership or marketing delivery.
    res.status(202).json({ data: { status: 'REQUESTED' }, meta: metadata(req) });
  });
  return { name: 'newsletter', mount: '/api/v1/newsletter', router };
}
