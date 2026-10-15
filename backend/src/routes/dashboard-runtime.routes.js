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

// The application registry owns this composition. Missing source repositories are
// deliberately left undefined (apart from the optional durable payroll adapter)
// so the read boundary returns INTEGRATION_PENDING instead of fake projections.
export function dashboardReadRuntimeModule({ config, connection, clock = Date.now,
  repositories = {}, sessionService } = {}) {
  if (!config?.auth?.enabled) return null;
  const durableRepositories = createMongoDashboardRepositories({ connection,
    cursorSecret: config.auth.tokenSecret });
  // Explicit ports are test/integration overrides. The durable payroll reader
  // is only selected when no override is supplied and remains fail-closed until
  // P41's persisted SettlementRequest/User records are available.
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
