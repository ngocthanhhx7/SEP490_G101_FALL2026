import { financeSourceModels } from '../../models/finance-source.model.js';
import { AppError } from '../../utils/app-error.js';

const primaryIndexes = [
  ['payments', { provider: 1, providerEventId: 1 }, { name: 'verified_provider_event', unique: true }],
  ['payments', { bookingId: 1 }, { name: 'one_verified_booking_receipt', unique: true, partialFilterExpression: { state: 'VERIFIED' } }],
  ['payments', { provider: 1, providerTransactionReference: 1 }, { name: 'one_verified_bank_reference', unique: true,
    partialFilterExpression: { state: 'VERIFIED', providerTransactionReference: { $type: 'string' } } }],
  ['taxassessments', { bookingId: 1 }, { name: 'one_confirmed_booking_assessment', unique: true, partialFilterExpression: { state: 'CONFIRMED' } }],
  ['paymentintents', { providerReference: 1 }, { name: 'payment_intent_provider_reference', unique: true }]
];

export async function provisionFinanceSources(connection) {
  for (const model of Object.values(financeSourceModels(connection))) {
    await model.createCollection(); await model.createIndexes();
  }
  for (const name of ['bookings', 'visits', 'payments', 'taxassessments', 'paymentintents', 'cases', 'refunds']) {
    if (!(await connection.db.listCollections({ name }, { nameOnly: true }).toArray()).length) {
      await connection.db.createCollection(name);
    }
  }
  for (const [name, keys, options] of primaryIndexes) await connection.db.collection(name).createIndex(keys, options);
}

export async function assertFinanceSourceStorage(connection) {
  try {
    for (const [name, keys, options] of primaryIndexes) {
      const indexes = await connection.db.collection(name).listIndexes().toArray();
      const index = indexes.find(row => row.name === options.name);
      if (!index?.unique || JSON.stringify(index.key) !== JSON.stringify(keys)
        || JSON.stringify(index.partialFilterExpression) !== JSON.stringify(options.partialFilterExpression)) throw new Error('Missing source index');
    }
    for (const model of Object.values(financeSourceModels(connection))) {
      const indexes = await model.collection.listIndexes().toArray();
      if (!indexes.some(row => row.name === '_id_' && row.key._id === 1)) throw new Error('Missing source collection');
      if (model.modelName === 'CareMediaBinding' && !indexes.some(row => row.unique
        && JSON.stringify(row.key) === JSON.stringify({ visitId: 1, kind: 1 }))) throw new Error('Missing media binding index');
    }
  } catch { throw new AppError(503, 'FINANCE_SOURCE_STORAGE_NOT_READY', 'Finance source storage is not provisioned'); }
}
