import { Router } from 'express';
import { createSessionService } from '../services/session.service.js';
import {
  requireSession,
  requireRoles,
  requireCsrf
} from '../middlewares/session.js';
import { createPetCareController } from '../controllers/pet-care.controller.js';
import { createPetCareManagement } from '../services/pet-care-management.service.js';
import { petCareModels } from '../models/pet-care.model.js';
export function petCareRuntimeModule({ config, connection, clock = Date.now }) {
  if (!config.auth?.enabled) return null;
  const repository = { connection, models: petCareModels(connection) },
    management = createPetCareManagement({ repository, clock });
  const session = createSessionService({
    connection,
    clock,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });
  const router = Router(),
    c = createPetCareController({ management }),
    customer = requireRoles('CUSTOMER'),
    csrf = requireCsrf(session);
  router.use(
    (_req, res, next) => {
      res.set('Cache-Control', 'private, no-store');
      next();
    },
    requireSession(session, { clock })
  );
  router.get('/catalog', c.catalog);
  router.get('/pets', customer, c.pets);
  router.get('/addresses', customer, c.addresses);
  router.post('/pets', customer, csrf, c.pet);
  router.post('/addresses', customer, csrf, c.address);
  return { name: 'pet-care', mount: '/api/v1/pet-care', router };
}
