import { Router } from 'express';
import { createSessionService } from '../services/session.service.js';
import { createAdminDashboardRouter } from './admin-dashboard.routes.js';
import { createCustomerDashboardRouter } from './customer-dashboard.routes.js';
import { createEarningsRouter } from './earnings.routes.js';
import { createPayrollRouter } from './payroll.routes.js';
import { createSitterDashboardRouter } from './sitter-dashboard.routes.js';
import { createSitterListRouter } from './sitter-list.routes.js';
import { createSitterProfileRouter } from './sitter-profile.routes.js';
import { createStaffDashboardRouter } from './staff-dashboard.routes.js';
import { createAdminDashboardService } from '../services/dashboards/admin-dashboard.service.js';
import { createCustomerDashboardService } from '../services/dashboards/customer-dashboard.service.js';
import { createEarningsService } from '../services/dashboards/earnings.service.js';
import { createPayrollService } from '../services/dashboards/payroll.service.js';
import { createSitterDashboardService } from '../services/dashboards/sitter-dashboard.service.js';
import { createSitterListService } from '../services/dashboards/sitter-list.service.js';
import { createSitterProfileService } from '../services/dashboards/sitter-profile.service.js';
import { createStaffDashboardService } from '../services/dashboards/staff-dashboard.service.js';
import { createMongoDashboardRepositories } from '../services/dashboards/mongo-payroll.repository.js';
import { createWorkspaceAnalytics } from '../services/dashboards/workspace-analytics.service.js';
import { createWorkspaceAnalyticsController } from '../controllers/workspace-analytics.controller.js';
import { requireSession } from '../middlewares/session.js';

// The application registry composes durable readers. Missing primary collections
// remain INTEGRATION_PENDING rather than becoming successful empty projections.
export function dashboardReadRuntimeModule({ config, connection, clock = Date.now,
  repositories = {}, sessionService } = {}) {
  if (!config?.auth?.enabled) return null;
  const durableRepositories = createMongoDashboardRepositories({ connection,
    cursorSecret: config.auth.tokenSecret });
  // Explicit ports override the durable readers for isolated integration checks.
  const sourceRepositories = { ...durableRepositories, ...repositories };
  const session = sessionService ?? createSessionService({ connection,
    clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const services = {
    'admin-dashboard': createAdminDashboardService({ repository: sourceRepositories['admin-dashboard'] }),
    'customer-dashboard': createCustomerDashboardService({ repository: sourceRepositories['customer-dashboard'] }),
    earnings: createEarningsService({ repository: sourceRepositories.earnings }),
    payroll: createPayrollService({ repository: sourceRepositories.payroll }),
    'sitter-dashboard': createSitterDashboardService({ repository: sourceRepositories['sitter-dashboard'] }),
    'sitter-list': createSitterListService({ repository: sourceRepositories['sitter-list'] }),
    'sitter-profile': createSitterProfileService({ repository: sourceRepositories['sitter-profile'] }),
    'staff-dashboard': createStaffDashboardService({ repository: sourceRepositories['staff-dashboard'] })
  };
  const childOptions = repositoryKey => ({ sessionPort: session, service: services[repositoryKey] });
  const router = Router();
  router.get('/workspaces/:kind/analytics', requireSession(session), (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); next();
  }, createWorkspaceAnalyticsController(createWorkspaceAnalytics({ connection, clock })));
  router.use(createAdminDashboardRouter(childOptions('admin-dashboard')));
  router.use(createCustomerDashboardRouter(childOptions('customer-dashboard')));
  router.use(createEarningsRouter(childOptions('earnings')));
  router.use(createPayrollRouter(childOptions('payroll')));
  router.use(createSitterDashboardRouter(childOptions('sitter-dashboard')));
  router.use(createSitterListRouter(childOptions('sitter-list')));
  router.use(createSitterProfileRouter(childOptions('sitter-profile')));
  router.use(createStaffDashboardRouter(childOptions('staff-dashboard')));
  return { name: 'dashboard-read', mount: '/api/v1', router };
}
