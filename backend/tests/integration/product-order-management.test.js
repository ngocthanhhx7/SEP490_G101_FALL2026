import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import { createServer } from 'node:http';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { provisionProductCatalog } from '../../src/services/product-sales/product-catalog-provisioning.service.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { userModel } from '../../src/models/user.model.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { registerModules } from '../../src/routes/module-registry.js';

const oid = () => new mongoose.Types.ObjectId();
const actors = {
  a: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  b: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  admin: { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE' }
};
const MANAGE = '/api/v1/admin/product-orders';
let replica, connection, server, base, models, addressA;
const idem = (() => { let n = 0; return () => `synthetic-key-${String(++n).padStart(6, '0')}`; })();

const api = (who) => {
  const call = (method, path) => {
    const req = request(base)[method](path);
    if (who) req.set('x-test-actor', who);
    if (method !== 'get') req.set('Origin', base).set('X-CSRF-Token', 'synthetic-csrf');
    return req;
  };
  return { get: (p) => call('get', p), post: (p) => call('post', p) };
};
const product = (code) => models.Product.findOne({ code }).lean();
const idOf = async (code) => String((await product(code))._id);
const addToCart = async (who, code, quantity) => api(who).post('/api/v1/product-cart/lines').send({ productId: await idOf(code), quantity });
const placeDelivery = async (who, code, quantity) => {
  await addToCart(who, code, quantity);
  const res = await api(who).post('/api/v1/product-orders').set('Idempotency-Key', idem())
    .send({ receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: String(addressA._id) });
  expect(res.status).toBe(201);
  return res.body.data;
};
const placePickup = async (who, code, quantity) => {
  await addToCart(who, code, quantity);
  const res = await api(who).post('/api/v1/product-orders').set('Idempotency-Key', idem())
    .send({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' });
  expect(res.status).toBe(201);
  return res.body.data;
};
const act = (order, action, body = {}) => api('admin').post(`${MANAGE}/${order.id}/${action}`).send(body);

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_product_order_management' }).asPromise();
  models = productSalesModels(connection);
  const { CustomerAddress } = petCareModels(connection);
  await CustomerAddress.createCollection(); await CustomerAddress.createIndexes();
  addressA = await CustomerAddress.create({ ownerId: actors.a.userId, label: 'Synthetic home', location: 'Synthetic private address',
    point: { type: 'Point', coordinates: [105.85, 21.02] }, pointConfirmedAt: new Date(), areaCode: 'DISTRICT_THANH_XUAN', version: 0 });
  const User = userModel(connection);
  await User.create([
    { _id: actors.a.userId, displayName: 'Synthetic Mai', roles: ['CUSTOMER'], state: 'ACTIVE' },
    { _id: actors.b.userId, displayName: 'Synthetic Nhung', roles: ['CUSTOMER'], state: 'ACTIVE' }
  ]);
  const session = { authenticate: async (req) => {
    const actor = actors[req.get('x-test-actor')];
    return actor ? { ...actor, expiresAt: Date.now() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const modules = productSalesRuntimeModules({ config: { auth: { enabled: true } }, connection, sessionService: session,
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
  await provisionProductCatalog({ connection });
});

describe('access', () => {
  test('is Admin only', async () => {
    await api().get(MANAGE).expect(401);
    await api('a').get(MANAGE).expect(403);
    await api('a').post(`${MANAGE}/${oid()}/cancel`).send({}).expect(403);
    await api('admin').get(MANAGE).expect(200);
    await api('admin').get(`${MANAGE}/${oid()}`).expect(404);
    await api('admin').get(`${MANAGE}/not-an-id`).expect(422);
    await api('admin').get(`${MANAGE}?tab=NOPE`).expect(422);
  });
});

describe('listing', () => {
  test('filters by tab, counts every tab and searches by code or customer name', async () => {
    const delivery = await placeDelivery('a', 'SP-0012', 1);
    const pickup = await placePickup('b', 'SP-0020', 1);
    await act(pickup, 'mark-ready').expect(200);
    const prepare = await api('admin').get(`${MANAGE}?tab=PREPARE`).expect(200);
    expect(prepare.body.data.items.map((item) => item.code)).toEqual([delivery.code]);
    expect(prepare.body.data.items[0].customer.displayName).toBe('Synthetic Mai');
    expect(prepare.body.data.counts).toEqual({ PREPARE: 1, AWAITING_PICKUP: 1, IN_TRANSIT: 0, RETURNING: 0 });
    const awaiting = await api('admin').get(`${MANAGE}?tab=AWAITING_PICKUP`).expect(200);
    expect(awaiting.body.data.items.map((item) => item.code)).toEqual([pickup.code]);
    const all = await api('admin').get(MANAGE).expect(200);
    expect(all.body.data.items).toHaveLength(2);
    const byCode = await api('admin').get(`${MANAGE}`).query({ search: delivery.code.toLowerCase() }).expect(200);
    expect(byCode.body.data.items.map((item) => item.code)).toEqual([delivery.code]);
    const byName = await api('admin').get(`${MANAGE}`).query({ search: 'nhung' }).expect(200);
    expect(byName.body.data.items.map((item) => item.code)).toEqual([pickup.code]);
    expect((await api('admin').get(`${MANAGE}`).query({ search: 'zzz' }).expect(200)).body.data.items).toEqual([]);
    // A search containing regex characters is matched literally, not as a pattern.
    expect((await api('admin').get(`${MANAGE}`).query({ search: '.*' }).expect(200)).body.data.items).toEqual([]);
  });
});

describe('handing a delivery order to the carrier', () => {
  test('needs a tracking code (MSG103) and changes nothing without one', async () => {
    const order = await placeDelivery('a', 'SP-0012', 2);
    for (const body of [{}, { trackingCode: '   ' }]) {
      const res = await act(order, 'hand-to-carrier', body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('TRACKING_CODE_REQUIRED');
    }
    await act(order, 'hand-to-carrier', { trackingCode: 'bad code!' }).expect(422);
    expect(await models.ProductOrder.findById(order.id).lean()).toMatchObject({ status: 'PLACED' });
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 15, quantityHeld: 2 });
  });

  test('releases the hold and reduces the real stock, and the customer sees the tracking code', async () => {
    const order = await placeDelivery('a', 'SP-0012', 2);
    const done = await act(order, 'hand-to-carrier', { trackingCode: ' VN7290018342 ' });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'HANDED_TO_CARRIER', trackingCode: 'VN7290018342' });
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 13, quantityHeld: 0 });
    const mine = await api('a').get(`/api/v1/product-orders/${order.id}`).expect(200);
    expect(mine.body.data).toMatchObject({ status: 'HANDED_TO_CARRIER', trackingCode: 'VN7290018342' });
  });

  test('cannot be repeated and never takes stock twice', async () => {
    const order = await placeDelivery('a', 'SP-0012', 2);
    await act(order, 'hand-to-carrier', { trackingCode: 'VN7290018342' }).expect(200);
    const again = await act(order, 'hand-to-carrier', { trackingCode: 'VN7290018342' });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: 'ORDER_STATE_CONFLICT', status: 'HANDED_TO_CARRIER' });
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 13, quantityHeld: 0 });
  });

  test('two simultaneous requests apply once', async () => {
    const order = await placeDelivery('a', 'SP-0012', 3);
    const results = await Promise.all([
      act(order, 'hand-to-carrier', { trackingCode: 'VN0000000001' }),
      act(order, 'hand-to-carrier', { trackingCode: 'VN0000000002' })
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 12, quantityHeld: 0 });
  });

  test('is refused for pickup orders', async () => {
    const order = await placePickup('a', 'SP-0020', 1);
    expect((await act(order, 'hand-to-carrier', { trackingCode: 'VN7290018342' })).body.error.code).toBe('ORDER_STATE_CONFLICT');
  });
});

