import { Router } from 'express';
import { createPayrollController } from '../controllers/payroll.controller.js';
import { createPayrollService } from '../services/payroll/payroll.service.js';
import { employeePayrollPolicyResolver } from '../constants/employee-payroll-policy.js';
import { createSessionService } from '../services/session.service.js';
import { requireSession, requireCsrf, requireRoles } from '../middlewares/session.js';

export function payrollRuntimeModule({ config, connection, clock = Date.now, sessionService, policy = employeePayrollPolicyResolver }) {
  if (!config.auth?.enabled || !connection?.model) return null;
  const session = sessionService ?? createSessionService({ connection, clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const service = createPayrollService({ connection, policy, clock: () => new Date(clock()) });
  const router = Router(), controller = createPayrollController(service), admin = requireRoles('ADMIN'), sitter = requireRoles('PET_SITTER'), csrf = requireCsrf(session);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, requireSession(session, { clock }));
  router.get('/me', sitter, controller.own);
  router.post('/contracts', admin, csrf, controller.contracts);
  router.post('/statements', admin, csrf, controller.prepare);
  router.get('/statements', admin, controller.statements);
  router.post('/statements/:id/decisions', admin, csrf, controller.statementDecision);
  router.post('/advances', sitter, csrf, controller.submit);
  router.get('/advances', admin, controller.list);
  router.post('/advances/:id/decisions', requireRoles('ADMIN', 'PET_SITTER'), csrf, controller.decision);
  return { name: 'payroll', mount: '/api/v1/payroll', router, service };
}
