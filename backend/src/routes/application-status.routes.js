import { createApplicationStatusRuntimeService } from '../services/applications/application-status-runtime.service.js';
import { createApplicationStatusController } from '../controllers/application-status.controller.js';
import { Router } from 'express';

import { AppError } from '../utils/app-error.js';

export function applicationStatusModule({
  config,
  connection,
  ports,
  clock = Date.now
}) {
  if (!config.auth?.enabled) return null;
  const service = createApplicationStatusRuntimeService({
    config,
    connection,
    ports,
    clock
  });
  const router = Router();
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const origin = req.get('origin');
    if (
      req.get('sec-fetch-site') === 'cross-site' ||
      (origin && origin !== `${req.protocol}://${req.get('host')}`)
    ) {
      return next(
        new AppError(403, 'FORBIDDEN', 'Request origin is not allowed')
      );
    }
    next();
  });
  router.post(
    '/challenges',
    createApplicationStatusController({ service }).createChallenges
  );
  router.post(
    '/verify',
    createApplicationStatusController({ service }).createVerify
  );
  return {
    name: 'application-status',
    mount: '/api/v1/application-status',
    router
  };
}
