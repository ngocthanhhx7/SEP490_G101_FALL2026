import { Router } from 'express';
import { createHealthController } from '../controllers/health.controller.js';
import { createHealthService } from '../services/health.service.js';

export function healthModule({ connection, lifecycle, config }) {
  const controller = createHealthController(createHealthService(connection, lifecycle, config.readinessTimeoutMs));
  const router = Router();
  router.get('/health', controller.health);
  router.get('/ready', controller.ready);
  return { name: 'health', mount: '/', router };
}
