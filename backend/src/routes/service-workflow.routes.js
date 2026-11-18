import { Router } from 'express';
import { requireSession, requireCsrf, requireRoles } from '../middlewares/session.js';
import { createServiceWorkflowController } from '../controllers/service-workflow.controller.js';
export function createServiceWorkflowRouter({ templates, execution, sessionService, clock = Date.now }) {
  const router = Router(),
    auth = requireSession(sessionService, { clock }),
    csrf = requireCsrf(sessionService);
  const admin = requireRoles('ADMIN'),
    staff = requireRoles('STAFF', 'ADMIN');
  const controller = createServiceWorkflowController({ templates, execution });
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  router.get('/services/admin/:id/workflow', auth, admin, controller.read);
  router.put('/services/admin/:id/workflow/draft', auth, admin, csrf, controller.template('DRAFT'));
  router.post('/services/admin/:id/workflow/validation', auth, admin, csrf, controller.template('VALIDATE'));
  router.post('/services/admin/:id/workflow/publications', auth, admin, csrf, controller.template('PUBLISH'));
  router.post('/services/admin/:id/workflow/retirements', auth, admin, csrf, controller.template('RETIRE'));
  router.get(
    '/visits/:id/workflow',
    auth,
    requireRoles('CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'),
    controller.execution
  );
  router.patch('/visits/:id/workflow/tasks', auth, requireRoles('PET_SITTER'), csrf, controller.task);
  router.post('/visits/:id/workflow/reviews', auth, staff, csrf, controller.review);
  return router;
}
