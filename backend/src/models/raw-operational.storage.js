export const RAW_OPERATIONAL_CONTRACT = 'raw-operational-v1';
const number = (minimum = 0) => ({ bsonType: ['int', 'long', 'double'], minimum,
  maximum: Number.MAX_SAFE_INTEGER, multipleOf: 1 });
const counter = () => ({ ...number(), bsonType: ['int', 'long', 'double', 'null'] });
const objectId = { bsonType: 'objectId' }, date = { bsonType: 'date' }, text = { bsonType: 'string', minLength: 1 };
const fields = {
  bookings: ['version', 'financeGuardVersion', 'reviewGuardVersion'], visits: ['version', 'reviewGuardVersion'],
  payments: ['version'], paymentintents: ['version'], taxassessments: ['version'], cases: ['version', 'objectionCount']
};

export function rawOperationalCollectionOptions(name) {
  if (!Object.hasOwn(fields, name)) return undefined; // No invented refund adapter contract.
  const properties = Object.fromEntries(fields[name].map(field => [field, counter()]));
  const conditions = [{ $jsonSchema: { bsonType: 'object', properties } }];
  if (['payments', 'taxassessments'].includes(name)) properties.storageContractVersion = { enum: [1] };
  if (name === 'payments') conditions.push({ $or: [
    { storageContractVersion: { $ne: 1 } }, { provider: { $ne: 'PAYOS' } }, { state: { $ne: 'VERIFIED' } },
    { $jsonSchema: { required: ['bookingId', 'intentId', 'providerEventId', 'providerTransactionReference', 'receivedAt', 'verifiedAt', 'receiptMoney', 'version'],
      properties: { bookingId: objectId, intentId: objectId, providerEventId: text, providerTransactionReference: text,
        receivedAt: date, verifiedAt: date, version: number(), receiptMoney: { bsonType: 'object', required: ['amountVnd', 'currency'],
          properties: { amountVnd: number(1), currency: { enum: ['VND'] } } } } } }
  ] });
  if (name === 'taxassessments') conditions.push({ $or: [
    { storageContractVersion: { $ne: 1 } }, { state: { $ne: 'CONFIRMED' } },
    { $jsonSchema: { required: ['bookingId', 'confirmedBy', 'confirmedAt', 'evidenceReference', 'totalTaxVnd', 'version'],
      properties: { bookingId: objectId, confirmedBy: objectId, confirmedAt: date, totalTaxVnd: number(), version: number(),
        evidenceReference: { bsonType: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$' } } } }
  ] });
  return { validator: { $and: conditions }, validationLevel: 'strict', validationAction: 'error' };
}

export const rawOperationalCollections = Object.freeze(Object.keys(fields));