describe('pickup orders', () => {
  test('are readied without touching stock, then handed over once paid in full', async () => {
    const order = await placePickup('a', 'SP-0020', 2);
    const ready = await act(order, 'mark-ready');
    expect(ready.body.data.status).toBe('READY');
    expect(await product('SP-0020')).toMatchObject({ stockOnHand: 32, quantityHeld: 2 });

    const unpaid = await act(order, 'hand-to-customer');
    expect(unpaid.status).toBe(409);
    expect(unpaid.body.error.code).toBe('ORDER_NOT_PAID');
    expect(await product('SP-0020')).toMatchObject({ stockOnHand: 32, quantityHeld: 2 });

    const paid = await act(order, 'record-payment');
    expect(paid.body.data).toMatchObject({ paid: true, status: 'READY' });
    expect((await act(order, 'record-payment')).body.error.code).toBe('ORDER_STATE_CONFLICT');

    const handed = await act(order, 'hand-to-customer');
    expect(handed.body.data.status).toBe('PICKED_UP');
    expect(await product('SP-0020')).toMatchObject({ stockOnHand: 30, quantityHeld: 0 });
    expect((await act(order, 'hand-to-customer')).body.error.code).toBe('ORDER_STATE_CONFLICT');
  });

  test('cannot be handed over before they are ready, and delivery orders cannot be readied', async () => {
    const pickup = await placePickup('b', 'SP-0020', 1);
    expect((await act(pickup, 'hand-to-customer')).body.error.code).toBe('ORDER_STATE_CONFLICT');
    const delivery = await placeDelivery('a', 'SP-0012', 1);
    expect((await act(delivery, 'mark-ready')).body.error.code).toBe('ORDER_STATE_CONFLICT');
    expect((await act(delivery, 'record-payment')).body.error.code).toBe('ORDER_STATE_CONFLICT');
  });
});

