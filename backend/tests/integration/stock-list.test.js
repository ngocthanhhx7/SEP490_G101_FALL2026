import { beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { registerModules } from '../../src/routes/module-registry.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { STOCK_LOW_THRESHOLD as T } from '../../src/constants/stock-list-fields.js';
import { createProductCartService } from '../../src/services/product-sales/product-cart.service.js';
import { createProductOrderService } from '../../src/services/product-sales/product-order.service.js';

const oid = () => new mongoose.Types.ObjectId();
const actors = Object.fromEntries(['ADMIN', 'CUSTOMER', 'STAFF', 'PET_SITTER'].map(role =>
  [role, { userId: String(oid()), state: 'ACTIVE', roles: [role] }]));
const ROOT = '/api/v1/admin/stock-levels';
let replica, connection, models, app;
const get = (path = ROOT, role = 'ADMIN') => request(app).get(path).set('x-test-role', role);
const product = (code, over = {}) => models.Product.create({ code, name: `Synthetic ${code}`, category: 'FOOD', petType: 'DOG',
  sellingPrice: 1000, stockOnHand: T + 1, quantityHeld: 0, visible: true, ...over });
const historyPath = id => `${ROOT}/${id}/history`;
async function receipt(number, productId, accepted, createdAt, receivedOn = '2026-11-01') {
  return models.GoodsReceipt.create({ code: `PN-${String(number).padStart(4, '0')}`, number, supplierId: oid(), supplierName: 'Synthetic supplier',
    receivedOn, recorderId: actors.ADMIN.userId, recorderName: 'Synthetic Admin', createdAt,
    lines: [{ productId, productCode: 'SP-0001', productName: 'Synthetic', quantityReceived: accepted + 1,
      quantityAccepted: accepted, quantityRejected: 1, rejectReason: 'Synthetic rejection' }],
    totalReceived: accepted + 1, totalAccepted: accepted, totalRejected: 1, idempotencyKey: `synthetic-${number}`, requestFingerprint: 'synthetic' });
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_stock_list' }).asPromise();
  models = productSalesModels(connection);
  const sessionService = { authenticate: async req => {
    const actor = actors[req.get('x-test-role')];
    return actor ? { ...actor, expiresAt: Date.now() + 60000 } : null;
  }, verifyCsrf: async () => false };
  app = express(); app.use(express.json(), requestId);
  registerModules(app, productSalesRuntimeModules({ connection, sessionService, env: { PRODUCT_SALES_ENABLED: 'true' },
    config: { auth: { enabled: true, tokenSecret: 'synthetic-stock-cursor-secret-0123456789',
      contactLookupSecret: 'synthetic-contact-lookup-secret-0123', contactEncryptionKey: 'synthetic-contact-encryption-key' } } }));
  app.use(errorHandler(() => {}));
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
beforeEach(async () => { for (const model of Object.values(models)) await model.deleteMany({}); });

test('AC-34 guards both read endpoints for guests and every non-Admin role', async () => {
  const p = await product('SP-0001');
  for (const path of [ROOT, historyPath(p.id)]) {
    expect((await get(path, '')).status).toBe(401);
    for (const role of ['CUSTOMER', 'STAFF', 'PET_SITTER']) expect((await get(path, role)).status).toBe(403);
    const response = await get(path).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
  }
});

test('AC-32 D-209 D-263 derives stock, includes hidden, excludes deleted from both counts and history, and never writes', async () => {
  const empty = await product('SP-0001', { stockOnHand: T, quantityHeld: T });
  await product('SP-0002', { stockOnHand: T + 2, quantityHeld: 2, visible: false });
  await product('SP-0003');
  const deleted = await product('SP-0004', { stockOnHand: 0, deletedAt: new Date() });
  const before = await models.Product.find().sort({ code: 1 }).lean();
  const all = (await get().expect(200)).body.data;
  expect(all.counts).toEqual({ ALL: 3, LOW_STOCK: 2 });
  expect(all.items.map(p => [p.code, p.available, p.status])).toEqual([
    ['SP-0001', 0, 'OUT_OF_STOCK'], ['SP-0002', T, 'LOW_STOCK'], ['SP-0003', T + 1, 'IN_STOCK']
  ]);
  expect(Object.keys(all.items[0]).sort()).toEqual(['id', 'code', 'name', 'stockOnHand', 'quantityHeld', 'available', 'status'].sort());
  const low = (await get().query({ tab: 'LOW_STOCK', search: 'sp-0001' }).expect(200)).body.data;
  expect(low.items.map(p => p.id)).toEqual([empty.id]);
  expect(low.counts).toEqual(all.counts);
  expect((await get(historyPath(deleted.id))).status).toBe(404);
  expect((await get(historyPath(oid()))).status).toBe(404);
  expect(await models.Product.find().sort({ code: 1 }).lean()).toEqual(before);
});

test('D-216 searches literal name/code case-insensitively, normalizes text and paginates 20/max 50', async () => {
  await product('SP-0001', { name: 'Thức ăn [Dog]' });
  for (let i = 2; i <= 24; i++) await product(`SP-${String(i).padStart(4, '0')}`);
  const all = (await get().expect(200)).body.data;
  expect([all.items.length, all.page, all.limit, all.total]).toEqual([20, 1, 20, 24]);
  const second = (await get().query({ page: 2 }).expect(200)).body.data;
  expect(second.items.map(p => p.code)).toEqual(['SP-0021', 'SP-0022', 'SP-0023', 'SP-0024']);
  for (const search of ['  THỨC   ĂN  ', '[dog]', 'sp-0001']) {
    expect((await get().query({ search }).expect(200)).body.data.items.map(p => p.code)).toEqual(['SP-0001']);
  }
  expect((await get().query({ search: 'no-such-product' }).expect(200)).body.data.items).toEqual([]);
  expect((await get().query({ limit: 50 }).expect(200)).body.data.items).toHaveLength(24);
  for (const query of [{ search: 'x'.repeat(101) }, { page: 0 }, { limit: 51 }, { tab: 'OUT_OF_STOCK' }, { other: 'x' }]) {
    expect((await get().query(query)).status).toBe(422);
  }
  expect((await get(historyPath('bad-id'))).status).toBe(422);
});

test('AC-32 reads the authoritative hold created by an unfinished order, with no order in receipt history or read side effects', async () => {
  const p = await product('SP-0001', { stockOnHand: T + 3 });
  const cart = createProductCartService({ connection });
  await cart.addLine(actors.CUSTOMER, { productId: p.id, quantity: 3 });
  await createProductOrderService({ connection }).place(actors.CUSTOMER, { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, 'synthetic-stock-order-key');
  const before = await models.Product.findById(p.id).lean();
  const orderBefore = await models.ProductOrder.find().lean();
  expect((await get().expect(200)).body.data.items[0]).toMatchObject({ stockOnHand: T + 3, quantityHeld: 3, available: T, status: 'LOW_STOCK' });
  expect((await get(historyPath(p.id)).expect(200)).body.data.items).toEqual([]);
  expect(await models.Product.findById(p.id).lean()).toEqual(before);
  expect(await models.ProductOrder.find().lean()).toEqual(orderBefore);
});

test('AC-32 receipt history uses accepted quantity including +0, receivedOn, createdAt/_id order and scoped keyset paging', async () => {
  const p = await product('SP-0001'), other = await product('SP-0002');
  const oldest = await receipt(1, p.id, 3, new Date('2026-11-01T01:00:00Z'), '2026-11-07');
  await receipt(2, other.id, 9, new Date('2026-11-03T01:00:00Z'));
  const middle = await receipt(3, p.id, 2, new Date('2026-11-02T01:00:00Z'));
  const newest = await receipt(4, p.id, 0, new Date('2026-11-02T01:00:00Z'), '2026-10-31');
  const before = await models.GoodsReceipt.find().lean();
  const first = (await get(historyPath(p.id)).query({ limit: 1 }).expect(200)).body.data;
  expect(first.product.id).toBe(p.id);
  expect(first.items).toEqual([{ id: newest.id, kind: 'GOODS_RECEIPT', referenceCode: newest.code,
    occurredAt: newest.createdAt.toISOString(), receivedOn: '2026-10-31', supplierName: 'Synthetic supplier', quantityChange: 0 }]);
  const next = (await get(historyPath(p.id)).query({ limit: 1, cursor: first.nextCursor }).expect(200)).body.data;
  expect(next.items[0].id).toBe(middle.id);
  const last = (await get(historyPath(p.id)).query({ limit: 1, cursor: next.nextCursor }).expect(200)).body.data;
  expect(last.items[0].id).toBe(oldest.id); expect(last.nextCursor).toBeNull();
  for (const query of [{ cursor: 'tampered' }, { page: 2 }, { limit: 51 }]) {
    expect((await get(historyPath(p.id)).query(query)).status).toBe(422);
  }
  expect((await get(historyPath(other.id)).query({ cursor: first.nextCursor })).status).toBe(422);
  expect(await models.GoodsReceipt.find().lean()).toEqual(before);
});
