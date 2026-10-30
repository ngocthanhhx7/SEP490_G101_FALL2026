import { pricingRuntimeModule } from './routes/pricing.routes.js';
import { petCareRuntimeModule } from './routes/pet-care.routes.js';
import { aiRuntimeModule } from './routes/sitter-recommendations.routes.js';
import { contactModule } from './routes/contact.routes.js';
import { serviceCatalogRuntimeModules } from './routes/service-catalog-runtime.js';
import { customerProfileRuntimeModule } from './routes/customer-profile.routes.js';
import { applicationStatusModule } from './routes/application-status.routes.js';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createPorts } from './config/ports.js';
import { requestId, notFound, errorHandler } from './middlewares/http.js';
import { errorPayload } from './utils/app-error.js';
import { healthModule } from './routes/health.routes.js';
import { authenticationModule } from './routes/auth.module.js';
import { userAdminModule } from './routes/user-admin.routes.js';
import { registerModules } from './routes/module-registry.js';
import { createProviderPortOverrides } from './config/provider-ports.js';
import { publicPolicyModule } from './routes/public-policy.routes.js';
import { privateImageRuntimeModule, applicantDocumentRuntimeModule } from './routes/private-image.routes.js';
import { sitterApplicationRuntimeModule } from './routes/sitter-application.routes.js';

import { settlementRequestRuntimeModule } from './routes/settlement-runtime.js';
import { dashboardReadRuntimeModule } from './routes/dashboard-runtime.routes.js';
import { adminSettlementRuntimeModule } from './routes/admin-settlement-runtime.js';
import { sitterPublicProfileModule } from './routes/sitter-public-profile.routes.js';
import { financeSourceRuntime } from './routes/finance-source-runtime.js';
import { payrollRuntimeModule } from './routes/employee-payroll.routes.js';
import { bookingCheckoutRuntimeModule } from './routes/booking-checkout.routes.js';
import { employeeSchedulingRuntimeModule } from './routes/employee-scheduling.routes.js';
import { mapsRuntimeModule } from './routes/maps.routes.js';


export function createApp({
  config,
  connection,
  lifecycle,
  portOverrides,
  moduleFactories = [],
  logger = () => {},
  env = process.env,
  clock = Date.now
}) {
  const app = express();
  const basePorts = createPorts();
  const providerPortOverrides = createProviderPortOverrides({
    env,
    fallbackContactDelivery: basePorts.contactDelivery,
    logger
  });
  const ports = createPorts({ ...providerPortOverrides, ...portOverrides });
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use(requestId, helmet());
  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => req.path === '/health',
      handler: (req, res) =>
        res
          .status(429)
          .json(errorPayload(req, 'RATE_LIMITED', 'Too many requests'))
    })
  );
  app.use(express.json({ limit: '64kb', strict: true }));
  const context = { config, connection, lifecycle, ports, clock, env };
  const ai = aiRuntimeModule(context);
  const pricing = pricingRuntimeModule(context);
  const petCare = petCareRuntimeModule(context);
  const auth = authenticationModule({ ...context, logger });
  const financeSources = financeSourceRuntime(context);
  if (auth && financeSources) auth.router.use(financeSources.router);
  app.locals.financeSources = financeSources?.service ?? null;
  const customerProfile = customerProfileRuntimeModule(context);
  const applicationStatus = applicationStatusModule(context);
  const userAdmin = config.auth?.enabled ? userAdminModule(context) : null;
  const privateImages = privateImageRuntimeModule(context);
  const applicantDocuments = applicantDocumentRuntimeModule(context);
  const publicProfiles = auth && typeof connection?.model === 'function'
    ? sitterPublicProfileModule({ ...context, sessionService: auth.sessionService }) : null;
  const payroll = payrollRuntimeModule(context);
  const checkout = bookingCheckoutRuntimeModule(context);
  const employeeScheduling = employeeSchedulingRuntimeModule(context);
  const maps = mapsRuntimeModule(context);
  if (env.EMPLOYEE_DISPATCH_AGENT_ENABLED !== undefined && !['true', 'false'].includes(env.EMPLOYEE_DISPATCH_AGENT_ENABLED)) throw new TypeError('Invalid EMPLOYEE_DISPATCH_AGENT_ENABLED');
  if (env.EMPLOYEE_DISPATCH_AGENT_ENABLED === 'true' && !employeeScheduling) throw new TypeError('Employee dispatch agent requires employee scheduling');
  app.locals.employeeDispatch = env.EMPLOYEE_DISPATCH_AGENT_ENABLED === 'true' ? employeeScheduling.dispatch : null;
  const suppliedModules = moduleFactories.map((factory) => factory(context))
    .filter(module => module !== null && module !== undefined);
  const sitterApplications = config.auth?.enabled && !suppliedModules.some(module => module.name === 'sitter-applications')
    ? sitterApplicationRuntimeModule(context) : null;

  const catalogModules = serviceCatalogRuntimeModules(context).filter(
    (module) =>
      !suppliedModules.some((supplied) => supplied.name === module.name)
  );
  const settlement = suppliedModules.some(module => module.name === 'settlement-requests')
    ? null : settlementRequestRuntimeModule(context);
  const adminSettlement = suppliedModules.some(module => module.name === 'admin-settlements')
    ? null : adminSettlementRuntimeModule(context);
  const dashboards = suppliedModules.some(module => module.name === 'dashboard-read')
    ? null : dashboardReadRuntimeModule({ ...context, sessionService: auth?.sessionService });
  const suppliedDashboards = suppliedModules.filter(module => module.name === 'dashboard-read');
  if (suppliedDashboards.length > 1) throw new TypeError('Duplicate dashboard module');
  if (auth) {
    const dashboard = dashboards ?? suppliedDashboards[0];
    if (dashboard) {
      if (dashboard.mount !== auth.mount) throw new TypeError('Dashboard must share the authenticated API mount');
      auth.router.use(dashboard.router);
    }
  }
  registerModules(app, [
    contactModule(context),
    healthModule(context),
    publicPolicyModule(context),
    ...(auth ? [auth] : []),
    ...(customerProfile ? [customerProfile] : []),
    ...(applicationStatus ? [applicationStatus] : []),
    ...(userAdmin ? [userAdmin] : []),
    ...(privateImages ? [privateImages] : []),
    ...(applicantDocuments ? [applicantDocuments] : []),
    ...(sitterApplications ? [sitterApplications] : []),
    ...(publicProfiles ? [publicProfiles] : []),
    ...(payroll ? [payroll] : []),
    ...(checkout ? [checkout] : []),
    ...(employeeScheduling ? [employeeScheduling] : []),
    ...(maps ? [maps] : []),
    ...(settlement ? [settlement] : []),
    ...(dashboards && !auth ? [dashboards] : []),
    ...(adminSettlement ? [adminSettlement] : []),
    ...catalogModules,
    ...(pricing ? [pricing] : []),
    ...(petCare ? [petCare] : []),
    ...(ai ? [ai] : []),
    ...suppliedModules.filter(module => !auth || module.name !== 'dashboard-read')
  ]);
  app.use(notFound, errorHandler(logger));
  return app;
}
