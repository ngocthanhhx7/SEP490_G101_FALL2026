import { beforeAll, afterAll, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { createServer } from 'node:http';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { userModel } from '../../src/models/user.model.js';
import { identityModels } from '../../src/models/identity.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { registerModules } from '../../src/routes/module-registry.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';

const ROOT = '/api/v1/admin/counter-orders';
const oid = () => new mongoose.Types.ObjectId();
const actors = Object.fromEntries(['ADMIN', 'ADMIN2', 'CUSTOMER', 'STAFF', 'PET_SITTER', 'SALE_STAFF'].map(role =>
  [role, { userId: String(oid()), roles: [role === 'ADMIN2' ? 'ADMIN' : role], state: 'ACTIVE' }]));
const keys = { contactLookupSecret: 'synthetic-counter-lookup-secret-0000', contactEncryptionKey: 'c'.repeat(32) };
const crypto = createContactCrypto({ lookupSecret: keys.contactLookupSecret, encryptionKey: keys.contactEncryptionKey });
let replica, connection, models, User, Contact, server, base, sequence = 0;
const key = () => `synthetic-counter-${++sequence}`;
const call = (method, path, role = 'ADMIN', csrf = true) => {
  const req = request(base)[method](path);
  if (role) req.set('x-test-role', role);
  if (method !== 'get') { req.set('Origin', base); if (csrf) req.set('X-CSRF-Token', 'synthetic-csrf'); }
  return req;
};
const save = (body, commandKey = key(), role = 'ADMIN', csrf = true) => {
  const req = call('post', ROOT, role, csrf);
  if (commandKey !== null) req.set('Idempotency-Key', commandKey);
  return req.send(body);
};
const get = (path = ROOT, role = 'ADMIN') => call('get', path, role);
const act = (order, action, role = 'ADMIN') => call('post', `${ROOT}/${order.id}/${action}`, role).send({});
const product = (code = 'SP-0001', more = {}) => models.Product.create({ code, name: `Synthetic ${code}`, category: 'FOOD', petType: 'DOG',
  sellingPrice: 125000, stockOnHand: 10, quantityHeld: 0, visible: true, version: 0, detailsVersion: 2, ...more });
const body = (p, quantity = 2, more = {}) => ({ lines: [{ productId: p.id, quantity }], ...more });
const contact = (userId, channel, value, state = 'VERIFIED') => Contact.create({ userId, channel, state,
  canonicalCiphertext: crypto.encrypt(value), lookupKey: crypto.lookup(channel, value).lookupKey, verifiedAt: new Date() });
async function online(p, quantity = 1) {
  await call('post', '/api/v1/product-cart/lines', 'CUSTOMER').send({ productId: p.id, quantity }).expect(201);
  return call('post', '/api/v1/product-orders', 'CUSTOMER').set('Idempotency-Key', key()).send({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' });
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_counter_sale' }).asPromise();
  models = productSalesModels(connection); User = userModel(connection); Contact = identityModels(connection).Contact;
  const session = { authenticate: async req => actors[req.get('x-test-role')]
    ? { ...actors[req.get('x-test-role')], expiresAt: Date.now() + 60000 } : null,
  verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const app = express(); app.use(express.json(), requestId);
  registerModules(app, productSalesRuntimeModules({ connection, sessionService: session, env: { PRODUCT_SALES_ENABLED: 'true' },
    config: { auth: { enabled: true, ...keys } } }));
  app.use(errorHandler(() => {}));
  await Promise.all(Object.values(connection.models).map(model => model.init()));
  server = createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}, 600000);
afterAll(async () => { await new Promise(resolve => server?.close(resolve) ?? resolve()); await connection?.close(); await replica?.stop(); }, 30000);
beforeEach(async () => {
  for (const model of Object.values(models)) await model.deleteMany({});
  await User.deleteMany({}); await Contact.deleteMany({}); await connection.db.collection('notifications').deleteMany({});
  await User.create(Object.entries(actors).map(([role, actor]) => ({ _id: actor.userId, displayName: `Synthetic ${role}`, roles: actor.roles, state: 'ACTIVE' })));
});
afterEach(() => jest.restoreAllMocks());

test('Sale Staff completes a cash sale without catalog or stock adjustment authority', async () => {
  const p = await product();
  const order = (await save(body(p), key(), 'SALE_STAFF').expect(201)).body.data;
  await get(ROOT + '/' + order.id, 'SALE_STAFF').expect(200);
  await act(order, 'record-cash', 'SALE_STAFF').expect(200);
  await act(order, 'complete', 'SALE_STAFF').expect(200);
  expect((await models.Product.findById(p.id)).stockOnHand).toBe(8);
  await get('/api/v1/admin/products', 'SALE_STAFF').expect(403);
  await get('/api/v1/admin/suppliers', 'SALE_STAFF').expect(403);
  await call('post', '/api/v1/admin/stock-adjustments', 'SALE_STAFF').send({}).expect(403);
});

test.each(['AWAITING_PAYMENT', 'PAID', 'COMPLETED', 'CANCELLED'])('AC-28 rejects all customer and line edits after creation in %s', async status => {
  const p = await product(), commandKey = key();
  await contact(actors.CUSTOMER.userId, 'EMAIL', 'synthetic@example.test');
  const input = body(p, 2, { customerId: actors.CUSTOMER.userId });
  const order = (await save(input, commandKey).expect(201)).body.data;
  if (['PAID', 'COMPLETED'].includes(status)) await act(order, 'record-cash').expect(200);
  if (status === 'COMPLETED') await act(order, 'complete').expect(200);
  if (status === 'CANCELLED') await act(order, 'cancel').expect(200);
  const before = await models.ProductOrder.findById(order.id).lean(), stock = await models.Product.findById(p.id).lean();
  for (const changes of [{ customerId: actors.ADMIN.userId }, { lines: [{ productId: p.id, quantity: 3 }] }]) {
    for (const method of ['patch', 'put']) await call(method, `${ROOT}/${order.id}`).send(changes).expect(404);
    for (const action of ['record-cash', 'complete', 'cancel'])
      await call('post', `${ROOT}/${order.id}/${action}`).send(changes).expect(422);
    expect((await save({ ...input, ...changes }, commandKey).expect(409)).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  }
  expect(await models.ProductOrder.findById(order.id).lean()).toEqual(before);
  expect(await models.Product.findById(p.id).lean()).toEqual(stock);
  expect(await models.ProductOrder.countDocuments()).toBe(1);
});

test('AC-26 exposes counter prices and backend availability while excluding hidden and deleted products', async () => {
  const p = await product('SP-0031', { name: 'Dây dắt cho chó', stockOnHand: 9 });
  await online(p, 3);
  await product('SP-0032', { stockOnHand: 0 }); await product('SP-0033', { visible: false });
  await product('SP-0034', { deletedAt: new Date() });
  const list = (await get(`${ROOT}/products`).expect(200)).body.data;
  expect(list).toMatchObject({ total: 2, page: 1, limit: 20 });
  expect(list.items[0]).toMatchObject({ id: p.id, code: p.code, sellingPrice: 125000, available: 6 });
  expect(list.items[1].available).toBe(0);
  for (const search of ['sp-0031', 'DẮT']) expect((await get(`${ROOT}/products`).query({ search }).expect(200)).body.data.items.map(x => x.id)).toEqual([p.id]);
  for (const query of [{ search: 'x'.repeat(101) }, { page: 0 }, { limit: 51 }, { unknown: 'x' }]) await get(`${ROOT}/products`).query(query).expect(422);
});

test('AC-34 protects every endpoint and requires CSRF and a command key for creation', async () => {
  const p = await product();
  for (const role of ['', 'CUSTOMER', 'STAFF', 'PET_SITTER']) {
    const expected = role ? 403 : 401;
    for (const path of [ROOT, `${ROOT}/products`, `${ROOT}/${oid()}`]) await get(path, role).expect(expected);
    for (const path of ['/previews', '/customer-lookups', `/${oid()}/record-cash`, `/${oid()}/complete`, `/${oid()}/cancel`])
      await call('post', ROOT + path, role).send({}).expect(expected);
    await save(body(p), key(), role).expect(expected);
  }
  expect((await get().expect(200)).headers['cache-control']).toBe('private, no-store');
  for (const path of ['', '/previews', '/customer-lookups', `/${oid()}/record-cash`, `/${oid()}/complete`, `/${oid()}/cancel`])
    expect((await call('post', ROOT + path, 'ADMIN', false).send({})).body.error.code).toBe('CSRF_REJECTED');
  await save(body(p), null).expect(422); await save(body(p), 'bad').expect(422);
});

test('AC-26 D-268 previews server totals without reserving or changing any persisted sale state', async () => {
  const p = await product();
  const before = await models.Product.findById(p.id).lean();
  const preview = (await call('post', `${ROOT}/previews`).send(body(p, 3)).expect(200)).body.data;
  expect(preview).toMatchObject({ subtotal: 375000, tierDiscount: 0, shippingFee: 0, total: 375000 });
  expect(preview.lines[0]).toMatchObject({ productId: p.id, quantity: 3, unitPrice: 125000, lineTotal: 375000, available: 10 });
  expect(await models.Product.findById(p.id).lean()).toEqual(before);
  expect(await models.ProductOrder.countDocuments()).toBe(0); expect(await models.ProductCounter.countDocuments()).toBe(0);
  expect((await call('post', `${ROOT}/previews`).send({ lines: [] }).expect(200)).body.data.total).toBe(0);
});

test('AC-27 D-268 looks up exact current verified mobile/email contacts and returns only an active Customer identity', async () => {
  await contact(actors.CUSTOMER.userId, 'PHONE', '+84912345678');
  await contact(actors.CUSTOMER.userId, 'EMAIL', 'synthetic@example.test');
  await contact(actors.CUSTOMER.userId, 'PHONE', '+84912345679', 'REPLACED');
  for (const value of ['0912345678', '0912 345 678', '0912.345.678', '84912345678', '+84912345678', ' SYNTHETIC@EXAMPLE.TEST ']) {
    expect((await call('post', `${ROOT}/customer-lookups`).send({ contact: value }).expect(200)).body.data)
      .toEqual({ customer: { id: actors.CUSTOMER.userId, displayName: 'Synthetic CUSTOMER', tierCode: 'MEMBER' } });
  }
  for (const value of ['0912345679', '0999999999', 'nobody@example.test'])
    expect((await call('post', `${ROOT}/customer-lookups`).send({ contact: value }).expect(200)).body.data.customer).toBeNull();
  for (const value of ['', '123', '0241234567', 'bad@email', 'x'.repeat(255)])
    await call('post', `${ROOT}/customer-lookups`).send({ contact: value }).expect(422);
  for (const state of ['LOCKED', 'SUSPENDED']) {
    await User.updateOne({ _id: actors.CUSTOMER.userId }, { $set: { state } });
    expect((await call('post', `${ROOT}/customer-lookups`).send({ contact: '0912345678' }).expect(200)).body.data.customer).toBeNull();
  }
  await User.updateOne({ _id: actors.CUSTOMER.userId }, { $set: { state: 'ACTIVE', roles: ['STAFF'] } });
  expect((await call('post', `${ROOT}/customer-lookups`).send({ contact: 'synthetic@example.test' }).expect(200)).body.data.customer).toBeNull();
});

test('AC-28 GBR-35 creates an anonymous counter order with immutable prices and leaves all carts and real stock alone', async () => {
  const p = await product();
  const order = (await save(body(p)).expect(201)).body.data;
  expect(order).toMatchObject({ code: 'DH-0001', channel: 'COUNTER', status: 'AWAITING_PAYMENT', paid: false,
    customer: null, receiveMethod: 'COUNTER', paymentMethod: 'COUNTER_CASH', subtotal: 250000, tierDiscount: 0, shippingFee: 0, total: 250000, cashPayment: null });
  expect(order.lines[0]).toMatchObject({ productId: p.id, quantity: 2, unitPrice: 125000, lineTotal: 250000 });
  expect(order.idempotencyKey).toBeUndefined(); expect(order.requestFingerprint).toBeUndefined();
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 10, quantityHeld: 2, version: 1, detailsVersion: 2 });
  expect(await models.ProductCart.countDocuments()).toBe(0);
  expect(await connection.db.collection('notifications').countDocuments()).toBe(0);
  await models.Product.updateOne({ _id: p.id }, { $set: { sellingPrice: 200000 } });
  expect((await get(`${ROOT}/${order.id}`).expect(200)).body.data.total).toBe(250000);
});

test('AC-27 rechecks an optional selected customer before creating and keeps the selected name snapshot', async () => {
  const p = await product(); await contact(actors.CUSTOMER.userId, 'EMAIL', 'synthetic@example.test');
  const order = (await save(body(p, 1, { customerId: actors.CUSTOMER.userId })).expect(201)).body.data;
  expect(order.customer).toEqual({ id: actors.CUSTOMER.userId, displayName: 'Synthetic CUSTOMER', tierCode: 'MEMBER' });
  await User.updateOne({ _id: actors.CUSTOMER.userId }, { $set: { state: 'LOCKED', displayName: 'Changed' } });
  expect((await save(body(p, 1, { customerId: actors.CUSTOMER.userId })).expect(422)).body.error.code).toBe('COUNTER_CUSTOMER_UNAVAILABLE');
  expect((await get(`${ROOT}/${order.id}`).expect(200)).body.data.customer.displayName).toBe('Synthetic CUSTOMER');
});

test('validates line limits, unique products and caller-owned fields before creating any hold', async () => {
  const p = await product();
  for (const quantity of [0, -1, 1.2, '2', 100]) await save(body(p, quantity)).expect(422);
  for (const value of [{}, { lines: [] }, { lines: [{ productId: 'bad', quantity: 1 }] },
    { lines: [body(p).lines[0], body(p).lines[0]] }, { lines: Array.from({ length: 31 }, () => ({ productId: String(oid()), quantity: 1 })) },
    body(p, 2, { total: 1 }), body(p, 2, { paid: true }), body(p, 2, { channel: 'ONLINE' }), body(p, 2, { customerId: 'bad' })]) await save(value).expect(422);
  expect((await models.Product.findById(p.id)).quantityHeld).toBe(0);
});

test('GBR-35 checks the current available stock including actual online holds and permits the exact remaining quantity', async () => {
  const p = await product('SP-0001', { stockOnHand: 9 }); await online(p, 3);
  const exceeded = await save(body(p, 7)).expect(409);
  expect(exceeded.body.error).toMatchObject({ code: 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE', productId: p.id, available: 6 });
  await save(body(p, 6)).expect(201);
  const empty = await save(body(p, 1)).expect(409);
  expect(empty.body.error.available).toBe(0);
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 9, quantityHeld: 9 });
});

test('GBR-35 rolls back every line when another product is unavailable and never sells hidden/deleted products', async () => {
  const p = await product(), empty = await product('SP-0002', { stockOnHand: 0 });
  await save({ lines: [...body(p).lines, ...body(empty).lines] }).expect(409);
  expect((await models.Product.findById(p.id)).quantityHeld).toBe(0);
  for (const more of [{ visible: false }, { deletedAt: new Date() }]) {
    await models.Product.updateOne({ _id: p.id }, { $set: more });
    expect((await save(body(p)).expect(409)).body.error.code).toBe('PRODUCT_UNAVAILABLE');
  }
  expect(await models.ProductOrder.countDocuments()).toBe(0);
});

test('GBR-35 serializes two counter sales competing for the last sellable units', async () => {
  const p = await product('SP-0001', { stockOnHand: 9 });
  const replies = await Promise.all([save(body(p, 6)), save(body(p, 6), key(), 'ADMIN2')]);
  expect(replies.map(x => x.status).sort()).toEqual([201, 409]);
  expect(await models.ProductOrder.countDocuments()).toBe(1);
  expect((await models.Product.findById(p.id)).quantityHeld).toBe(6);
});

test('GBR-35 serializes counter creation against online placement without overdrawing either channel', async () => {
  const p = await product('SP-0001', { stockOnHand: 9 });
  await call('post', '/api/v1/product-cart/lines', 'CUSTOMER').send({ productId: p.id, quantity: 6 }).expect(201);
  const replies = await Promise.all([save(body(p, 6)), call('post', '/api/v1/product-orders', 'CUSTOMER').set('Idempotency-Key', key())
    .send({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' })]);
  expect(replies.map(x => x.status).sort()).toEqual([201, 409]);
  expect((await models.Product.findById(p.id)).quantityHeld).toBe(6);
});

test('AC-28 replays concurrent commands once, rejects changed content and keeps Admin command keys independent', async () => {
  const p = await product(), commandKey = key();
  const replies = await Promise.all(Array.from({ length: 4 }, () => save(body(p), commandKey)));
  expect(replies.map(x => x.status)).toEqual([201, 201, 201, 201]);
  expect(new Set(replies.map(x => x.body.data.id)).size).toBe(1);
  expect((await save(body(p, 3), commandKey).expect(409)).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  await save(body(p), commandKey, 'ADMIN2').expect(201);
  expect((await models.Product.findById(p.id)).quantityHeld).toBe(4);
});

test('rechecks price at creation, treats line order as the same command and rejects a changed customer on that key', async () => {
  const p = await product(), other = await product('SP-0002'), commandKey = key();
  await contact(actors.CUSTOMER.userId, 'EMAIL', 'synthetic@example.test');
  const lines = [...body(p, 1).lines, ...body(other, 1).lines];
  await call('post', `${ROOT}/previews`).send({ lines }).expect(200);
  await models.Product.updateOne({ _id: p.id }, { $set: { sellingPrice: 150000 } });
  const first = (await save({ lines }, commandKey).expect(201)).body.data;
  expect(first.total).toBe(275000);
  expect((await save({ lines: [...lines].reverse() }, commandKey).expect(201)).body.data.id).toBe(first.id);
  await save({ lines, customerId: actors.CUSTOMER.userId }, commandKey).expect(409);
  expect((await models.Product.findById(p.id)).quantityHeld).toBe(1);
});

test('D-268 shares DH numbering with online orders and preserves legacy orders without channel', async () => {
  const p = await product();
  const first = (await online(p)).body.data;
  expect(first.code).toBe('DH-0001');
  expect((await save(body(p)).expect(201)).body.data.code).toBe('DH-0002');
  expect((await online(p)).body.data.code).toBe('DH-0003');
  await models.ProductOrder.collection.updateOne({ _id: new mongoose.Types.ObjectId(first.id) }, { $unset: { channel: '' } });
  expect((await call('get', `/api/v1/product-orders/${first.id}`, 'CUSTOMER').expect(200)).body.data.code).toBe(first.code);
  await call('post', `/api/v1/admin/product-orders/${first.id}/mark-ready`).send({}).expect(200);
  await call('post', `/api/v1/admin/product-orders/${first.id}/record-payment`).send({}).expect(200);
  await call('post', `/api/v1/admin/product-orders/${first.id}/hand-to-customer`).send({}).expect(200);
});

test('AC-28 GBR-38 records full cash only once, retaining the first amount, recorder and time on retries', async () => {
  const p = await product(), order = (await save(body(p)).expect(201)).body.data;
  const replies = await Promise.all([act(order, 'record-cash'), act(order, 'record-cash', 'ADMIN2')]);
  expect(replies.map(x => x.status)).toEqual([200, 200]);
  expect(replies[0].body.data.cashPayment).toEqual(replies[1].body.data.cashPayment);
  expect(replies[0].body.data).toMatchObject({ status: 'PAID', paid: true, cashPayment: { amount: 250000 } });
  expect(replies[0].body.data.cashPayment.receivedAt).toEqual(expect.any(String));
  expect((await act(order, 'record-cash').expect(200)).body.data.cashPayment).toEqual(replies[0].body.data.cashPayment);
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 10, quantityHeld: 2 });
});

test('AC-28 GBR-38 completes only a paid sale and releases stock exactly once', async () => {
  const p = await product(), order = (await save(body(p)).expect(201)).body.data;
  expect((await act(order, 'complete').expect(409)).body.error.code).toBe('ORDER_NOT_PAID');
  const paid = (await act(order, 'record-cash').expect(200)).body.data;
  await act(order, 'cancel').expect(409);
  const replies = await Promise.all([act(order, 'complete'), act(order, 'complete', 'ADMIN2')]);
  expect(replies.map(x => x.status)).toEqual([200, 200]);
  expect(replies[0].body.data).toMatchObject({ status: 'COMPLETED', paid: true, cashPayment: paid.cashPayment });
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 8, quantityHeld: 0, version: 2, detailsVersion: 2 });
  expect((await act(order, 'record-cash').expect(200)).body.data.cashPayment).toEqual(paid.cashPayment);
  expect((await get().expect(200)).body.data.total).toBe(0);
});

test('AC-28 GBR-38 cancels only an unpaid sale and releases just its hold on repeat requests', async () => {
  const p = await product(), order = (await save(body(p)).expect(201)).body.data;
  const replies = await Promise.all([act(order, 'cancel'), act(order, 'cancel', 'ADMIN2')]);
  expect(replies.map(x => x.status)).toEqual([200, 200]);
  expect(replies[0].body.data).toMatchObject({ status: 'CANCELLED', paid: false });
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 10, quantityHeld: 0 });
  await act(order, 'record-cash').expect(409); await act(order, 'complete').expect(409);
});

test('GBR-38 allows only one result when taking cash races with cancellation', async () => {
  const p = await product(), order = (await save(body(p)).expect(201)).body.data;
  const replies = await Promise.all([act(order, 'record-cash'), act(order, 'cancel', 'ADMIN2')]);
  expect(replies.map(x => x.status).sort()).toEqual([200, 409]);
  const current = (await get(`${ROOT}/${order.id}`).expect(200)).body.data;
  expect(current.paid).toBe(current.status === 'PAID');
  expect((await models.Product.findById(p.id)).quantityHeld).toBe(current.paid ? 2 : 0);
});

test('GBR-35 rolls back a completed status on stock failure and a new hold on insert failure', async () => {
  const p = await product(), commandKey = key();
  jest.spyOn(models.ProductOrder.collection, 'insertOne').mockRejectedValueOnce(new Error('Synthetic insert failure'));
  await save(body(p), commandKey).expect(500);
  expect((await models.Product.findById(p.id)).quantityHeld).toBe(0);
  const order = (await save(body(p), commandKey).expect(201)).body.data;
  await act(order, 'record-cash').expect(200);
  jest.spyOn(models.Product, 'updateOne').mockRejectedValueOnce(new Error('Synthetic stock failure'));
  await act(order, 'complete').expect(500);
  expect((await get(`${ROOT}/${order.id}`).expect(200)).body.data.status).toBe('PAID');
  expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 10, quantityHeld: 2 });
  await act(order, 'complete').expect(200);
});

