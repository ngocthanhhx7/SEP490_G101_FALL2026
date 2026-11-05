import { Router } from 'express';
import { createPublicServiceAreas } from '../services/public-service-areas.service.js';
import { createPublicServiceAreasController } from '../controllers/public-service-areas.controller.js';

export function publicServiceAreasModule({ config, env = {} }) {
  const service = createPublicServiceAreas({ enabled: config.auth?.enabled === true && env.EMPLOYEE_SCHEDULING_ENABLED === 'true' });
  const router = Router();
  router.get('/', createPublicServiceAreasController(service).list);
  return { name: 'public-service-areas', mount: '/api/v1/service-areas', router };
}