describe('cancelling', () => {
  test('releases only the hold and leaves the real stock alone', async () => {
    const order = await placeDelivery('a', 'SP-0012', 2);
    expect((await act(order, 'cancel')).body.data.status).toBe('CANCELLED');
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 15, quantityHeld: 0 });
    const again = await act(order, 'cancel');
    expect(again.status).toBe(409);
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 15, quantityHeld: 0 });
  });

  test('a ready pickup order can be cancelled; an order that left the shop cannot', async () => {
    const pickup = await placePickup('b', 'SP-0020', 1);
    await act(pickup, 'mark-ready').expect(200);
    await act(pickup, 'cancel').expect(200);
    expect(await product('SP-0020')).toMatchObject({ stockOnHand: 32, quantityHeld: 0 });
    const shipped = await placeDelivery('a', 'SP-0012', 1);
    await act(shipped, 'hand-to-carrier', { trackingCode: 'VN7290018342' }).expect(200);
    expect((await act(shipped, 'cancel')).body.error.code).toBe('ORDER_STATE_CONFLICT');
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 14, quantityHeld: 0 });
  });

  test('stock freed by a cancellation can be ordered again', async () => {
    await models.Product.updateOne({ code: 'SP-0031' }, { $set: { stockOnHand: 2 } });
    const order = await placeDelivery('a', 'SP-0031', 2);
    expect((await addToCart('b', 'SP-0031', 1)).body.error.code).toBe('PRODUCT_OUT_OF_STOCK');
    await act(order, 'cancel').expect(200);
    expect((await addToCart('b', 'SP-0031', 2)).status).toBe(201);
  });
});

describe('stock safety', () => {
  test('refuses to change an order whose held stock no longer matches, and changes nothing', async () => {
    const order = await placeDelivery('a', 'SP-0012', 2);
    await models.Product.updateOne({ code: 'SP-0012' }, { $set: { quantityHeld: 0 } });
    const res = await act(order, 'hand-to-carrier', { trackingCode: 'VN7290018342' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_STOCK_MISMATCH');
    expect(await models.ProductOrder.findById(order.id).lean()).toMatchObject({ status: 'PLACED' });
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 15, quantityHeld: 0 });
  });
});
