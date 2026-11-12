import { beforeAll, afterAll, beforeEach, afterEach, describe, test, expect, jest } from '@jest/globals';
import { createServer } from 'node:http';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { provisionProductCatalog } from '../../src/services/product-sales/product-catalog-provisioning.service.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { supplierNameKey } from '../../src/utils/supplier-name.js';
import { vietnamDate } from '../../src/utils/vietnam-date.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { registerModules } from '../../src/routes/module-registry.js';

const oid = () => new mongoose.Types.ObjectId();
const actors = {
  admin: { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE' },
  otherAdmin: { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE' },
  customer: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  staff: { userId: String(oid()), roles: ['STAFF'], state: 'ACTIVE' },
  sitter: { userId: String(oid()), roles: ['PET_SITTER'], state: 'ACTIVE' }
};
const RECEIPTS = '/api/v1/admin/goods-receipts';
const SUPPLIERS = '/api/v1/admin/suppliers';
// Synthetic keys only; the goods receipt routes share a runtime with the order routes, which need them.
const CONTACT_KEYS = { contactLookupSecret: 'synthetic-contact-lookup-secret-0123', contactEncryptionKey: 'synthetic-contact-encryption-key' };
let replica, connection, server, base, models;

const api = (who) => {
  const call = (method, path) => {
    const req = request(base)[method](path);
    if (who) req.set('x-test-actor', who);
    if (method !== 'get') req.set('Origin', base).set('X-CSRF-Token', 'synthetic-csrf');
    return req;
  };
  return { get: (p) => call('get', p), post: (p) => call('post', p), patch: (p) => call('patch', p), delete: (p) => call('delete', p) };
};
const admin = api('admin');
const productOf = async (code) => models.Product.findOne({ code }).lean();
const idOf = async (code) => String((await productOf(code))._id);
const makeSupplier = async (name = 'Synthetic Supplier', over = {}) => String((await models.Supplier.create({
  name, nameKey: supplierNameKey(name), phone: '0936452118', status: 'ACTIVE', version: 0, ...over
}))._id);
// Every save carries its own Idempotency-Key (D-218), unless a test says which key to use.
let keyCount = 0;
const newKey = () => `synthetic-receipt-key-${Date.now()}-${(keyCount += 1)}`;
const saveAs = (who, body, key = newKey()) => {
  const req = api(who).post(RECEIPTS);
  if (key !== null) req.set('Idempotency-Key', key);
  return req.send(body);
};
const save = (body, key) => saveAs('admin', body, key);
const line = async (code, received, accepted, rejectReason) => ({
  productId: await idOf(code), quantityReceived: received, quantityAccepted: accepted, ...(rejectReason === undefined ? {} : { rejectReason })
});
const stockOf = async (code) => (await productOf(code)).stockOnHand;
const notices = () => connection.db.collection('notifications').find({}).toArray();
const fieldsOf = (res) => res.body.error.fields;
const lineFieldsOf = (res) => res.body.error.lineFields;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_goods_receipt' }).asPromise();
  models = productSalesModels(connection);
  const session = { authenticate: async (req) => {
    const actor = actors[req.get('x-test-actor')];
    return actor ? { ...actor, expiresAt: Date.now() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const modules = productSalesRuntimeModules({ config: { auth: { enabled: true, ...CONTACT_KEYS } }, connection, sessionService: session,
    env: { PRODUCT_SALES_ENABLED: 'true' } });
  const app = express(); app.use(express.json(), requestId); registerModules(app, modules); app.use(errorHandler(() => {}));
  server = createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}, 600000);
afterAll(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await connection?.close(); await replica?.stop();
}, 30000);
beforeEach(async () => {
  for (const model of Object.values(models)) await model.deleteMany({});
  await connection.db.collection('notifications').deleteMany({});
  const users = connection.db.collection('users');
  await users.deleteMany({});
  await users.insertMany([
    { _id: new mongoose.Types.ObjectId(actors.admin.userId), displayName: 'Synthetic Recorder', roles: ['ADMIN'], state: 'ACTIVE', synthetic: false },
    { _id: new mongoose.Types.ObjectId(actors.otherAdmin.userId), displayName: 'Synthetic Other Admin', roles: ['ADMIN'], state: 'ACTIVE', synthetic: false },
    { _id: new mongoose.Types.ObjectId(actors.staff.userId), displayName: 'Synthetic Staff', roles: ['STAFF'], state: 'ACTIVE', synthetic: false }
  ]);
  await provisionProductCatalog({ connection });
});
afterEach(() => jest.restoreAllMocks());

test('canonicalizes uppercase ObjectIds for supplier and product identities', async () => {
  const supplierId = await makeSupplier();
  const productId = await idOf('SP-0012');
  const key = newKey();
  const body = { supplierId: supplierId.toUpperCase(), lines: [{ productId: productId.toUpperCase(), quantityReceived: 1, quantityAccepted: 1 }] };
  const first = (await save(body, key).expect(201)).body.data;
  const replayed = (await save({ supplierId, lines: [{ ...body.lines[0], productId }] }, key).expect(201)).body.data;
  expect(replayed).toEqual(first);
});

test('refuses stock overflow and rolls back the entire receipt transaction', async () => {
  const supplierId = await makeSupplier();
  await models.Product.updateOne({ code: 'SP-0012' }, { $set: { stockOnHand: Number.MAX_SAFE_INTEGER } });
  const body = { supplierId, lines: [await line('SP-0012', 2, 2)] };
  await save(body).expect(422);
  expect(await stockOf('SP-0012')).toBe(Number.MAX_SAFE_INTEGER);
  expect(await models.GoodsReceipt.countDocuments()).toBe(0);
  expect(await models.ProductCounter.findById('GOODS_RECEIPT').lean()).toBeNull();
  expect((await models.Supplier.findById(supplierId).lean()).lastReceiptAt).toBeUndefined();
});

describe('access (AC-34)', () => {
  test('AC-34 a guest gets 401 and a Customer, Staff or Pet Sitter gets 403 on every goods receipt call', async () => {
    const supplierId = await makeSupplier();
    const body = { supplierId, lines: [await line('SP-0012', 5, 5)] };
    const calls = [['get', `${RECEIPTS}/suppliers`], ['get', `${RECEIPTS}/products`], ['get', RECEIPTS], ['get', `${RECEIPTS}/PN-0001`], ['post', RECEIPTS]];
    for (const [method, path] of calls) {
      const call = (who) => (method === 'get' ? api(who).get(path) : api(who)[method](path).set('Idempotency-Key', newKey()).send(body));
      expect((await call()).status).toBe(401);
      for (const who of ['customer', 'staff', 'sitter']) expect((await call(who)).status).toBe(403);
    }
    expect(await models.GoodsReceipt.countDocuments()).toBe(0);
  });

  test('AC-34 a write needs the CSRF token, and a receipt can be neither edited nor deleted', async () => {
    const supplierId = await makeSupplier();
    const body = { supplierId, lines: [await line('SP-0012', 5, 5)] };
    await request(base).post(RECEIPTS).set('x-test-actor', 'admin').set('Origin', base).set('Idempotency-Key', newKey()).send(body).expect(403);
    expect(await models.GoodsReceipt.countDocuments()).toBe(0);
    const saved = (await save(body).expect(201)).body.data;
    for (const method of ['patch', 'delete', 'post']) expect((await admin[method](`${RECEIPTS}/${saved.code}`).send({})).status).toBe(404);
    expect(await models.GoodsReceipt.countDocuments()).toBe(1);
  });
});

describe('suppliers and products for a new receipt', () => {
  test('AC-30 lists only suppliers that still work with the shop, in Vietnamese letter order', async () => {
    for (const name of ['Synthetic Zeta', 'Synthetic Đông', 'Synthetic Dương', 'Synthetic Alpha']) await makeSupplier(name);
    await makeSupplier('Synthetic Stopped', { status: 'STOPPED' });
    const { items } = (await admin.get(`${RECEIPTS}/suppliers`).expect(200)).body.data;
    expect(items.map((item) => item.name)).toEqual(['Synthetic Alpha', 'Synthetic Dương', 'Synthetic Đông', 'Synthetic Zeta']);
    expect(Object.keys(items[0]).sort()).toEqual(['id', 'name']);
  });

  test('a supplier stopped on the Supplier Management screen leaves the list, and returns when it works with the shop again', async () => {
    const supplierId = await makeSupplier('Synthetic Alpha');
    const names = async () => (await admin.get(`${RECEIPTS}/suppliers`).expect(200)).body.data.items.map((item) => item.name);
    expect(await names()).toEqual(['Synthetic Alpha']);
    await admin.post(`${SUPPLIERS}/${supplierId}/stop`).send({ version: 0 }).expect(200);
    expect(await names()).toEqual([]);
    await admin.post(`${SUPPLIERS}/${supplierId}/resume`).send({ version: 1 }).expect(200);
    expect(await names()).toEqual(['Synthetic Alpha']);
  });

  test('finds products by a part of the name or the code, hidden ones too, with a small answer and at most ten at a time', async () => {
    const byCode = (await admin.get(`${RECEIPTS}/products`).query({ search: 'sp-0036' }).expect(200)).body.data;
    expect(byCode.items).toEqual([{ id: await idOf('SP-0036'), code: 'SP-0036', name: expect.any(String), visible: false }]);
    await models.Product.insertMany(Array.from({ length: 4 }, (_, i) => ({ code: `SP-90${i}0`, name: `Synthetic extra ${i}`, category: 'FOOD', petType: 'DOG', sellingPrice: 1000, visible: true })));
    const all = (await admin.get(`${RECEIPTS}/products`).expect(200)).body.data;
    expect(all.items).toHaveLength(10);
    expect(all.total).toBeGreaterThan(10);
    expect((await admin.get(`${RECEIPTS}/products`).query({ limit: 50 }).expect(200)).body.data.items).toHaveLength(10);
    const second = (await admin.get(`${RECEIPTS}/products`).query({ page: 2 }).expect(200)).body.data;
    expect(second.items[0].code).not.toBe(all.items[0].code);
    expect((await admin.get(`${RECEIPTS}/products`).query({ search: 'zzzz-no-such' }).expect(200)).body.data.items).toEqual([]);
  });

  test('rejects a bad product query', async () => {
    for (const query of [{ category: 'FOOD' }, { limit: 0 }, { page: 0 }, { search: 'x'.repeat(101) }, { search: ['a', 'b'] }]) {
      expect((await admin.get(`${RECEIPTS}/products`).query(query)).status).toBe(422);
    }
  });

  // AC-31 / D-262: deleted products leave the picker; hidden products remain receivable.
  test('AC-31 D-262 excludes deleted products from search and totals but still finds hidden products', async () => {
    const deletedId = await idOf('SP-0012');
    await models.Product.updateOne({ _id: deletedId }, { $set: { deletedAt: new Date(), visible: false } });
    const deleted = (await admin.get(`${RECEIPTS}/products`).query({ search: 'SP-0012' }).expect(200)).body.data;
    expect(deleted.items).toEqual([]);
    expect(deleted.total).toBe(0);
    const all = (await admin.get(`${RECEIPTS}/products`).expect(200)).body.data;
    expect(all.items.some((product) => product.id === deletedId)).toBe(false);
    expect(all.total).toBe(await models.Product.countDocuments({ deletedAt: null }));
    const hidden = (await admin.get(`${RECEIPTS}/products`).query({ search: 'SP-0036' }).expect(200)).body.data;
    expect(hidden.items).toEqual([{ id: await idOf('SP-0036'), code: 'SP-0036', name: expect.any(String), visible: false }]);
  });

  // AC-31 / D-262: a product selected before deletion is checked again when saving.
  test.each([0, 3])('AC-31 D-262 rejects a product deleted after selection with %i accepted units and rolls back the whole receipt', async (accepted) => {
    const supplierId = await makeSupplier();
    const selected = (await admin.get(`${RECEIPTS}/products`).query({ search: 'SP-0014' }).expect(200)).body.data.items[0];
    await models.Product.updateOne({ _id: selected.id }, { $set: { deletedAt: new Date(), visible: false } });
    const before = await models.Product.find().sort({ code: 1 }).lean();
    const res = await save({ supplierId, lines: [await line('SP-0012', 5, 5), {
      productId: selected.id, quantityReceived: 3, quantityAccepted: accepted, rejectReason: 'Synthetic rejected goods'
    }] }).expect(422);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(res.body.error.productIds).toEqual([selected.id]);
    expect(await models.Product.find().sort({ code: 1 }).lean()).toEqual(before);
    expect(await models.GoodsReceipt.countDocuments()).toBe(0);
    expect(await models.ProductCounter.findById('GOODS_RECEIPT').lean()).toBeNull();
    expect((await models.Supplier.findById(supplierId).lean()).lastReceiptAt).toBeUndefined();
    expect(await notices()).toEqual([]);
  });
});

describe('saving a receipt (UC-70, AC-31)', () => {
  test('AC-31 saves PN-0001, adds the stock taken into the shop, copies names and codes, and fills the day and the recorder', async () => {
    const supplierId = await makeSupplier('Synthetic Pet Food Co');
    const before = [await productOf('SP-0012'), await productOf('SP-0014'), await productOf('SP-0020')];
    const first = vietnamDate(new Date());
    const res = await save({ supplierId, lines: [await line('SP-0012', 10, 10), await line('SP-0014', 12, 10, 'Bao bì rách'), await line('SP-0020', 20, 20)] }).expect(201);
    const last = vietnamDate(new Date());
    const receipt = res.body.data;
    expect(receipt).toMatchObject({ code: 'PN-0001', supplierId, supplierName: 'Synthetic Pet Food Co', recorderName: 'Synthetic Recorder',
      totalReceived: 42, totalAccepted: 40, totalRejected: 2 });
    expect([first, last]).toContain(receipt.receivedOn);
    expect(receipt.recordedAt).toEqual(expect.any(String));
    expect(receipt.lines).toEqual([
      { productId: String(before[0]._id), productCode: 'SP-0012', productName: before[0].name, quantityReceived: 10, quantityAccepted: 10, quantityRejected: 0, rejectReason: '' },
      { productId: String(before[1]._id), productCode: 'SP-0014', productName: before[1].name, quantityReceived: 12, quantityAccepted: 10, quantityRejected: 2, rejectReason: 'Bao bì rách' },
      { productId: String(before[2]._id), productCode: 'SP-0020', productName: before[2].name, quantityReceived: 20, quantityAccepted: 20, quantityRejected: 0, rejectReason: '' }
    ]);
    const after = [await productOf('SP-0012'), await productOf('SP-0014'), await productOf('SP-0020')];
    expect(after.map((p, i) => p.stockOnHand - before[i].stockOnHand)).toEqual([10, 10, 20]);
    expect(after.map((p, i) => p.version - before[i].version)).toEqual([1, 1, 1]);
    expect(after.map((p) => [p.quantityHeld, p.detailsVersion ?? 0, p.sellingPrice, p.visible])).toEqual(
      before.map((p) => [p.quantityHeld, p.detailsVersion ?? 0, p.sellingPrice, p.visible]));
    const stored = await models.GoodsReceipt.findOne({ code: 'PN-0001' }).lean();
    expect(String(stored.recorderId)).toBe(actors.admin.userId);
    expect(stored.number).toBe(1);
  });

  test('AC-31 a receipt that rejects everything is still saved, and the stock stays as it was', async () => {
    const supplierId = await makeSupplier();
    const before = await productOf('SP-0012');
    const receipt = (await save({ supplierId, lines: [await line('SP-0012', 8, 0, 'Hàng hết hạn')] }).expect(201)).body.data;
    expect(receipt).toMatchObject({ totalReceived: 8, totalAccepted: 0, totalRejected: 8 });
    expect(await productOf('SP-0012')).toEqual(before);
    expect(await models.GoodsReceipt.countDocuments()).toBe(1);
  });

  test('AC-31 a receipt may take in all it received, with no reason and no notice', async () => {
    const supplierId = await makeSupplier();
    const receipt = (await save({ supplierId, lines: [await line('SP-0012', 4, 4)] }).expect(201)).body.data;
    expect(receipt.lines[0]).toMatchObject({ quantityRejected: 0, rejectReason: '' });
    expect(await notices()).toEqual([]);
  });

  test('a reason given for a line that rejects nothing is not saved', async () => {
    const supplierId = await makeSupplier();
    const receipt = (await save({ supplierId, lines: [await line('SP-0012', 4, 4, 'Không dùng')] }).expect(201)).body.data;
    expect(receipt.lines[0].rejectReason).toBe('');
  });

  test('the supplier does not have to supply the product (R3 does not limit a receipt to the supplier\'s products), and a hidden product can be received', async () => {
    const supplierId = await makeSupplier('Synthetic Supplier', { productIds: [] });
    const before = await stockOf('SP-0036');
    const receipt = (await save({ supplierId, lines: [await line('SP-0036', 6, 6)] }).expect(201)).body.data;
    expect(receipt.lines[0].productCode).toBe('SP-0036');
    expect(await stockOf('SP-0036') - before).toBe(6);
    expect((await models.Supplier.findById(supplierId).lean()).productIds).toEqual([]);
  });

  test('saving touches the supplier only to remember the moment, not its version', async () => {
    const supplierId = await makeSupplier();
    await save({ supplierId, lines: [await line('SP-0012', 1, 1)] }).expect(201);
    const supplier = await models.Supplier.findById(supplierId).lean();
    expect(supplier.version).toBe(0);
    expect(supplier.lastReceiptAt).toBeInstanceOf(Date);
    const read = (await admin.get(`${SUPPLIERS}/${supplierId}`).expect(200)).body.data;
    expect(read).not.toHaveProperty('lastReceiptAt');
    await admin.patch(`${SUPPLIERS}/${supplierId}`).send({ version: 0, contactName: 'Synthetic Changed' }).expect(200);
  });
});

describe('MSG122 for rejected goods', () => {
  test('AC-31 each line that rejects writes one notice for every active Admin, with a link that opens the receipt', async () => {
    const supplierId = await makeSupplier();
    const receipt = (await save({ supplierId, lines: [await line('SP-0012', 10, 10), await line('SP-0014', 12, 10, 'Bao bì rách'), await line('SP-0020', 5, 2, 'Hết hạn')] }).expect(201)).body.data;
    const rows = await notices();
    expect(rows).toHaveLength(4);
    const nameOf = async (code) => (await productOf(code)).name;
    const forAdmin = (id) => rows.filter((row) => row.recipientId === id).sort((a, b) => a.message.localeCompare(b.message));
    for (const id of [actors.admin.userId, actors.otherAdmin.userId]) {
      expect(forAdmin(id).map((row) => row.message)).toEqual([
        `Phiếu nhập PN-0001: từ chối 2 ${await nameOf('SP-0014')}. Lý do: Bao bì rách.`,
        `Phiếu nhập PN-0001: từ chối 3 ${await nameOf('SP-0020')}. Lý do: Hết hạn.`
      ].sort());
    }
    expect(rows.every((row) => row.deepLink === '/admin/goods-receipts?receipt=PN-0001' && row.channel === 'IN_APP' && row.readAt === null
      && row.role === 'ADMIN' || row.role === null)).toBe(true);
    expect(rows.every((row) => row.eventType === 'GoodsReceiptRejected' && row.title === 'Hàng nhập bị từ chối')).toBe(true);
    expect(rows.some((row) => row.recipientId === actors.staff.userId)).toBe(false);
    expect((await admin.get(`${RECEIPTS}/${rows[0].deepLink.split('=')[1]}`).expect(200)).body.data.id).toBe(receipt.id);
  });

  test('a user that is not an active Admin, or is a fixture, gets no notice', async () => {
    await connection.db.collection('users').insertMany([
      { _id: oid(), displayName: 'Synthetic Locked Admin', roles: ['ADMIN'], state: 'LOCKED', synthetic: false },
      { _id: oid(), displayName: 'Synthetic Fixture Admin', roles: ['ADMIN'], state: 'ACTIVE', synthetic: true }
    ]);
    const supplierId = await makeSupplier();
    await save({ supplierId, lines: [await line('SP-0012', 3, 0, 'Hỏng')] }).expect(201);
    expect((await notices()).map((row) => row.recipientId).sort()).toEqual([actors.admin.userId, actors.otherAdmin.userId].sort());
  });

  test('a notice is never written twice for the same receipt line', async () => {
    const supplierId = await makeSupplier();
    await save({ supplierId, lines: [await line('SP-0012', 3, 0, 'Hỏng')] }).expect(201);
    const { createDomainNotifications } = await import('../../src/services/notifications/domain-notifications.service.js');
    const productId = await idOf('SP-0012');
    const again = createDomainNotifications({ connection });
    const session = await connection.startSession();
    try {
      await session.withTransaction(() => again.goodsReceiptRejected({ code: 'PN-0001', productId, productName: 'x', quantity: 3, reason: 'Hỏng' }, session));
    } finally { await session.endSession(); }
    expect(await notices()).toHaveLength(2);
  });

  test('every notice for a receipt can be read through the Notification service shape (link and texts are valid)', async () => {
    const { createNotificationService } = await import('../../src/services/notifications/notification.service.js');
    const { createMongoNotificationRepository } = await import('../../src/services/notifications/mongo-notification.repository.js');
    const supplierId = await makeSupplier();
    await save({ supplierId, lines: [await line('SP-0012', 3, 0, 'Hàng hỏng')] }).expect(201);
    const service = createNotificationService({ repository: createMongoNotificationRepository({ connection, cursorSecret: 'synthetic-cursor-secret-with-32-bytes-or-more' }) });
    const listed = await service.list({ actor: { userId: actors.admin.userId, roles: ['ADMIN'], state: 'ACTIVE' } });
    expect(listed.items ?? listed.notifications).toEqual([expect.objectContaining({
      eventType: 'GoodsReceiptRejected', deepLink: '/admin/goods-receipts?receipt=PN-0001' })]);
  });
});

describe('what is refused', () => {
  const stockSnapshot = async () => (await models.Product.find().sort({ code: 1 }).lean()).map((p) => [p.code, p.stockOnHand, p.version]);

  test('AC-31 MSG113: a quantity received that is not a whole number above 0, nothing saved', async () => {
    const supplierId = await makeSupplier();
    const before = await stockSnapshot();
    for (const received of [0, -1, 1.5, '5', null, undefined, 1e21]) {
      const l = await line('SP-0012', received, 0);
      if (received === undefined) delete l.quantityReceived;
      const res = await save({ supplierId, lines: [l] });
      expect(res.status).toBe(422);
      expect(lineFieldsOf(res)).toEqual({ 0: expect.objectContaining({ quantityReceived: 'INVALID' }) });
    }
    expect(lineFieldsOf(await save({ supplierId, lines: [await line('SP-0012', 100001, 0)] }))[0].quantityReceived).toBe('TOO_LARGE');
    expect(await models.GoodsReceipt.countDocuments()).toBe(0);
    expect(await stockSnapshot()).toEqual(before);
    expect(await notices()).toEqual([]);
  });

  test('AC-31 MSG119: a quantity taken into the shop that is not a whole number from 0 to the quantity received', async () => {
    const supplierId = await makeSupplier();
    for (const accepted of [-1, 11, 2.5, '5', null, undefined]) {
      const l = await line('SP-0012', 10, accepted, 'Hỏng');
      if (accepted === undefined) delete l.quantityAccepted;
      const res = await save({ supplierId, lines: [l] });
      expect(res.status).toBe(422);
      expect(lineFieldsOf(res)).toEqual({ 0: { quantityAccepted: 'INVALID' } });
    }
    expect((await save({ supplierId, lines: [await line('SP-0012', 10, 10)] })).status).toBe(201);
  });

  test('AC-31 MSG120: a line that rejects goods needs a reason, within 300 characters', async () => {
    const supplierId = await makeSupplier();
    for (const reason of [undefined, '', '   ', null]) {
      const res = await save({ supplierId, lines: [await line('SP-0012', 10, 7, reason)] });
      expect(res.status).toBe(422);
      expect(lineFieldsOf(res)).toEqual({ 0: { rejectReason: 'REQUIRED' } });
    }
    expect(lineFieldsOf(await save({ supplierId, lines: [await line('SP-0012', 10, 7, 'x'.repeat(301))] }))[0].rejectReason).toBe('TOO_LONG');
    expect(lineFieldsOf(await save({ supplierId, lines: [await line('SP-0012', 10, 7, 42)] }))[0].rejectReason).toBe('INVALID');
    expect((await save({ supplierId, lines: [await line('SP-0012', 10, 7, 'x'.repeat(300))] })).status).toBe(201);
  });

  test('every wrong line and field is reported in one answer, and nothing is saved or counted', async () => {
    const supplierId = await makeSupplier();
    const res = await save({ supplierId: 'x', lines: [await line('SP-0012', 0, -1), await line('SP-0014', 10, 9), await line('SP-0020', 5, 5)] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(fieldsOf(res)).toEqual({ supplierId: 'INVALID' });
    expect(lineFieldsOf(res)).toEqual({ 0: { quantityReceived: 'INVALID', quantityAccepted: 'INVALID' }, 1: { rejectReason: 'REQUIRED' } });
    const next = (await save({ supplierId, lines: [await line('SP-0012', 1, 1)] }).expect(201)).body.data;
    expect(next.code).toBe('PN-0001');
  });

  test('the supplier and the lines: missing, malformed, too many, the same product twice', async () => {
    const supplierId = await makeSupplier();
    const one = await line('SP-0012', 1, 1);
    expect(fieldsOf(await save({ lines: [one] }))).toEqual({ supplierId: 'REQUIRED' });
    expect(fieldsOf(await save({ supplierId: 7, lines: [one] }))).toEqual({ supplierId: 'INVALID' });
    expect(fieldsOf(await save({ supplierId }))).toEqual({ lines: 'INVALID' });
    expect(fieldsOf(await save({ supplierId, lines: 'x' }))).toEqual({ lines: 'INVALID' });
    expect(fieldsOf(await save({ supplierId, lines: [] }))).toEqual({ lines: 'REQUIRED' });
    expect(fieldsOf(await save({ supplierId, lines: Array.from({ length: 51 }, () => one) }))).toEqual({ lines: 'TOO_MANY' });
    expect(lineFieldsOf(await save({ supplierId, lines: [one, { ...one }] }))).toEqual({ 1: { productId: 'DUPLICATE' } });
    expect(lineFieldsOf(await save({ supplierId, lines: [{ ...one, productId: 'nope' }] }))).toEqual({ 0: { productId: 'INVALID' } });
    expect(lineFieldsOf(await save({ supplierId, lines: [{ ...one, productId: undefined }] }))).toEqual({ 0: { productId: 'REQUIRED' } });
    expect(lineFieldsOf(await save({ supplierId, lines: ['x', null, [], 5] }))).toEqual({ 0: { productId: 'INVALID' }, 1: { productId: 'INVALID' }, 2: { productId: 'INVALID' }, 3: { productId: 'INVALID' } });
    expect((await save({ supplierId, lines: Array.from({ length: 50 }, () => one).map((l) => ({ ...l, productId: String(oid()) })) })).status).toBe(422);
    expect(await models.GoodsReceipt.countDocuments()).toBe(0);
  });

  test('what the system fills in or works out cannot be sent', async () => {
    const supplierId = await makeSupplier();
    const one = await line('SP-0012', 5, 5);
    for (const extra of [{ code: 'PN-0099' }, { receivedOn: '2026-01-01' }, { recorderName: 'x' }, { recorderId: String(oid()) }, { supplierName: 'x' }, { totalAccepted: 99 }, { status: 'X' }]) {
      expect((await save({ supplierId, lines: [one], ...extra })).status).toBe(422);
    }
    for (const extra of [{ quantityRejected: 0 }, { productCode: 'SP-0012' }, { productName: 'x' }]) {
      expect((await save({ supplierId, lines: [{ ...one, ...extra }] })).status).toBe(422);
    }
    expect((await save('x')).status).toBe(422);
    expect((await save([])).status).toBe(422);
    expect(await models.GoodsReceipt.countDocuments()).toBe(0);
  });

  test('AC-30 a supplier that stopped working with the shop cannot be chosen, and nothing is saved', async () => {
    const supplierId = await makeSupplier('Synthetic Supplier', { status: 'STOPPED' });
    const before = await stockOf('SP-0012');
    const res = await save({ supplierId, lines: [await line('SP-0012', 5, 5, undefined)] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SUPPLIER_NOT_ACTIVE');
    expect(await models.GoodsReceipt.countDocuments()).toBe(0);
    expect(await stockOf('SP-0012')).toBe(before);
    expect((await models.Supplier.findById(supplierId).lean()).lastReceiptAt).toBeUndefined();
  });

  test('a supplier that does not exist is refused', async () => {
    const res = await save({ supplierId: String(oid()), lines: [await line('SP-0012', 5, 5)] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SUPPLIER_NOT_FOUND');
  });

  test('a product that is not in the catalog is refused for the whole receipt, and the other lines add no stock', async () => {
    const supplierId = await makeSupplier();
    const before = await stockSnapshotAll();
    const ghost = String(oid());
    const res = await save({ supplierId, lines: [await line('SP-0012', 5, 5), { productId: ghost, quantityReceived: 3, quantityAccepted: 3 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(res.body.error.productIds).toEqual([ghost]);
    expect(await models.GoodsReceipt.countDocuments()).toBe(0);
    expect(await stockSnapshotAll()).toEqual(before);
  });

  async function stockSnapshotAll() {
    return (await models.Product.find().sort({ code: 1 }).lean()).map((p) => [p.code, p.stockOnHand, p.version]);
  }

  test('AC-30 a receipt already saved stays as it was when the supplier later stops or is renamed', async () => {
    const supplierId = await makeSupplier('Synthetic Supplier');
    const saved = (await save({ supplierId, lines: [await line('SP-0012', 5, 5)] }).expect(201)).body.data;
    await admin.patch(`${SUPPLIERS}/${supplierId}`).send({ version: 0, name: 'Synthetic Renamed' }).expect(200);
    await admin.post(`${SUPPLIERS}/${supplierId}/stop`).send({ version: 1 }).expect(200);
    const read = (await admin.get(`${RECEIPTS}/${saved.code}`).expect(200)).body.data;
    expect(read).toEqual(saved);
    expect(read.supplierName).toBe('Synthetic Supplier');
    expect((await admin.get(RECEIPTS).expect(200)).body.data.items.map((item) => item.code)).toEqual(['PN-0001']);
    expect((await save({ supplierId, lines: [await line('SP-0012', 1, 1)] })).status).toBe(409);
  });
});

describe('codes and the transaction', () => {
  test('the codes go PN-0001, PN-0002, ... and a code is never reused after a refused save', async () => {
    const supplierId = await makeSupplier();
    const code = async () => (await save({ supplierId, lines: [await line('SP-0012', 1, 1)] }).expect(201)).body.data.code;
    expect(await code()).toBe('PN-0001');
    await save({ supplierId, lines: [] }).expect(422);
    expect(await code()).toBe('PN-0002');
  });

  test('the code has no upper limit: PN-9999 is followed by PN-10000', async () => {
    const supplierId = await makeSupplier();
    await models.ProductCounter.create({ _id: 'GOODS_RECEIPT', value: 9998 });
    const codes = [];
    for (let i = 0; i < 3; i += 1) codes.push((await save({ supplierId, lines: [await line('SP-0012', 1, 1)] }).expect(201)).body.data.code);
    expect(codes).toEqual(['PN-9999', 'PN-10000', 'PN-10001']);
    expect((await admin.get(`${RECEIPTS}/PN-10000`).expect(200)).body.data.code).toBe('PN-10000');
    expect((await admin.get(RECEIPTS).expect(200)).body.data.items.map((item) => item.code)).toEqual(['PN-10001', 'PN-10000', 'PN-9999']);
  });

  test('the counter never falls behind the highest receipt in use', async () => {
    const supplierId = await makeSupplier();
    await models.GoodsReceipt.create({ code: 'PN-0041', number: 41, supplierId, supplierName: 'x', receivedOn: '2026-11-01', recorderId: oid(),
      recorderName: 'x', lines: [{ productId: oid(), productCode: 'SP-0012', productName: 'x', quantityReceived: 1, quantityAccepted: 1, quantityRejected: 0 }],
      totalReceived: 1, totalAccepted: 1, totalRejected: 0, idempotencyKey: 'synthetic-key-41', requestFingerprint: 'x' });
    expect((await save({ supplierId, lines: [await line('SP-0012', 1, 1)] }).expect(201)).body.data.code).toBe('PN-0042');
  });

  test('receipts saved at the same moment get different codes and every stock addition counts', async () => {
    const supplierId = await makeSupplier();
    const before = await stockOf('SP-0012');
    const results = await Promise.all(Array.from({ length: 6 }, async (_, i) => save({ supplierId, lines: [await line('SP-0012', i + 1, i + 1)] })));
    expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201, 201, 201]);
    expect(results.map((res) => res.body.data.code).sort()).toEqual(['PN-0001', 'PN-0002', 'PN-0003', 'PN-0004', 'PN-0005', 'PN-0006']);
    expect(await stockOf('SP-0012') - before).toBe(21);
    expect(await models.GoodsReceipt.countDocuments()).toBe(6);
  });

  test('a failure while writing a notice leaves no receipt, no stock and no notice at all', async () => {
    const supplierId = await makeSupplier();
    const before = await stockOf('SP-0012');
    // The notices collection refuses every insert, so the last step of the save fails after the stock was already added.
    await connection.db.dropCollection('notifications').catch(() => {});
    await connection.db.createCollection('notifications', { validator: { title: { $type: 'int' } } });
    try {
      const res = await save({ supplierId, lines: [await line('SP-0012', 5, 5), await line('SP-0014', 4, 3, 'Hỏng')] });
      expect(res.status).toBe(500);
      expect(await models.GoodsReceipt.countDocuments()).toBe(0);
      expect(await stockOf('SP-0012')).toBe(before);
      expect(await notices()).toEqual([]);
      expect((await models.Supplier.findById(supplierId).lean()).lastReceiptAt).toBeUndefined();
    } finally {
      await connection.db.dropCollection('notifications');
    }
    expect((await save({ supplierId, lines: [await line('SP-0012', 5, 5)] }).expect(201)).body.data.code).toBe('PN-0001');
  });

  test('a duplicate key from the database is answered as a code conflict and nothing is saved', async () => {
    const supplierId = await makeSupplier();
    const before = await stockOf('SP-0012');
    // A real clash: the code the save will take is already in use, while the counter and the highest number say it is free.
    // `number` is what the counter follows, so the clash is on `code` only (another number, the same code).
    await models.GoodsReceipt.collection.insertOne({ code: 'PN-0001', number: -1, supplierId: oid(), supplierName: 'x', receivedOn: '2026-11-01', recorderId: oid(),
      recorderName: 'x', lines: [], totalReceived: 0, totalAccepted: 0, totalRejected: 0, idempotencyKey: 'synthetic-stray-key', requestFingerprint: 'x' });
    const res = await save({ supplierId, lines: [await line('SP-0012', 5, 5)] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RECEIPT_CODE_CONFLICT');
    expect(await stockOf('SP-0012')).toBe(before);
    expect(await models.GoodsReceipt.countDocuments()).toBe(1);
    // The aborted save gave its number back, so the clash stays until the stray record is gone; then the save goes through.
    expect((await save({ supplierId, lines: [await line('SP-0012', 5, 5)] })).status).toBe(409);
    await models.GoodsReceipt.collection.deleteMany({ number: -1 });
    expect((await save({ supplierId, lines: [await line('SP-0012', 5, 5)] }).expect(201)).body.data.code).toBe('PN-0001');
  });
});

describe('sending a save again (D-218)', () => {
  test('a save without a usable Idempotency-Key is refused, and nothing is saved', async () => {
    const supplierId = await makeSupplier();
    const body = { supplierId, lines: [await line('SP-0012', 5, 5)] };
    const before = await stockOf('SP-0012');
    for (const key of [null, 'short', 'x'.repeat(129), 'has space in it', 'bad/slash/key1']) {
      const res = await save(body, key);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect(await models.GoodsReceipt.countDocuments()).toBe(0);
    expect(await stockOf('SP-0012')).toBe(before);
    expect((await save(body, 'a'.repeat(128))).status).toBe(201);
  });

  test('the same key with the same content returns the receipt already saved: no second receipt, stock and notices once', async () => {
    const supplierId = await makeSupplier();
    const body = { supplierId, lines: [await line('SP-0012', 10, 8, 'Hỏng'), await line('SP-0014', 4, 4)] };
    const before = [await stockOf('SP-0012'), await stockOf('SP-0014')];
    const first = (await save(body, 'synthetic-repeat-key').expect(201)).body.data;
    const again = (await save(body, 'synthetic-repeat-key').expect(201)).body.data;
    expect(again).toEqual(first);
    expect(again.code).toBe('PN-0001');
    expect(await models.GoodsReceipt.countDocuments()).toBe(1);
    expect([await stockOf('SP-0012') - before[0], await stockOf('SP-0014') - before[1]]).toEqual([8, 4]);
    expect(await notices()).toHaveLength(2);
    expect(await models.ProductCounter.findById('GOODS_RECEIPT').lean()).toMatchObject({ value: 1 });
    expect((await save(body).expect(201)).body.data.code).toBe('PN-0002');
  });

  test('the key is not part of what is returned or read back', async () => {
    const supplierId = await makeSupplier();
    const saved = (await save({ supplierId, lines: [await line('SP-0012', 1, 1)] }, 'synthetic-private-key').expect(201)).body.data;
    expect(JSON.stringify(saved)).not.toContain('synthetic-private-key');
    expect(JSON.stringify((await admin.get(`${RECEIPTS}/${saved.code}`).expect(200)).body.data)).not.toContain('synthetic-private-key');
    expect(JSON.stringify((await admin.get(RECEIPTS).expect(200)).body.data)).not.toContain('requestFingerprint');
  });

  test('the same key with other content is 409 IDEMPOTENCY_CONFLICT and changes nothing', async () => {
    const supplierId = await makeSupplier();
    const otherSupplier = await makeSupplier('Synthetic Other Supplier');
    const body = { supplierId, lines: [await line('SP-0012', 5, 5)] };
    await save(body, 'synthetic-key-conflict').expect(201);
    const before = await stockOf('SP-0012');
    const others = [
      { ...body, lines: [await line('SP-0012', 6, 6)] },
      { ...body, lines: [await line('SP-0012', 5, 4, 'Hỏng')] },
      { ...body, lines: [await line('SP-0014', 5, 5)] },
      { ...body, lines: [...body.lines, await line('SP-0014', 1, 1)] },
      { supplierId: otherSupplier, lines: body.lines }
    ];
    for (const other of others) {
      const res = await save(other, 'synthetic-key-conflict');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    }
    expect(await models.GoodsReceipt.countDocuments()).toBe(1);
    expect(await stockOf('SP-0012')).toBe(before);
  });

  test('a key belongs to the person who sent it: another Admin may use the same text for a receipt of their own', async () => {
    const supplierId = await makeSupplier();
    const body = { supplierId, lines: [await line('SP-0012', 5, 5)] };
    const mine = (await save(body, 'synthetic-shared-text').expect(201)).body.data;
    const theirs = (await saveAs('otherAdmin', body, 'synthetic-shared-text').expect(201)).body.data;
    expect([mine.code, theirs.code]).toEqual(['PN-0001', 'PN-0002']);
    expect(theirs.recorderName).toBe('Synthetic Other Admin');
  });

  test('a refused save does not use up its key: the same key saves once the problem is gone', async () => {
    const supplierId = await makeSupplier('Synthetic Supplier', { status: 'STOPPED' });
    const body = { supplierId, lines: [await line('SP-0012', 5, 5)] };
    expect((await save(body, 'synthetic-retry-key')).status).toBe(409);
    expect((await save({ ...body, lines: [] }, 'synthetic-retry-key')).status).toBe(422);
    await admin.post(`${SUPPLIERS}/${supplierId}/resume`).send({ version: 0 }).expect(200);
    expect((await save(body, 'synthetic-retry-key').expect(201)).body.data.code).toBe('PN-0001');
  });

  test('a repeat after the supplier stopped still returns the receipt that was saved, and a new key is refused', async () => {
    const supplierId = await makeSupplier();
    const body = { supplierId, lines: [await line('SP-0012', 5, 5)] };
    const first = (await save(body, 'synthetic-late-repeat').expect(201)).body.data;
    await admin.post(`${SUPPLIERS}/${supplierId}/stop`).send({ version: 0 }).expect(200);
    expect((await save(body, 'synthetic-late-repeat').expect(201)).body.data).toEqual(first);
    expect((await save(body)).status).toBe(409);
    expect(await models.GoodsReceipt.countDocuments()).toBe(1);
  });

  test('requests with one key at the same moment save one receipt, add the stock once and all get that receipt', async () => {
    const supplierId = await makeSupplier();
    const body = { supplierId, lines: [await line('SP-0012', 7, 5, 'Hỏng')] };
    const before = await stockOf('SP-0012');
    const results = await Promise.all(Array.from({ length: 6 }, () => save(body, 'synthetic-parallel-key')));
    expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201, 201, 201]);
    expect(new Set(results.map((res) => res.body.data.code))).toEqual(new Set(['PN-0001']));
    expect(new Set(results.map((res) => res.body.data.id)).size).toBe(1);
    expect(await models.GoodsReceipt.countDocuments()).toBe(1);
    expect(await stockOf('SP-0012') - before).toBe(5);
    expect(await notices()).toHaveLength(2);
  });

  test('requests with one key and different content at the same moment: one is saved, the others are 409 IDEMPOTENCY_CONFLICT', async () => {
    const supplierId = await makeSupplier();
    const before = await stockOf('SP-0012');
    const results = await Promise.all([1, 2, 3, 4].map(async (n) => save({ supplierId, lines: [await line('SP-0012', n, n)] }, 'synthetic-race-key')));
    const ok = results.filter((res) => res.status === 201);
    expect(ok).toHaveLength(1);
    expect(results.filter((res) => res.status === 409).map((res) => res.body.error.code)).toEqual(['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT']);
    expect(await models.GoodsReceipt.countDocuments()).toBe(1);
    expect(await stockOf('SP-0012') - before).toBe(ok[0].body.data.totalAccepted);
  });
});

describe('reading receipts', () => {
  test('the newest ten receipts come first, as a summary; one receipt is read by its code', async () => {
    const supplierId = await makeSupplier();
    const recorderId = oid();
    const entry = (n) => ({ code: `PN-${String(n).padStart(4, '0')}`, number: n, supplierId, supplierName: `Synthetic ${n}`, receivedOn: '2026-11-02',
      recorderId, recorderName: 'x', lines: [{ productId: oid(), productCode: 'SP-0012', productName: 'x', quantityReceived: n, quantityAccepted: n - 1, quantityRejected: 1, rejectReason: 'r' }],
      totalReceived: n, totalAccepted: n - 1, totalRejected: 1, idempotencyKey: `synthetic-key-${n}`, requestFingerprint: 'x' });
    await models.GoodsReceipt.insertMany(Array.from({ length: 12 }, (_, i) => entry(i + 1)));
    const list = (await admin.get(RECEIPTS).expect(200)).body.data.items;
    expect(list.map((item) => item.code)).toEqual(['PN-0012', 'PN-0011', 'PN-0010', 'PN-0009', 'PN-0008', 'PN-0007', 'PN-0006', 'PN-0005', 'PN-0004', 'PN-0003']);
    expect(list[0]).toEqual({ id: expect.any(String), code: 'PN-0012', supplierName: 'Synthetic 12', receivedOn: '2026-11-02',
      recordedAt: expect.any(String), totalReceived: 12, totalAccepted: 11, totalRejected: 1 });
    expect(list[0]).not.toHaveProperty('lines');
    const one = (await admin.get(`${RECEIPTS}/PN-0003`).expect(200)).body.data;
    expect(one).toMatchObject({ code: 'PN-0003', supplierId: String(supplierId), recorderName: 'x', lines: [expect.objectContaining({ quantityReceived: 3, rejectReason: 'r' })] });
  });

  test('an empty list is empty; an unknown or malformed code is 404; the list takes no query', async () => {
    expect((await admin.get(RECEIPTS).expect(200)).body.data).toEqual({ items: [] });
    for (const code of ['PN-0001', 'PN-1', 'pn-0001', 'PN-00x1', 'SP-0012', '5']) await admin.get(`${RECEIPTS}/${code}`).expect(404);
    expect((await admin.get(RECEIPTS).query({ page: 2 })).status).toBe(422);
  });
});
