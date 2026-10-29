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
import { privateImageRuntimeModule } from './routes/private-image.routes.js';
import { settlementRequestRuntimeModule } from './routes/settlement-runtime.js';

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
  const customerProfile = customerProfileRuntimeModule(context);
  const applicationStatus = applicationStatusModule(context);
  const userAdmin = config.auth?.enabled ? userAdminModule(context) : null;
  const privateImages = privateImageRuntimeModule(context);
  const suppliedModules = moduleFactories.map((factory) => factory(context))
    .filter(module => module !== null && module !== undefined);
  const catalogModules = serviceCatalogRuntimeModules(context).filter(
    (module) =>
      !suppliedModules.some((supplied) => supplied.name === module.name)
  );
  const settlement = suppliedModules.some(module => module.name === 'settlement-requests')
    ? null : settlementRequestRuntimeModule(context);
  registerModules(app, [
    contactModule(context),
    healthModule(context),
    publicPolicyModule(context),
    ...(auth ? [auth] : []),
    ...(customerProfile ? [customerProfile] : []),
    ...(applicationStatus ? [applicationStatus] : []),
    ...(userAdmin ? [userAdmin] : []),
    ...(privateImages ? [privateImages] : []),
    ...(settlement ? [settlement] : []),
    ...catalogModules,
    ...(pricing ? [pricing] : []),
    ...(petCare ? [petCare] : []),
    ...(ai ? [ai] : []),
    ...suppliedModules
  ]);
  app.use(notFound, errorHandler(logger));
  return app;
}
