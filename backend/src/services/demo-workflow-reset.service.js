import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { HANOI_DEMO_KEY } from '../constants/hanoi-demo-population.js';

const { BSON } = mongoose.mongo;
export const demoWorkflowCollections = Object.freeze(('aidecisions airoutingmatrixes aischeduleblocks aivisitoutcomes '
  + 'bookingearningsnapshots bookings visits caremediabindings cases completedbookingordinals customerreviewcommands '
  + 'earningaccrualoutboxes earningaccrualtasks earningadjustments earningledgerentries earnings '
  + 'employeeschedulecommands employeescheduleevents employeescheduleproposals employeevisitoffers employeevisittravels '
  + 'financesourcecommands financesourceevents financiallocks notificationevents notifications paymentintents payments '
  + 'payrolladjustments payrollcommands payrollservicecredits payrollsourceclaims payrollstatements '
  + 'productcarts productcustomerrefusals productorders refunds reviews salaryadvances settlementcommands settlementevents '
  + 'settlementevidences settlementoutboxes settlementrequests settlementtransferclaims settlementtransfers settlementweekclaims '
  + 'taxassessments weeklybookingcounters').split(' '));
const sitterStores = Object.freeze({
  users: '_id', sitterapplications: 'provisionedUserId', sitterstatuses: 'userId',
  sitterpublicprofiles: 'userId', aisitterprofiles: 'userId', employeeavailabilities: '_id',
  employeeavailabilityrevisions: 'sitterId', employmentcontracts: 'employeeId'
});
const hash = rows => {
  const digest = createHash('sha256');
  for (const row of rows) digest.update(BSON.serialize(row));
  return digest.digest('hex');
};
const stop = code => { const error = new Error(code); error.code = code; throw error; };
const clone = row => BSON.deserialize(BSON.serialize(row), { promoteValues: false });

