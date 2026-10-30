import { payrollModels } from '../../models/payroll.model.js';
import { AppError } from '../../utils/app-error.js';

export async function assertPayrollStorage(connection) {
  const models = payrollModels(connection);
  const collections = new Set((await connection.db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name));
  for (const model of Object.values(models)) {
    if (!collections.has(model.collection.name)) throw new AppError(409, 'PAYROLL_STORAGE_NOT_READY', 'Provision payroll storage first');
    const expected = model.schema.indexes().filter(([, options]) => options.unique);
    if (!expected.length) continue;
    const actual = await model.collection.listIndexes().toArray();
    if (model.modelName === 'PayrollStatement' && actual.some(index => index.name === 'employeeId_1_periodStart_1_periodEnd_1'))
      throw new AppError(409, 'PAYROLL_STORAGE_NOT_READY', 'Migrate the obsolete all-history period index first');
    if (expected.some(([key, options]) => !actual.some(index => index.unique &&
      JSON.stringify(index.key) === JSON.stringify(key) && JSON.stringify(index.partialFilterExpression) === JSON.stringify(options.partialFilterExpression))))
      throw new AppError(409, 'PAYROLL_STORAGE_NOT_READY', 'Provision payroll indexes first');
  }
}
