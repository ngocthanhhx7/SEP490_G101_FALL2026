import { beforeAll, afterAll, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { createServer } from 'node:http';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { registerModules } from '../../src/routes/module-registry.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { createProductCartService } from '../../src/services/product-sales/product-cart.service.js';
import { createProductOrderService } from '../../src/services/product-sales/product-order.service.js';
import { createScopedCursor } from '../../src/utils/scoped-cursor.js';

const oid = () => new mongoose.Types.ObjectId();
const actors = Object.fromEntries(['ADMIN', 'CUSTOMER', 'STAFF', 'PET_SITTER'].map(role =>
  [role, { userId: String(oid()), state: 'ACTIVE', roles: [role] }]));
const ROOT = '/api/v1/admin/stock-adjustments';
const CURSOR_SECRET = 'synthetic-stock-adjustment-cursor-secret-012345';
const REASONS = ['DAMAGED', 'LOST', 'INTERNAL_USE', 'RECEIPT_CORRECTION'];
let replica, connection, models, app, server, base, keySequence = 0;
const key = () => `synthetic-adjustment-${++keySequence}`;
const product = (code = 'SP-0001', over = {}) => models.Product.create({ code, name: `Synthetic ${code}`, category: 'FOOD', petType: 'DOG',
  sellingPrice: 1000, stockOnHand: 12, quantityHeld: 0, visible: true, version: 0, detailsVersion: 2, ...over });
const get = (path = ROOT, role = 'ADMIN') => request(base).get(path).set('x-test-role', role);
const save = (body, commandKey = key(), role = 'ADMIN', csrf = true) => {
  const req = request(base).post(ROOT).set('x-test-role', role).set('Origin', base);
  if (commandKey !== null) req.set('Idempotency-Key', commandKey);
  if (csrf) req.set('X-CSRF-Token', 'synthetic-csrf');
  return req.send(body);
};
const values = (p, over = {}) => ({ productId: p.id, type: 'DECREASE', quantity: 2, reason: 'DAMAGED', ...over });
const history = p => `/api/v1/admin/stock-levels/${p.id}/history`;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_stock_adjustment' }).asPromise();
  models = productSalesModels(connection);
  const sessionService = { authenticate: async req => {
    const actor = actors[req.get('x-test-role')];
    return actor ? { ...actor, expiresAt: Date.now() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  app = express(); app.use(express.json(), requestId);
  registerModules(app, productSalesRuntimeModules({ connection, sessionService, env: { PRODUCT_SALES_ENABLED: 'true' },
    config: { auth: { enabled: true, tokenSecret: CURSOR_SECRET,
      contactLookupSecret: 'synthetic-contact-lookup-secret-0123', contactEncryptionKey: 'synthetic-contact-encryption-key' } } }));
  app.use(errorHandler(() => {}));
  await Promise.all(Object.values(models).map(model => model.init()));
  server = createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}, 600000);
afterAll(async () => { await new Promise(resolve => server?.close(resolve) ?? resolve()); await connection?.close(); await replica?.stop(); }, 30000);
beforeEach(async () => {
  for (const model of Object.values(models)) await model.deleteMany({});
  await connection.db.collection('users').deleteMany({});
  await connection.db.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(actors.ADMIN.userId), displayName: 'Synthetic Admin',
    roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0, synthetic: false });
});
afterEach(() => jest.restoreAllMocks());

test('AC-33 GBR-50 creates a DC receipt and changes only real stock and stock version', async () => {
  const p = await product();
  const saved = (await save(values(p)).expect(201)).body.data;
  expect(saved).toMatchObject({ code: 'DC-0001', productId: p.id, productCode: p.code, productName: p.name,
    type: 'DECREASE', quantity: 2, quantityChange: -2, reason: 'DAMAGED', recorderId: actors.ADMIN.userId, recorderName: 'Synthetic Admin' });
  expect(saved.recordedAt).toEqual(expect.any(String));
  expect(saved.idempotencyKey).toBeUndefined(); expect(saved.requestFingerprint).toBeUndefined();
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 10, quantityHeld: 0, version: 1, detailsVersion: 2 });
  const increased = (await save(values(p, { type: 'INCREASE', quantity: 3 })).expect(201)).body.data;
  expect([increased.code, increased.quantityChange]).toEqual(['DC-0002', 3]);
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 13, quantityHeld: 0, version: 2, detailsVersion: 2 });
});

