import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
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
import { createConfiguredRoutingProvider } from '../services/sitter-matching/commercial-routing.service.js';
import { createModelRegistry } from '../services/sitter-matching/model-registry.service.js';
import { createTrainingReadinessService } from '../services/ai-training/training-readiness.service.js';
export function aiRuntimeModule({
  config,
  connection,
  clock = Date.now,
  env = {},
  routingProvider
}) {
  if (!config.ai?.enabled || !config.auth?.enabled) return null;
  const repository = createAiRepository(connection, clock, { employeeSchedulingEnabled: env.EMPLOYEE_SCHEDULING_ENABLED === 'true' });
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
      createConfiguredRoutingProvider({ env, config, clock }),
    clock
  });
  const management = createAiManagement({ repository, clock }),
    c = createAiController({ service, management, registry: createModelRegistry({ repository, clock }), training: createTrainingReadinessService({ connection, clock }) });
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
  router.get('/admin/status', admin, c.status);
  const auditRate = rateLimit({ windowMs: 60000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: req => req.auth.userId });
  router.get('/admin/training-readiness', admin, auditRate, c.trainingReadiness);
  router.post('/admin/model-imports', admin, csrf, c.importModel);
  router.post('/admin/models/:modelId/reviews', admin, csrf, c.reviewModel);
  return { name: 'ai', mount: '/api/v1/ai', router };
}