// An operator-only maintenance command. No runtime route, auto-provision or TTL.
// The caller must drain every writer before apply; a snapshot alone cannot freeze writers.
export async function resetDemoWorkflows({ connection, apply = false, expectedDigest, writersFrozen = false }) {
  if (apply && (!writersFrozen || !/^[a-f0-9]{64}$/.test(expectedDigest ?? ''))) stop('RESET_CONFIRMATION_REQUIRED');
  const infos = await connection.db.listCollections({}, { nameOnly: true }).toArray();
  const names = infos.map(row => row.name).filter(name => !name.startsWith('system.')).sort();
  const session = await connection.startSession();
  try {
    return await session.withTransaction(async () => {
      let count = 0, bytes = 0;
      const source = new Map();
      for (const name of names) {
        const rows = await connection.db.collection(name).find({}, { session, promoteValues: false, maxTimeMS: 5000 })
          .sort({ _id: 1 }).limit(2001).toArray();
        count += rows.length;
        bytes += rows.reduce((sum, row) => sum + BSON.calculateObjectSize(row), 0);
        if (rows.length > 2000 || count > 5000 || bytes > 16 * 1024 * 1024) stop('RESET_READ_BUDGET_EXCEEDED');
        source.set(name, rows);
      }
      const users = source.get('users') ?? [];
      const selectedUsers = users.filter(row => row.roles?.includes('PET_SITTER')
        && typeof row.fixtureKey === 'string' && row.fixtureKey.startsWith(HANOI_DEMO_KEY + ':sitter-'));
      if (selectedUsers.some(row => row.roles.some(role => role !== 'PET_SITTER'))) stop('RESET_PROTECTED_ROLE');
      const sitterIds = new Set(selectedUsers.map(row => String(row._id)));
      const runs = source.get('demopopulationruns') ?? [];
      const manifest = runs.find(row => row._id === HANOI_DEMO_KEY);
      if (selectedUsers.length && (!manifest || !Array.isArray(manifest.records))) stop('RESET_MANIFEST_REQUIRED');
      const manifested = (name, id) => manifest?.records.some(record => record.collection === name && String(record.id) === String(id));
      const deletes = new Map();
      for (const [name, rows] of source) {
        const field = sitterStores[name];
        const targets = demoWorkflowCollections.includes(name) ? rows : field
          ? rows.filter(row => sitterIds.has(String(row[field]))) : [];
        if (!demoWorkflowCollections.includes(name) && targets.some(row => !manifested(name, row._id))) stop('RESET_UNMANIFESTED_SITTER_RECORD');
        deletes.set(name, targets);
      }
      const allDeletedIds = new Set([...deletes.values()].flatMap(rows => rows.map(row => String(row._id))));
      const manifestNext = manifest && clone(manifest);
      if (manifestNext) {
        manifestNext.records = manifestNext.records.filter(record => !(deletes.get(record.collection) ?? [])
          .some(row => String(row._id) === String(record.id)));
        // Keep the marker so the ordinary seed cannot recreate deleted demo employees.
        manifestNext.demoSittersRetired = true;
      }
      const products = source.get('products') ?? [], orders = source.get('productorders') ?? [];
      const reserved = new Map();
      for (const order of orders.filter(row => ['PLACED', 'READY'].includes(row.status))) {
        if (!Array.isArray(order.lines)) stop('RESET_RESERVATION_MISMATCH');
        for (const line of order.lines) {
          const quantity = Number(line.quantity), key = String(line.productId);
          if (!Number.isSafeInteger(quantity) || quantity < 1) stop('RESET_RESERVATION_MISMATCH');
          reserved.set(key, (reserved.get(key) ?? 0) + quantity);
        }
      }
      const productNext = new Map();
      for (const product of products) {
        const quantity = Number(product.quantityHeld), key = String(product._id);
        if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity !== (reserved.get(key) ?? 0)) stop('RESET_RESERVATION_MISMATCH');
        reserved.delete(key);
        if (quantity) {
          const version = Number(product.version);
          if (!Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) stop('RESET_PRODUCT_VERSION_INVALID');
          const next = clone(product);
          next.quantityHeld = new BSON.Int32(0);
          next.version = version + 1 <= 2147483647 ? new BSON.Int32(version + 1) : new BSON.Double(version + 1);
          productNext.set(key, next);
        }
      }
      if (reserved.size) stop('RESET_MISSING_PRODUCT');
      const after = new Map();
      for (const [name, rows] of source) {
        const removing = new Set((deletes.get(name) ?? []).map(row => String(row._id)));
        after.set(name, rows.filter(row => !removing.has(String(row._id))).map(row =>
          name === 'products' ? productNext.get(String(row._id)) ?? row
            : name === 'demopopulationruns' && row._id === HANOI_DEMO_KEY ? manifestNext : row));
      }
      const referencesDeleted = value => {
        if (value === null || value === undefined || value instanceof Date || Buffer.isBuffer(value)) return false;
        if (typeof value === 'string' || value?._bsontype === 'ObjectId') {
          const text = String(value);
          return [...allDeletedIds].some(id => id.length >= 24 && text.includes(id));
        }
        if (value?._bsontype) return false;
        return typeof value === 'object' && Object.values(value).some(referencesDeleted);
      };
      for (const [name, rows] of after) {
        if (rows.some(referencesDeleted)) stop('RESET_RETAINED_REFERENCE_' + name);
      }
      const collections = names.map(name => ({ name, before: source.get(name).length, remove: deletes.get(name).length,
        after: after.get(name).length, beforeHash: hash(source.get(name)), afterHash: hash(after.get(name)) }));
      const digest = createHash('sha256').update(JSON.stringify(collections)).digest('hex');
      if (apply && digest !== expectedDigest) stop('RESET_DIGEST_CHANGED');
      if (apply) {
        for (const [name, rows] of deletes) {
          if (!rows.length) continue;
          const result = await connection.db.collection(name).deleteMany({ _id: { $in: rows.map(row => row._id) } }, { session });
          if (result.deletedCount !== rows.length) stop('RESET_DELETE_COUNT_CHANGED');
        }
        for (const next of productNext.values()) {
          const result = await connection.db.collection('products').replaceOne({ _id: next._id }, next, { session });
          if (result.matchedCount !== 1) stop('RESET_PRODUCT_CHANGED');
        }
        if (manifest && hash([manifest]) !== hash([manifestNext])) {
          const result = await connection.db.collection('demopopulationruns').replaceOne({ _id: HANOI_DEMO_KEY }, manifestNext, { session });
          if (result.matchedCount !== 1) stop('RESET_MANIFEST_CHANGED');
        }
        for (const row of collections) {
          const actual = await connection.db.collection(row.name).find({}, { session, promoteValues: false, maxTimeMS: 5000 })
            .sort({ _id: 1 }).limit(2001).toArray();
          if (hash(actual) !== row.afterHash) stop('RESET_POSTCHECK_FAILED');
        }
      }
      return { state: apply ? 'APPLIED' : 'DRY_RUN', digest, demoSitters: selectedUsers.length,
        removedDocuments: collections.reduce((sum, row) => sum + row.remove, 0), productsReleasingReservations: productNext.size,
        collections, collectionDrops: 0 };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
  } finally { await session.endSession(); }
}