test('AC-34 guards all stock adjustment endpoints and requires CSRF for saves', async () => {
  const p = await product();
  for (const path of [ROOT, `${ROOT}/products`, `${ROOT}/products/${p.id}`]) {
    expect((await get(path, '')).status).toBe(401);
    for (const role of ['CUSTOMER', 'STAFF', 'PET_SITTER']) expect((await get(path, role)).status).toBe(403);
    expect((await get(path).expect(200)).headers['cache-control']).toBe('private, no-store');
  }
  expect((await save(values(p), key(), '')).status).toBe(401);
  for (const role of ['CUSTOMER', 'STAFF', 'PET_SITTER']) expect((await save(values(p), key(), role)).status).toBe(403);
  expect((await save(values(p), key(), 'ADMIN', false)).body.error.code).toBe('CSRF_REJECTED');
  expect((await save(values(p), null)).status).toBe(422);
  expect(await models.StockAdjustment.countDocuments()).toBe(0);
});

test('AC-33 D-266 validates positive integer quantity, mandatory type/reason, enums and caller-owned fields', async () => {
  const p = await product();
  for (const quantity of [undefined, 0, -1, 1.2, '2', 'abc', 100001]) {
    const res = await save(values(p, { quantity })).expect(422);
    expect(res.body.error.fields.quantity).toBe(quantity === 100001 ? 'TOO_LARGE' : 'INVALID');
  }
  for (const changes of [{ type: undefined }, { type: 'OTHER' }, { reason: undefined }, { reason: '' }, { reason: 'OTHER' }, { code: 'DC-9999' }]) {
    await save(values(p, changes)).expect(422);
  }
  expect(await models.StockAdjustment.countDocuments()).toBe(0);
  expect(await models.ProductCounter.findById('STOCK_ADJUSTMENT').lean()).toBeNull();
  expect((await models.Product.findById(p.id).lean()).stockOnHand).toBe(12);
  for (const type of ['INCREASE', 'DECREASE']) for (const reason of REASONS) await save(values(p, { type, reason, quantity: 1 })).expect(201);
  expect(await models.StockAdjustment.countDocuments()).toBe(8);
});

test('AC-33 GBR-50 checks available against a real unfinished order and preserves the held stock and order', async () => {
  const p = await product('SP-0001', { stockOnHand: 9 });
  await createProductCartService({ connection }).addLine(actors.CUSTOMER, { productId: p.id, quantity: 1 });
  await createProductOrderService({ connection }).place(actors.CUSTOMER, { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, 'synthetic-hold-order');
  const orderBefore = await models.ProductOrder.find().lean();
  const rejected = await save(values(p, { quantity: 9 })).expect(409);
  expect(rejected.body.error).toMatchObject({ code: 'STOCK_ADJUSTMENT_EXCEEDS_AVAILABLE', available: 8 });
  expect(await models.ProductCounter.findById('STOCK_ADJUSTMENT').lean()).toBeNull();
  await save(values(p, { quantity: 8 })).expect(201);
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 1, quantityHeld: 1, version: 2, detailsVersion: 2 });
  expect(await models.ProductOrder.find().lean()).toEqual(orderBefore);
});

test('GBR-50 serializes concurrent decreases so only one can consume the available stock', async () => {
  const p = await product('SP-0001', { stockOnHand: 9, quantityHeld: 1 });
  const responses = await Promise.all([save(values(p, { quantity: 6 })), save(values(p, { quantity: 6 }))]);
  expect(responses.map(res => res.status).sort()).toEqual([201, 409]);
  expect(responses.find(res => res.status === 409).body.error.available).toBe(2);
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 3, quantityHeld: 1, version: 1 });
  expect(await models.StockAdjustment.countDocuments()).toBe(1);
  expect((await models.ProductCounter.findById('STOCK_ADJUSTMENT').lean()).value).toBe(1);
});

