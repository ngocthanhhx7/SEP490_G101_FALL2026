import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { productSalesModels } from '../../src/models/product.model.js';
import { createProductCatalogService, toProductSummary } from '../../src/services/product-sales/product-catalog.service.js';
import { createProductManagementService, toAdminProduct } from '../../src/services/product-sales/product-management.service.js';

let replica, connection, Product, catalog, management;
const admin = { userId: '507f1f77bcf86cd799439001', roles: ['ADMIN'], state: 'ACTIVE' };
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_product_default',
    autoCreate: false, autoIndex: false, monitorCommands: true }).asPromise();
  ({ Product } = productSalesModels(connection)); await Product.createCollection(); await Product.createIndexes();
  await Product.collection.insertMany(Array.from({ length: 600 }, (_, i) => ({
    _id: new mongoose.Types.ObjectId((599 - i).toString(16).padStart(24, '0')),
    code: `SP-${String(i + 1).padStart(4, '0')}`, name: i % 6 ? `Synthetic product ${i}` : 'Needle synthetic',
    category: i % 2 ? 'FOOD' : 'ACCESSORY', petType: i % 3 ? 'DOG' : 'CAT',
    visible: i % 5 !== 0, sellingPrice: 10000, stockOnHand: i % 20, quantityHeld: i % 23,
    photos: i % 7 ? [] : ['/synthetic-photo.webp'], description: 'Synthetic long description '.repeat(20),
    privateMarker: 'synthetic-private-value', detailsVersion: 2, version: 4,
    ...(i % 17 === 0 ? { deletedAt: new Date('2026-01-01') } : i % 2 ? { deletedAt: null } : {})
  })));
  catalog = createProductCatalogService({ connection }); management = createProductManagementService({ connection });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });

test('every default page preserves previous order, exact totals, all DTO fields and global summary', async () => {
  for (const kind of ['public', 'admin']) {
    const filter = { deletedAt: null, ...(kind === 'public' ? { visible: true } : {}) };
    const old = await Product.find(filter).sort({ code: 1, _id: 1 }).lean();
    const expected = old.map(kind === 'public' ? toProductSummary : toAdminProduct), all = [];
    let summary;
    for (let page = 1; page <= Math.ceil(old.length / 50) + 1; page++) {
      const query = { page: String(page), limit: '50' };
      const result = kind === 'public' ? await catalog.list(query) : await management.list(admin, query);
      expect(result.total).toBe(old.length); expect(result.page).toBe(page); expect(result.limit).toBe(50);
      expect(result.items).toEqual(expected.slice((page - 1) * 50, page * 50)); all.push(...result.items);
      expect(JSON.stringify(result)).not.toContain('privateMarker'); expect(JSON.stringify(result)).not.toContain('synthetic-private-value');
      if (result.summary) { summary ??= result.summary; expect(result.summary).toEqual(summary); }
    }
    expect(all).toEqual(expected); expect(new Set(all.map(row => row.id)).size).toBe(old.length);
    if (summary) {
      expect(summary.total).toBe(old.length); expect(summary.visible).toBe(old.filter(row => row.visible).length);
      expect(summary.hidden).toBe(old.filter(row => !row.visible).length);
      expect(summary.outOfStock).toBe(old.filter(row => row.stockOnHand - row.quantityHeld <= 0).length);
    }
  }
});

test('only normalized empty-filter lists change sort; all filtered queries keep the old shape and global summary', async () => {
  const commands = [], listener = event => { if (event.commandName === 'find' && event.command.find === 'products') commands.push(event.command); };
  const global = (await management.list(admin, {})).summary;
  connection.getClient().on('commandStarted', listener);
  try {
    for (const query of [{}, { search: '   ' }, { category: 'FOOD' }, { petType: 'CAT' }, { search: 'needle' }, { search: 'SP-001', petType: 'CAT', category: 'ACCESSORY' }]) {
      const filtered = !!query.category || !!query.petType || !!query.search?.trim();
      commands.length = 0; await catalog.list(query);
      expect(Object.fromEntries(commands[0].sort)).toEqual(filtered ? { code: 1, _id: 1 } : { code: 1 });
      commands.length = 0; const result = await management.list(admin, query);
      expect(Object.fromEntries(commands[0].sort)).toEqual(filtered ? { code: 1, _id: 1 } : { code: 1 });
      expect(result.summary).toEqual(global);
    }
  } finally { connection.getClient().off('commandStarted', listener); }
});

test('existing unique code traversal bounds the first data page; exact count remains a separate growing read', async () => {
  const filter = { visible: true, deletedAt: null };
  const ex = await Product.collection.find(filter).sort({ code: 1 }).limit(20).explain('executionStats');
  expect(ex.executionStats.nReturned).toBe(20); expect(ex.executionStats.totalDocsExamined).toBeLessThan(50);
  expect(JSON.stringify(ex.queryPlanner.winningPlan)).not.toContain('"stage":"SORT"');
  expect((await catalog.list({ limit: '20' })).total).toBe(await Product.countDocuments(filter));
});

test('auth, hidden/deleted detail errors and stock/held values remain authoritative', async () => {
  await expect(management.list({ ...admin, roles: ['STAFF'] }, {})).rejects.toMatchObject({ status: 403 });
  const hidden = await Product.findOne({ visible: false, deletedAt: null }).lean();
  const deleted = await Product.findOne({ deletedAt: { $ne: null } }).lean();
  await expect(catalog.read(String(hidden._id))).rejects.toMatchObject({ status: 404 });
  await expect(catalog.read(String(deleted._id))).rejects.toMatchObject({ status: 404 });
  const shown = await Product.findOne({ visible: true, deletedAt: null }).lean();
  const result = await catalog.read(String(shown._id));
  expect(result.available).toBe(Math.max(0, shown.stockOnHand - shown.quantityHeld));
  expect(result.photos).toEqual(shown.photos); expect(result.description).toBe(shown.description);
});
