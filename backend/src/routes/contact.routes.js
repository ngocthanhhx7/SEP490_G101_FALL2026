import { createContactService } from '../services/contact.service.js';
import { requireSameOrigin } from '../middlewares/same-origin.js';
import { createContactController } from '../controllers/contact.controller.js';

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { AppError } from '../utils/app-error.js';

export function contactModule({ config, ports }) {
  const router = Router();
  const service = createContactService({ config, ports });
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post(
    '/messages',
    requireSameOrigin,
    rateLimit({
      windowMs: 3600000,
      limit: 3,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(new AppError(429, 'RATE_LIMITED', 'Please try again later'))
    }),
    createContactController({ service }).createMessages
  );
  return { name: 'contact', mount: '/api/v1/contact', router };
}