test('GBR-50 serializes a decrease against a new order hold on the same product', async () => {
  const p=await product('SP-0001',{stockOnHand:9});
  await createProductCartService({connection}).addLine(actors.CUSTOMER,{productId:p.id,quantity:6});
  const order=request(base).post('/api/v1/product-orders').set('x-test-role','CUSTOMER').set('Origin',base)
    .set('X-CSRF-Token','synthetic-csrf').set('Idempotency-Key','synthetic-concurrent-order')
    .send({receiveMethod:'PICKUP',paymentMethod:'PAY_AT_SHOP'});
  const responses=await Promise.all([save(values(p,{quantity:6})),order]);
  expect(responses.map(res=>res.status).sort()).toEqual([201,409]);
  const current=await models.Product.findById(p.id).lean();
  expect(current.stockOnHand-current.quantityHeld).toBe(3);
  expect(current).toMatchObject({version:1,detailsVersion:2});
  expect(await models.StockAdjustment.countDocuments()+await models.ProductOrder.countDocuments()).toBe(1);
});

test('D-263 permits hidden products, excludes deleted from picker and blocks missing/deleted saves', async () => {
  const hidden = await product('SP-0001', { visible: false, name: 'Synthetic Hạt [Dog]' });
  const deleted = await product('SP-0002', { deletedAt: new Date() });
  const found = (await get(`${ROOT}/products`).query({ search: '[dog]' }).expect(200)).body.data;
  expect(found.items).toEqual([{ id: hidden.id, code: hidden.code, name: hidden.name, visible: false }]);
  expect((await get(`${ROOT}/products`).expect(200)).body.data.total).toBe(1);
  expect((await get(`${ROOT}/products/${hidden.id}`).expect(200)).body.data).toMatchObject({ stockOnHand: 12, quantityHeld: 0, available: 12 });
  for (const productId of [deleted.id, String(oid())]) {
    expect((await get(`${ROOT}/products/${productId}`)).status).toBe(404);
    expect((await save(values(hidden, { productId }))).body.error.code).toBe('PRODUCT_NOT_FOUND');
  }
  await save(values(hidden)).expect(201);
  await models.Product.updateOne({ _id: hidden.id }, { $set: { deletedAt: new Date() } });
  expect((await get().expect(200)).body.data.total).toBe(1);
  expect((await get(history(hidden))).status).toBe(404);
});

test('AC-33 replays identical sequential/concurrent commands, rejects changed content and never exposes replay keys', async () => {
  const p = await product(), commandKey = key();
  const responses = await Promise.all(Array.from({ length: 4 }, () => save(values(p), commandKey)));
  expect(responses.map(res => res.status)).toEqual([201, 201, 201, 201]);
  expect(new Set(responses.map(res => res.body.data.id)).size).toBe(1);
  const replayed = await save(values(p), commandKey).expect(201);
  expect(replayed.body.data).toEqual(responses[0].body.data);
  expect((await save(values(p, { reason: 'LOST' }), commandKey)).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 10, version: 1 });
  await models.Product.updateOne({ _id: p.id }, { $set: { deletedAt: new Date() } });
  expect((await save(values(p), commandKey).expect(201)).body.data.id).toBe(replayed.body.data.id);
});

test('AC-33 rolls back stock and counter on insert failure, and preserves code continuity beyond four digits', async () => {
  const p = await product(), commandKey = key();
  jest.spyOn(models.StockAdjustment.collection, 'insertOne').mockRejectedValueOnce(new Error('Synthetic insert failure'));
  await save(values(p), commandKey).expect(500);
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 12, version: 0 });
  expect(await models.ProductCounter.findById('STOCK_ADJUSTMENT').lean()).toBeNull();
  expect(await models.StockAdjustment.countDocuments()).toBe(0);
  expect((await save(values(p), commandKey).expect(201)).body.data.code).toBe('DC-0001');
  await models.ProductCounter.updateOne({ _id: 'STOCK_ADJUSTMENT' }, { $set: { value: 9998 } });
  expect((await save(values(p)).expect(201)).body.data.code).toBe('DC-9999');
  expect((await save(values(p)).expect(201)).body.data.code).toBe('DC-10000');
  for (const method of ['patch', 'put', 'delete']) await request(base)[method](`${ROOT}/DC-0001`).set('x-test-role', 'ADMIN').expect(404);
});

