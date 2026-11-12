import { Router } from 'express';
import { requireSession, requireCsrf, requireRoles } from '../middlewares/session.js';
import { createSessionService } from '../services/session.service.js';
import { createBookingFinanceSourceService } from '../services/settlements/booking-finance-source.service.js';
import { createMongoPaymentWebhookRepository } from '../services/providers/payos/mongo-payment-webhook.repository.js';
import { createPayosPaymentWebhookService } from '../services/providers/payos/payment-webhook.service.js';
import { createPayosProvider, loadPayosConfig } from '../services/providers/payos/payos.provider.js';
import { createFinanceSourceController } from '../controllers/finance-source.controller.js';
import { createComplaintService } from '../services/complaints/complaint.service.js';
import { createMongoComplaintRepository } from '../services/complaints/mongo-complaint.repository.js';
import { createComplaintRouter } from './complaint.routes.js';
import { storageProfile } from '../config/storage-profile.js';
import { loadR2Config } from '../config/r2.js';
import { createPrivateImageService } from '../services/private-image.service.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createCustomerPhoneDirectory } from '../services/product-sales/customer-phone-directory.service.js';

export function financeSourceRuntime({ config, connection, ports, env = {}, clock = Date.now, sessionService }) {
  if (env.FINANCE_SOURCES_ENABLED !== undefined && !['true', 'false'].includes(env.FINANCE_SOURCES_ENABLED)) {
    throw new TypeError('FINANCE_SOURCES_ENABLED must be true or false');
  }
  if (env.FINANCE_SOURCES_ENABLED !== 'true' || !config.auth?.enabled || !connection?.db) return null;
  const compensationModel = storageProfile(env);
  const service = createBookingFinanceSourceService({ connection, clock: () => new Date(clock()), compensationModel });
  const session = sessionService ?? createSessionService({ connection, clock,
    tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const payos = loadPayosConfig(env);
  const webhook = payos ? createPayosPaymentWebhookService({ provider: createPayosProvider(payos),
    repository: createMongoPaymentWebhookRepository({ connection, finance: service }), clock: () => new Date(clock()) }) : null;
  const controller = createFinanceSourceController({ service, webhook });
  const router = Router();
  const r2 = loadR2Config(env);
  const images = r2 && ports?.privateMedia ? createPrivateImageService({ connection, media: ports.privateMedia,
    secret: config.auth.tokenSecret, maxImagesPerUser: r2.maxImagesPerUser }) : null;
  const { contactLookupSecret, contactEncryptionKey } = config.auth;
  const phones = contactLookupSecret && contactEncryptionKey ? createCustomerPhoneDirectory({ connection,
    contactCrypto: createContactCrypto({ lookupSecret: contactLookupSecret, encryptionKey: contactEncryptionKey }) }) : null;
  const complaints = createComplaintService({ repository: createMongoComplaintRepository({ connection,
    finance: service, cursorSecret: config.auth.tokenSecret, compensationModel, phones, clock }), readImage: images?.read, clock });
  router.use('/complaints', createComplaintRouter({ service: complaints, sessionService: session, clock }));
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  const auth = requireSession(session, { clock }), csrf = requireCsrf(session), sitter = requireRoles('PET_SITTER');
  router.get('/visits/:id/execution', auth, sitter, controller.execution);
  router.post('/visits/:id/check-ins', auth, sitter, csrf, controller.checkIn);
  router.patch('/visits/:id/checklists', auth, sitter, csrf, controller.checklist);
  router.post('/visits/:id/check-outs', auth, sitter, csrf, controller.checkOut);
  router.post('/bookings/:id/tax-assessments', auth, requireRoles('ADMIN'), csrf, controller.assessment);
  if (webhook) router.post('/payments/payos/webhook', controller.payment);
  return { router, service, complaints };
}
