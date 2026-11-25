import { createServer } from 'node:http';
import { loadConfig } from './config/environment.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { startWebPushWorker } from './jobs/web-push.job.js';
import { startEarningAccrualWorker } from './jobs/earning-accrual.job.js';
import { startEmployeeDispatchWorker } from './jobs/employee-dispatch.job.js';
import { startBookingChangeWorker } from './jobs/booking-change.job.js';
import { startApplicationMailWorker } from './jobs/application-mail.job.js';
import { startCustomerTierWorker } from './jobs/customer-tier.job.js';
import { createCustomerTierService } from './services/customer-tier.service.js';
import { createMongoCustomerTierRepository } from './services/mongo-customer-tier.repository.js';
import { startProductPickupExpiryWorker } from './jobs/product-pickup-expiry.job.js';
import { createProductPickupExpiryService } from './services/product-sales/product-order-management.service.js';
import { assertRuntimeStorageProfile } from './config/storage-profile.js';
import { referenceCatalogSource } from './models/reference-catalog-source.js';
import { assertReferenceCatalogStorage } from './services/reference-catalog-storage.service.js';
import { startVisitCompletionMonitor } from './jobs/visit-completion-monitor.job.js';
import { startBookingNotificationsWorker } from './jobs/booking-notifications.job.js';

export async function startRuntime({ env = process.env, logger = () => {}, ...appOptions } = {}) {
  const config = loadConfig(env);
  const connection = await connectDatabase(config);
  const lifecycle = { draining: false };
  let webPushWorker;
  let visitReminderWorker, paymentExpiryWorker;
  let server, accrualWorker, dispatchWorker, applicationMailWorker, customerTierWorker, productPickupExpiryWorker, completionMonitor, bookingChangeWorker;
  try {
    const app = createApp({ ...appOptions, config, connection, lifecycle, logger, env });
    if (config.nodeEnv === 'production') await assertRuntimeStorageProfile(connection, app.locals.compensationProfile);
    if (referenceCatalogSource(connection) === 'target') await assertReferenceCatalogStorage(connection.db);
    server = createServer(app);
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, resolve);
    });
    if (app.locals.financeSources && app.locals.compensationProfile === 'LEGACY_PARTNER') accrualWorker = startEarningAccrualWorker({ service: app.locals.financeSources, logger });
    if (app.locals.employeeDispatch) dispatchWorker = startEmployeeDispatchWorker({ service: app.locals.employeeDispatch, logger });
    if (app.locals.visitCompletionMonitor) completionMonitor = startVisitCompletionMonitor({ service: app.locals.visitCompletionMonitor, logger });
    if (app.locals.visitReminders) visitReminderWorker = startBookingNotificationsWorker({ service: app.locals.visitReminders, intervalMs: 15 * 60000, event: 'visit_reminders', logger });
    if (app.locals.paymentExpiry) paymentExpiryWorker = startBookingNotificationsWorker({ service: app.locals.paymentExpiry, intervalMs: 60000, event: 'payment_expiry', logger });
    if (app.locals.webPush) webPushWorker = startWebPushWorker({ service: app.locals.webPush, logger });
    if (app.locals.bookingChange) bookingChangeWorker = startBookingChangeWorker({ service: app.locals.bookingChange, logger });
    if (app.locals.applicationMail) applicationMailWorker = startApplicationMailWorker({ service: app.locals.applicationMail, logger });
    customerTierWorker = startCustomerTierWorker({ enabled: config.customerTierJobEnabled, createService: () =>
      createCustomerTierService({ repository: createMongoCustomerTierRepository(connection), logger }) });
    productPickupExpiryWorker = startProductPickupExpiryWorker({
      enabled: config.productPickupExpiryJobEnabled && env.PRODUCT_SALES_ENABLED === 'true' && config.auth.enabled,
      createService: () => createProductPickupExpiryService({ connection, clock: appOptions.clock, logger }),
      logger
    });
  } catch {
    await Promise.allSettled([visitReminderWorker?.stop(), paymentExpiryWorker?.stop(), webPushWorker?.stop(),
      productPickupExpiryWorker?.stop(), completionMonitor?.stop(), customerTierWorker?.stop(),
      applicationMailWorker?.stop(), bookingChangeWorker?.stop(), dispatchWorker?.stop(), accrualWorker?.stop()]);
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await connection.close();
    throw new Error('HTTP server failed to start');
  }
  let stopping;
  function stop() {
    if (stopping) return stopping;
    lifecycle.draining = true;
    stopping = (async () => {
      let forced = false;
      const timer = setTimeout(() => { forced = true; server.closeAllConnections(); }, config.shutdownTimeoutMs);
      try { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
      finally {
        clearTimeout(timer);
        await visitReminderWorker?.stop();
        await paymentExpiryWorker?.stop();
        await webPushWorker?.stop();
        await productPickupExpiryWorker?.stop();
        await completionMonitor?.stop();
        await customerTierWorker?.stop();
        await applicationMailWorker?.stop();
        await bookingChangeWorker?.stop();
        await dispatchWorker?.stop();
        await accrualWorker?.stop();
        await connection.close();
      }
      logger({ event: 'shutdown_complete', forced });
    })();
    return stopping;
  }
  return { server, connection, lifecycle, config, stop };
}