test('keeps technical stock capacity safe and paginates newest receipts, preserving product snapshots', async () => {
  const p = await product('SP-0001', { stockOnHand: Number.MAX_SAFE_INTEGER });
  const tooLarge = await save(values(p, { type: 'INCREASE', quantity: 1 })).expect(422);
  expect(tooLarge.body.error.fields.quantity).toBe('TOO_LARGE');
  await models.Product.updateOne({ _id: p.id }, { $set: { stockOnHand: 100 } });
  for (let i = 0; i < 21; i++) await save(values(p, { type: 'INCREASE', quantity: 1 })).expect(201);
  const page = (await get().expect(200)).body.data;
  expect([page.items.length, page.total, page.limit]).toEqual([20, 21, 20]);
  expect(page.items[0].code).toBe('DC-0021');
  expect((await get().query({ page: 2 }).expect(200)).body.data.items.map(item => item.code)).toEqual(['DC-0001']);
  expect((await get().query({ limit: 50 }).expect(200)).body.data.items).toHaveLength(21);
  for (const path of [ROOT, `${ROOT}/products`]) for (const query of [{ limit: 51 }, { page: 0 }, { unknown: 'x' }]) await get(path).query(query).expect(422);
  await get(`${ROOT}/products`).query({ search: 'x'.repeat(101) }).expect(422);
  await get(`${ROOT}/products/bad-id`).expect(422);
});

test('AC-33 merges both history sources without duplicates at identical timestamps and ObjectIds; accepts the old receipt cursor', async () => {
  const p = await product(), other = await product('SP-0002');
  const adjustment = (await save(values(p)).expect(201)).body.data;
  const sameId = new mongoose.Types.ObjectId(adjustment.id), time = new Date('2026-11-01T03:00:00Z');
  await models.StockAdjustment.collection.updateOne({ _id: sameId }, { $set: { createdAt: time } });
  await models.GoodsReceipt.create({ _id: sameId, code: 'PN-0001', number: 1, supplierId: oid(), supplierName: 'Synthetic supplier',
    receivedOn: '2026-10-31', recorderId: actors.ADMIN.userId, recorderName: 'Synthetic Admin', createdAt: time,
    lines: [{ productId: p.id, productCode: p.code, productName: p.name, quantityReceived: 1, quantityAccepted: 0, quantityRejected: 1, rejectReason: 'Synthetic' }],
    totalReceived: 1, totalAccepted: 0, totalRejected: 1, idempotencyKey: key(), requestFingerprint: 'synthetic' });
  const older = (await save(values(p, { type: 'INCREASE' })).expect(201)).body.data;
  await models.StockAdjustment.collection.updateOne({ _id: new mongoose.Types.ObjectId(older.id) }, { $set: { createdAt: new Date('2026-10-30T03:00:00Z') } });
  await save(values(other)).expect(201);
  const items = []; let cursor;
  do {
    const page = (await get(history(p)).query({ limit: 1, ...(cursor ? { cursor } : {}) }).expect(200)).body.data;
    items.push(...page.items); cursor = page.nextCursor;
  } while (cursor);
  expect(items.map(item => [item.kind, item.referenceCode, item.quantityChange])).toEqual([
    ['STOCK_ADJUSTMENT', 'DC-0001', -2], ['GOODS_RECEIPT', 'PN-0001', 0], ['STOCK_ADJUSTMENT', 'DC-0002', 2]
  ]);
  expect(items[0]).toMatchObject({ reason: 'DAMAGED', recorderName: 'Synthetic Admin' });
  expect(items[0].supplierName).toBeUndefined(); expect(items[0].receivedOn).toBeUndefined();
  expect(items[1].receivedOn).toBe('2026-10-31');
  const oldCursor = createScopedCursor({ secret: CURSOR_SECRET, namespace: 'stock-receipt-history' }).encode(
    { id: String(sameId), createdAt: time.toISOString() }, { actor: actors.ADMIN.userId, product: p.id });
  const remaining = (await get(history(p)).query({ cursor: oldCursor }).expect(200)).body.data.items;
  expect(remaining.map(item => item.id)).toEqual([older.id]);
});