test('D-268 hides every counter state from online lists, totals, counts, searches, direct reads and all old commands', async () => {
  const p = await product('SP-0001', { stockOnHand: 100 }); await contact(actors.CUSTOMER.userId, 'EMAIL', 'synthetic@example.test');
  const old = (await online(p)).body.data, counter = [];
  for (let i = 0; i < 4; i++) counter.push((await save(body(p, 1, { customerId: actors.CUSTOMER.userId })).expect(201)).body.data);
  await act(counter[1], 'record-cash').expect(200);
  await act(counter[2], 'record-cash').expect(200); await act(counter[2], 'complete').expect(200);
  await act(counter[3], 'cancel').expect(200);
  const manage = '/api/v1/admin/product-orders';
  expect((await get(manage).expect(200)).body.data).toMatchObject({ total: 1, counts: { PREPARE: 1, AWAITING_PICKUP: 0, IN_TRANSIT: 0, RETURNING: 0 } });
  expect((await call('get', '/api/v1/product-orders', 'CUSTOMER').expect(200)).body.data.items.map(x => x.id)).toEqual([old.id]);
  expect((await call('get', '/api/v1/product-orders', 'CUSTOMER').expect(200)).body.data.total).toBe(1);
  for (const order of counter) {
    expect((await get(manage).query({ search: order.code }).expect(200)).body.data.total).toBe(0);
    await get(`${manage}/${order.id}`).expect(404);
    await call('get', `/api/v1/product-orders/${order.id}`, 'CUSTOMER').expect(404);
    for (const action of ['mark-ready', 'record-payment', 'hand-to-customer', 'cancel', 'mark-delivered'])
      await call('post', `${manage}/${order.id}/${action}`).send({}).expect(404);
    await call('post', `${manage}/${order.id}/hand-to-carrier`).send({ trackingCode: 'SYN-123' }).expect(404);
    await call('post', `${manage}/${order.id}/mark-returning`).send({ carrierReason: 'Synthetic' }).expect(404);
    await call('post', `${manage}/${order.id}/confirm-returned`).send({ reason: 'SHOP_FAULT', lines: [{ productId: p.id, resellableQuantity: 0 }] }).expect(404);
  }
  await get(`${ROOT}/${old.id}`).expect(404);
  for (const action of ['record-cash', 'complete', 'cancel']) await act(old, action).expect(404);
  await call('post', '/api/v1/product-orders', 'CUSTOMER').set('Idempotency-Key', key())
    .send({ receiveMethod: 'COUNTER', paymentMethod: 'COUNTER_CASH' }).expect(422);
});

test('recovers only unfinished sales in stable oldest-first pages and reads terminal sales by their link', async () => {
  const p = await product('SP-0001', { stockOnHand: 100 });
  const orders = [];
  for (let i = 0; i < 23; i++) orders.push((await save(body(p, 1)).expect(201)).body.data);
  await act(orders[0], 'cancel').expect(200); await act(orders[1], 'record-cash').expect(200);
  await act(orders[1], 'complete').expect(200); await act(orders[2], 'record-cash').expect(200);
  const first = (await get().expect(200)).body.data;
  expect(first).toMatchObject({ total: 21, limit: 20 });
  expect(first.items[0].id).toBe(orders[2].id);
  expect((await get().query({ page: 2 }).expect(200)).body.data.items.map(x => x.id)).toEqual([orders[22].id]);
  expect((await get(`${ROOT}/${orders[0].id}`).expect(200)).body.data.status).toBe('CANCELLED');
  expect((await get().query({ limit: 50 }).expect(200)).body.data.items).toHaveLength(21);
});
