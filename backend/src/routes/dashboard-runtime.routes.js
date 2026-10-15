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

// The application registry owns this composition. Each missing repository is
// deliberately left undefined so the read boundary returns INTEGRATION_PENDING
// instead of fabricating an empty projection.
export function dashboardReadRuntimeModule({ config, connection, clock = Date.now,
  repositories = {}, sessionService } = {}) {
  if (!config?.auth?.enabled) return null;
  const session = sessionService ?? createSessionService({ connection,
    clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const services = {
    'admin-dashboard': createAdminDashboardService({ repository: repositories['admin-dashboard'] }),
    'customer-dashboard': createCustomerDashboardService({ repository: repositories['customer-dashboard'] }),
    earnings: createEarningsService({ repository: repositories.earnings }),
    payroll: createPayrollService({ repository: repositories.payroll }),
    'sitter-dashboard': createSitterDashboardService({ repository: repositories['sitter-dashboard'] }),
    'sitter-list': createSitterListService({ repository: repositories['sitter-list'] }),
    'sitter-profile': createSitterProfileService({ repository: repositories['sitter-profile'] }),
    'staff-dashboard': createStaffDashboardService({ repository: repositories['staff-dashboard'] })
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
