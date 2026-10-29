import { employeeSchedulingModels } from '../../models/employee-scheduling.model.js';
import { AppError } from '../../utils/app-error.js';

export async function provisionEmployeeScheduling(connection) {
  for (const model of Object.values(employeeSchedulingModels(connection))) {
    await model.createCollection();
    await model.createIndexes();
  }
  await connection.db.collection('visits').createIndex({ sitterId: 1, state: 1, startAt: 1, endAt: 1 });
  await connection.db.collection('visits').createIndex({ state: 1, startAt: 1, _id: 1 });
  await connection.db.collection('bookings').createIndex({ carePlanState: 1, createdAt: 1, _id: 1 });
}
export async function assertEmployeeSchedulingStorage(connection) {
  const names = new Set((await connection.db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name));
  for (const model of Object.values(employeeSchedulingModels(connection))) {
    if (!names.has(model.collection.name)) throw new AppError(409, 'SCHEDULING_STORAGE_NOT_READY', 'Provision employee scheduling storage first');
    const indexes = await model.collection.listIndexes().toArray();
    if (model.schema.indexes().some(([key, options]) => options.unique && !indexes.some(row => row.unique && JSON.stringify(row.key) === JSON.stringify(key))))
      throw new AppError(409, 'SCHEDULING_STORAGE_NOT_READY', 'Provision employee scheduling indexes first');
  }
}
