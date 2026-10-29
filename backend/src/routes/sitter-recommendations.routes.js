import { Router } from 'express';
import { createSessionService } from '../services/session.service.js';
import {
  requireSession,
  requireRoles,
  requireCsrf
} from '../middlewares/session.js';
import { createAiRepository } from '../services/sitter-matching/matching.repository.js';
import { createAiService } from '../services/sitter-matching/recommendation.service.js';
import { createAiManagement } from '../services/sitter-matching/management.service.js';
import { createAiController } from '../controllers/sitter-recommendations.controller.js';
import { createRoutingProvider } from '../services/sitter-matching/routing.service.js';
export function aiRuntimeModule({
  config,
  connection,
  clock = Date.now,
  routingProvider
}) {
  if (!config.ai?.enabled || !config.auth?.enabled) return null;
  const repository = createAiRepository(connection, clock);
  const session = createSessionService({
    connection,
    clock,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });
  const service = createAiService({
    repository,
    routingProvider:
      routingProvider ??
      createRoutingProvider({ baseUrl: config.ai.routingUrl, clock }),
    clock
  });
  const management = createAiManagement({ repository, clock }),
    c = createAiController({ service, management });
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  router.use(requireSession(session, { clock }));
  const customer = requireRoles('CUSTOMER'),
    admin = requireRoles('ADMIN'),
    csrf = requireCsrf(session);

  router.post('/recommendations', customer, csrf, c.recommend);
  router.get('/decisions/:decisionId', customer, c.decision);

  router.post('/admin/ranking-policies', admin, csrf, c.ranking);
  router.put('/admin/sitters/:userId', admin, csrf, c.sitter);
  router.post('/admin/schedule-blocks', admin, csrf, c.block);
  router.post('/admin/outcomes', admin, csrf, c.outcome);
  router.post('/admin/models', admin, csrf, c.model);
  return { name: 'ai', mount: '/api/v1/ai', router };
}
