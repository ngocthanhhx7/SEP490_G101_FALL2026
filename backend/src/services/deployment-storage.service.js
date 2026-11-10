import { provisionFinanceSources, assertFinanceSourceStorage } from './settlements/source-provisioning.js';
import { provisionEmployeeScheduling, assertEmployeeSchedulingStorage } from './employee-scheduling/scheduling-storage.service.js';
import { assertPayrollStorage } from './payroll/payroll-storage.service.js';
import { assertBookingReadStorage } from './booking-read-storage.service.js';
import { storageProfile, assertProfileModels } from '../config/storage-profile.js';
import { assertReferenceCatalogModels, referenceCatalogSource } from '../models/reference-catalog-source.js';
import { provisionReferenceCatalogStorage } from './reference-catalog-storage.service.js';
import { assertEmbeddedPresentationModels } from '../models/service-presentation.model.js';
import { assertSingleAccountRoleStorage } from './single-account-role.service.js';
import { provisionCustomerTierStorage } from './customer-tier-storage.service.js';

// Called by the deployment command after runtime modules register their models.
// Additive only: incompatible indexes/data must stop deployment for review.
export async function provisionDeploymentStorage({ connection, env = {} }) {
  assertProfileModels(connection, storageProfile(env));
  assertEmbeddedPresentationModels(connection);
  assertReferenceCatalogModels(connection);
  if (referenceCatalogSource(connection) === 'target') await provisionReferenceCatalogStorage(connection.db);
  for (const key of ['FINANCE_SOURCES_ENABLED', 'EMPLOYEE_SCHEDULING_ENABLED', 'BOOKING_CHECKOUT_ENABLED', 'CUSTOMER_TIER_JOB_ENABLED']) {
    if (env[key] !== undefined && !['true', 'false'].includes(env[key])) throw new TypeError(`Invalid ${key}`);
  }
  if (env.FINANCE_SOURCES_ENABLED === 'true') await provisionFinanceSources(connection, { legacyTasks: storageProfile(env) === 'LEGACY_PARTNER' });
  if (env.EMPLOYEE_SCHEDULING_ENABLED === 'true') await provisionEmployeeScheduling(connection);
  for (const model of Object.values(connection.models)) {
    if (model.collection.name === 'reference_catalog') continue;
    await model.createCollection();
    await model.createIndexes();
  }
  if (connection.models.User) await assertSingleAccountRoleStorage(connection.db);
  if (connection.models.PayrollStatement) await assertPayrollStorage(connection);
  if (env.FINANCE_SOURCES_ENABLED === 'true') await assertFinanceSourceStorage(connection, { legacyTasks: storageProfile(env) === 'LEGACY_PARTNER' });
  if (env.EMPLOYEE_SCHEDULING_ENABLED === 'true') await assertEmployeeSchedulingStorage(connection);
  if (env.BOOKING_CHECKOUT_ENABLED === 'true' || env.FINANCE_SOURCES_ENABLED === 'true') await assertBookingReadStorage(connection);
  if (env.CUSTOMER_TIER_JOB_ENABLED === 'true') await provisionCustomerTierStorage(connection);
  return { state: 'INDEXES_READY', models: Object.keys(connection.models).length };
}
