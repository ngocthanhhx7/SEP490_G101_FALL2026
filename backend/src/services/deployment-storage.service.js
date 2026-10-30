import { provisionFinanceSources, assertFinanceSourceStorage } from './settlements/source-provisioning.js';
import { provisionEmployeeScheduling, assertEmployeeSchedulingStorage } from './employee-scheduling/scheduling-storage.service.js';
import { assertPayrollStorage } from './payroll/payroll-storage.service.js';

// Called by the deployment command after runtime modules register their models.
// Additive only: incompatible indexes/data must stop deployment for review.
export async function provisionDeploymentStorage({ connection, env = {} }) {
  for (const key of ['FINANCE_SOURCES_ENABLED', 'EMPLOYEE_SCHEDULING_ENABLED']) {
    if (env[key] !== undefined && !['true', 'false'].includes(env[key])) throw new TypeError(`Invalid ${key}`);
  }
  if (env.FINANCE_SOURCES_ENABLED === 'true') await provisionFinanceSources(connection);
  if (env.EMPLOYEE_SCHEDULING_ENABLED === 'true') await provisionEmployeeScheduling(connection);
  for (const model of Object.values(connection.models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  if (connection.models.PayrollStatement) await assertPayrollStorage(connection);
  if (env.FINANCE_SOURCES_ENABLED === 'true') await assertFinanceSourceStorage(connection);
  if (env.EMPLOYEE_SCHEDULING_ENABLED === 'true') await assertEmployeeSchedulingStorage(connection);
  return { state: 'INDEXES_READY', models: Object.keys(connection.models).length };
}
