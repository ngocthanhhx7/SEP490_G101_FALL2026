import { beforeAll, afterAll, beforeEach, describe, test, expect, jest } from '@jest/globals';
import { createServer } from 'node:http';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { dashboardReadRuntimeModule } from '../../src/routes/dashboard-runtime.routes.js';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { provisionProductCatalog } from '../../src/services/product-sales/product-catalog-provisioning.service.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { userModel } from '../../src/models/user.model.js';
import { createProductOrderManagementService } from '../../src/services/product-sales/product-order-management.service.js';
import * as productOrderManagement from '../../src/services/product-sales/product-order-management.service.js';
import { readProductOrderTabCounts } from '../../src/services/product-sales/product-order-tab-counts.js';
import { identityModels } from '../../src/models/identity.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { requestId, notFound, errorHandler } from '../../src/middlewares/http.js';
import { registerModules } from '../../src/routes/module-registry.js';

const oid = () => new mongoose.Types.ObjectId();
const actors = {
  a: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  b: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  c: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  admin: { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE' },
  sitter: { userId: String(oid()), roles: ['PET_SITTER'], state: 'ACTIVE' },
  staff: { userId: String(oid()), roles: ['STAFF'], state: 'ACTIVE' },
  saleStaff: { userId: String(oid()), roles: ['SALE_STAFF'], state: 'ACTIVE' }
};
const MANAGE = '/api/v1/admin/product-orders';
// Synthetic keys and numbers only: customer phones are stored encrypted under the same keys as sign-in.
const CONTACT_KEYS = { contactLookupSecret: 'synthetic-contact-lookup-secret-0123', contactEncryptionKey: 'synthetic-contact-encryption-key' };
const PHONE_A = '+84912345678', PHONE_B = '+84987654321', OLD_PHONE_A = '+84911111111';
let replica, connection, server, base, models, addressA;
const addressOf = {};
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
// A delivery order with the given [code, quantity] lines, already handed to the carrier.
const placeShipped = async (who, lines, { paymentMethod, paid } = {}) => {
  for (const [code, quantity] of lines) await addToCart(who, code, quantity);
  const res = await api(who).post('/api/v1/product-orders').set('Idempotency-Key', idem())
    .send({ receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: String(addressOf[who]._id) });
  expect(res.status).toBe(201);
  const order = res.body.data;
  // Advance payments cannot be placed yet; the order is switched to one directly for the refund checks.
  if (paymentMethod) await models.ProductOrder.updateOne({ _id: order.id }, { $set: { paymentMethod, paid } });
  await act(order, 'hand-to-carrier', { trackingCode: 'VN7290018342' }).expect(200);
  return order;
};
const returning = async (order, carrierReason = 'Customer not at home') => {
  await act(order, 'mark-returning', { carrierReason }).expect(200);
  return order;
};
const returnLines = async (entries) => Promise.all(entries.map(async ([code, resellableQuantity]) => ({ productId: await idOf(code), resellableQuantity })));
const confirmBody = async (entries, extra = {}) => ({ reason: 'CUSTOMER_REFUSED', lines: await returnLines(entries), ...extra });

function salesApp({ connection, enabled = true, includeCommonDashboard = false, commonFirst = false, pickupDeadlineHours, clock = Date.now }) {
  const sessionService = { authenticate: async (req) => {
    const actor = actors[req.get('x-test-actor')];
    return actor ? { ...actor, expiresAt: clock() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const config = { auth: { enabled: true, ...CONTACT_KEYS }, pickupDeadlineHours };
  const env = { PRODUCT_SALES_ENABLED: String(enabled) };
  const options = { config, connection, env, sessionService, clock };
  const sales = productSalesRuntimeModules(options);
  const common = includeCommonDashboard ? [dashboardReadRuntimeModule(options)] : [];
  const app = express();
  app.use(express.json(), requestId);
  registerModules(app, commonFirst ? [...common, ...sales] : [...sales, ...common]);
  app.use(notFound, errorHandler(() => {}));
  return app;
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_product_order_management' }).asPromise();
  models = productSalesModels(connection);
  const { CustomerAddress } = petCareModels(connection);
  await CustomerAddress.createCollection(); await CustomerAddress.createIndexes();
  addressA = await CustomerAddress.create({ ownerId: actors.a.userId, label: 'Synthetic home', location: 'Synthetic private address',
    point: { type: 'Point', coordinates: [105.85, 21.02] }, pointConfirmedAt: new Date(), areaCode: 'DISTRICT_THANH_XUAN', version: 0 });
  addressOf.a = addressA;
  for (const who of ['b', 'c']) {
    addressOf[who] = await CustomerAddress.create({ ownerId: actors[who].userId, label: 'Synthetic home', location: 'Synthetic private address',
      point: { type: 'Point', coordinates: [105.85, 21.02] }, pointConfirmedAt: new Date(), areaCode: 'DISTRICT_THANH_XUAN', version: 0 });
  }
  const User = userModel(connection);
  await User.create([
    { _id: actors.a.userId, displayName: 'Synthetic Mai', roles: ['CUSTOMER'], state: 'ACTIVE' },
    { _id: actors.b.userId, displayName: 'Synthetic Nhung', roles: ['CUSTOMER'], state: 'ACTIVE' },
    { _id: actors.c.userId, displayName: 'Synthetic Lan', roles: ['CUSTOMER'], state: 'ACTIVE' }
  ]);
  const crypto = createContactCrypto({ lookupSecret: CONTACT_KEYS.contactLookupSecret, encryptionKey: CONTACT_KEYS.contactEncryptionKey });
  const contact = (userId, phone, state) => ({ userId, channel: 'PHONE', canonicalCiphertext: crypto.encrypt(phone),
    lookupKey: crypto.lookup('PHONE', phone).lookupKey, state, verifiedAt: new Date() });
  await identityModels(connection).Contact.create([contact(actors.a.userId, PHONE_A, 'VERIFIED'),
    contact(actors.a.userId, OLD_PHONE_A, 'REPLACED'), contact(actors.b.userId, PHONE_B, 'VERIFIED')]);
  const app = salesApp({ connection });
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


test('queue counts exclude counter orders and scan pending statuses instead of closed history', async () => {
  const statuses = ['PLACED', 'READY', 'HANDED_TO_CARRIER', 'BEING_RETURNED'];
  const row = (status, index, channel) => ({ _id: oid(), code: `SYNTHETIC-${index}`, customerId: new mongoose.Types.ObjectId(actors.a.userId),
    idempotencyKey: `synthetic-count-${index}`, status, createdAt: new Date(), ...(channel ? { channel } : {}) });
  await models.ProductOrder.collection.insertMany([
    ...Array.from({ length: 1000 }, (_, index) => row('DELIVERED', index)),
    ...statuses.map((status, index) => row(status, index + 1000, index % 2 ? 'ONLINE' : undefined)),
    ...statuses.map((status, index) => row(status, index + 2000, 'COUNTER'))
  ]);
  const capture = jest.spyOn(models.ProductOrder, 'aggregate');
  let pipeline;
  try {
    expect(await readProductOrderTabCounts(models.ProductOrder)).toEqual({ PREPARE: 1, AWAITING_PICKUP: 1, IN_TRANSIT: 1, RETURNING: 1 });
    pipeline = capture.mock.calls[0][0];
  } finally { capture.mockRestore(); }
  const before = await models.ProductOrder.collection.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).explain('executionStats');
  const after = await models.ProductOrder.collection.aggregate(pipeline).explain('executionStats');
  const stats = plan => plan.executionStats ?? plan.stages.find(stage => stage.$cursor).$cursor.executionStats;
  expect(stats(before).totalDocsExamined).toBeGreaterThanOrEqual(1000);
  expect(stats(after).totalDocsExamined).toBeLessThanOrEqual(8);
});

describe('UC-94 Sale Staff dashboard', () => {
  const DASHBOARD = '/api/v1/dashboards/sale-staff';
  const NO_ORDERS = { PREPARE: 0, AWAITING_PICKUP: 0, RETURNING: 0 };

  test('returns only counts matching Order Management across statuses', async () => {
    await placeDelivery('a', 'SP-0012', 1);
    await placePickup('a', 'SP-0020', 1);
    const pickup = await placePickup('b', 'SP-0020', 1);
    await act(pickup, 'mark-ready').expect(200);
    await returning(await placeShipped('a', [['SP-0012', 1]]));
    await placeShipped('a', [['SP-0012', 1]]);

    const list = await api('saleStaff').get(MANAGE + '?tab=RETURNING&limit=1').expect(200);
    const { PREPARE, AWAITING_PICKUP, RETURNING } = list.body.data.counts;
    const dashboard = await api('saleStaff').get(DASHBOARD).expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(dashboard.body.data).toEqual({ counts: { PREPARE, AWAITING_PICKUP, RETURNING } });
    expect(dashboard.body.data.counts).toEqual({ PREPARE: 2, AWAITING_PICKUP: 1, RETURNING: 1 });
  });

  test.each([[null, 401], ['a', 403], ['sitter', 403], ['staff', 403], ['admin', 403]])(
    'restricts dashboard access for %s to HTTP %s', async (actor, status) => {
      await api(actor).get(DASHBOARD).expect(status);
    }
  );

  test('returns zero with an empty provisioned collection', async () => {
    const collections = await connection.db.listCollections({ name: models.ProductOrder.collection.name }).toArray();
    expect(collections).toHaveLength(1);
    const list = await api('saleStaff').get(MANAGE).expect(200);
    expect(list.body.data.counts).toEqual({ ...NO_ORDERS, IN_TRANSIT: 0 });
    expect((await api('saleStaff').get(DASHBOARD).expect(200)).body.data).toEqual({ counts: NO_ORDERS });
  });

  test('returns the same zeros as Order Management before an order collection is created', async () => {
    const fresh = await mongoose.createConnection(replica.getUri(), {
      dbName: 'synthetic_uc94_unprovisioned', autoCreate: false, autoIndex: false, bufferCommands: false
    }).asPromise();
    try {
      const app = salesApp({ connection: fresh });
      const filter = { name: productSalesModels(fresh).ProductOrder.collection.name };
      expect(await fresh.db.listCollections(filter).toArray()).toEqual([]);
      const list = await request(app).get(MANAGE).set('x-test-actor', 'saleStaff').expect(200);
      expect(list.body.data.counts).toEqual({ ...NO_ORDERS, IN_TRANSIT: 0 });
      const dashboard = await request(app).get(DASHBOARD).set('x-test-actor', 'saleStaff').expect(200);
      expect(dashboard.body.data).toEqual({ counts: NO_ORDERS });
      expect(await fresh.db.listCollections(filter).toArray()).toEqual([]);
    } finally {
      await fresh.close();
    }
  });

  test('returns a service error when the order count query fails', async () => {
    const aggregate = jest.spyOn(models.ProductOrder, 'aggregate').mockImplementationOnce(() => {
      throw new Error('Synthetic query failure');
    });
    try {
      const response = await api('saleStaff').get(DASHBOARD).expect(503);
      expect(response.body.error.code).toBe('SALES_DASHBOARD_SOURCE_UNAVAILABLE');
      expect(response.body).not.toHaveProperty('data');
      expect(JSON.stringify(response.body)).not.toContain('Synthetic query failure');
    } finally {
      aggregate.mockRestore();
    }
  });

  test.each([false, true])('coexists with the common dashboard router (common first: %s)', async (commonFirst) => {
    const app = salesApp({ connection, includeCommonDashboard: true, commonFirst });
    expect((await request(app).get(DASHBOARD).set('x-test-actor', 'saleStaff').expect(200)).body.data)
      .toEqual({ counts: NO_ORDERS });
    await request(app).get('/api/v1/dashboards/staff').set('x-test-actor', 'saleStaff').expect(403);
    await request(app).get('/api/v1/dashboards/staff').set('x-test-actor', 'staff').expect(202);
  });

  test('returns HTTP 404 when product sales is disabled even with the common dashboard router', async () => {
    const app = salesApp({ connection, enabled: false, includeCommonDashboard: true });
    const response = await request(app).get(DASHBOARD).set('x-test-actor', 'saleStaff').expect(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    await request(app).get('/api/v1/dashboards/staff').set('x-test-actor', 'staff').expect(202);
  });
});

describe('composition', () => {
  test('refuses to run without a customer phone directory', () => {
    expect(() => createProductOrderManagementService({ connection })).toThrow(TypeError);
  });
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

describe('customer phone (AC-19, D-217)', () => {
  const codesFor = async (search) => (await api('admin').get(MANAGE).query({ search }).expect(200)).body.data.items.map((item) => item.code);

  test('AC-19 finds a customer by the whole phone number, however it is typed', async () => {
    const orderA = await placeDelivery('a', 'SP-0012', 1);
    const orderB = await placePickup('b', 'SP-0020', 1);
    for (const typed of ['0912345678', ' 0912 345 678 ', '0912.345.678', '84912345678', '+84912345678']) {
      expect(await codesFor(typed)).toEqual([orderA.code]);
    }
    expect(await codesFor('0987654321')).toEqual([orderB.code]);
  });

  test('AC-19 matches nothing for an unknown number, a part of a number or a number the customer replaced', async () => {
    await placeDelivery('a', 'SP-0012', 1);
    await placePickup('b', 'SP-0020', 1);
    expect(await codesFor('0900000000')).toEqual([]);
    expect(await codesFor('0912')).toEqual([]);
    expect(await codesFor('0911111111')).toEqual([]);
  });

  test('AC-19 still searches by code and name, and a phone search keeps the tab filter', async () => {
    const orderA = await placeDelivery('a', 'SP-0012', 1);
    const orderB = await placePickup('b', 'SP-0020', 1);
    expect(await codesFor(orderB.code)).toEqual([orderB.code]);
    expect(await codesFor('mai')).toEqual([orderA.code]);
    const inAwaiting = await api('admin').get(MANAGE).query({ tab: 'AWAITING_PICKUP', search: '0912345678' }).expect(200);
    expect(inAwaiting.body.data.items).toEqual([]);
  });

  test('AC-19 (D-236) shows the phone with the customer, and null when the customer has none', async () => {
    const orderA = await placeDelivery('a', 'SP-0012', 1);
    const orderC = await placePickup('c', 'SP-0020', 1);
    const list = await api('admin').get(MANAGE).expect(200);
    const customerOf = (code) => list.body.data.items.find((item) => item.code === code).customer;
    expect(customerOf(orderA.code)).toMatchObject({ displayName: 'Synthetic Mai', phone: '0912345678' });
    expect(customerOf(orderC.code)).toMatchObject({ displayName: 'Synthetic Lan', phone: null });
    const read = await api('admin').get(`${MANAGE}/${orderA.id}`).expect(200);
    expect(read.body.data.customer.phone).toBe('0912345678');
  });

  test('AC-34 never gives a phone number to a customer or a guest', async () => {
    const orderA = await placeDelivery('a', 'SP-0012', 1);
    const mine = await api('a').get(`/api/v1/product-orders/${orderA.id}`).expect(200);
    expect(JSON.stringify(mine.body)).not.toMatch(/0912345678|84912345678|"customer"/u);
    await api('a').get(MANAGE).query({ search: '0912345678' }).expect(403);
    await api().get(MANAGE).query({ search: '0912345678' }).expect(401);
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

describe('delivery result (UC-65, AC-04)', () => {
  test('AC-04 delivered: a cash-on-delivery order becomes paid, stock stays, the customer sees it', async () => {
    const order = await placeShipped('a', [['SP-0012', 2]]);
    const done = await act(order, 'mark-delivered');
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'DELIVERED', paid: true, paymentMethod: 'COD' });
    expect(done.body.data.deliveredAt).toEqual(expect.any(String));
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 13, quantityHeld: 0 });
    expect((await api('a').get(`/api/v1/product-orders/${order.id}`).expect(200)).body.data).toMatchObject({ status: 'DELIVERED', paid: true });
  });

  test('AC-04 delivered: an advance payment is left as it was', async () => {
    const paidAhead = await placeShipped('a', [['SP-0012', 1]], { paymentMethod: 'PREPAID', paid: true });
    expect((await act(paidAhead, 'mark-delivered')).body.data).toMatchObject({ status: 'DELIVERED', paid: true, paymentMethod: 'PREPAID' });
    const notPaid = await placeShipped('b', [['SP-0020', 1]], { paymentMethod: 'PREPAID', paid: false });
    expect((await act(notPaid, 'mark-delivered')).body.data).toMatchObject({ status: 'DELIVERED', paid: false });
  });

  test('AC-19 two Admins saving the same delivery step: it is applied once', async () => {
    const delivered = await placeShipped('a', [['SP-0012', 1]]);
    const first = await Promise.all([act(delivered, 'mark-delivered'), act(delivered, 'mark-delivered')]);
    expect(first.map((res) => res.status).sort()).toEqual([200, 409]);
    const returned = await placeShipped('b', [['SP-0020', 1]]);
    const second = await Promise.all([act(returned, 'mark-returning', { carrierReason: 'Reason one' }),
      act(returned, 'mark-returning', { carrierReason: 'Reason two' })]);
    expect(second.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await models.ProductOrder.findById(returned.id).lean()).toMatchObject({ status: 'BEING_RETURNED', version: 2 });
  });

  test('AC-04 delivered: only an order handed to the carrier, and only once', async () => {
    const placed = await placeDelivery('a', 'SP-0012', 1);
    expect((await act(placed, 'mark-delivered')).body.error.code).toBe('ORDER_STATE_CONFLICT');
    const pickup = await placePickup('b', 'SP-0020', 1);
    expect((await act(pickup, 'mark-delivered')).body.error.code).toBe('ORDER_STATE_CONFLICT');
    const shipped = await placeShipped('c', [['SP-0031', 1]]);
    await act(shipped, 'mark-delivered').expect(200);
    expect((await act(shipped, 'mark-delivered')).body.error.code).toBe('ORDER_STATE_CONFLICT');
    expect((await act(shipped, 'mark-returning', { carrierReason: 'Late change' })).body.error.code).toBe('ORDER_STATE_CONFLICT');
  });

  test('AC-04 being returned: asks for the carrier reason and changes nothing without it', async () => {
    const order = await placeShipped('a', [['SP-0012', 2]]);
    for (const body of [{}, { carrierReason: '' }, { carrierReason: '   ' }, { carrierReason: 5 }, { carrierReason: 'x'.repeat(301) },
      { carrierReason: 'bad\u0007reason' }, { carrierReason: 'ok', extra: true }]) {
      const res = await act(order, 'mark-returning', body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect(await models.ProductOrder.findById(order.id).lean()).toMatchObject({ status: 'HANDED_TO_CARRIER' });
  });

  test('AC-04 being returned: keeps the carrier reason, leaves stock alone and shows in the Returning tab', async () => {
    const order = await placeShipped('a', [['SP-0012', 2]]);
    const res = await act(order, 'mark-returning', { carrierReason: ' Customer was not at home ' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'BEING_RETURNED', carrierReturnReason: 'Customer was not at home' });
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 13, quantityHeld: 0 });
    const tab = await api('admin').get(`${MANAGE}?tab=RETURNING`).expect(200);
    expect(tab.body.data.items.map((item) => item.code)).toEqual([order.code]);
    expect((await act(order, 'mark-returning', { carrierReason: 'Again' })).body.error.code).toBe('ORDER_STATE_CONFLICT');
  });

  test('AC-34 (D-221) only the people the permission table names can use these actions', async () => {
    const order = await placeShipped('a', [['SP-0012', 1]]);
    for (const action of ['mark-delivered', 'mark-returning', 'confirm-returned']) {
      await api('a').post(`${MANAGE}/${order.id}/${action}`).send({}).expect(403);
      await api().post(`${MANAGE}/${order.id}/${action}`).send({}).expect(401);
    }
    expect(await models.ProductOrder.findById(order.id).lean()).toMatchObject({ status: 'HANDED_TO_CARRIER' });
  });
});

describe('confirming a returned order (UC-66, AC-04, AC-18)', () => {
  test('AC-04 puts back only the resellable quantity of each line, once, and keeps the reasons', async () => {
    const order = await returning(await placeShipped('a', [['SP-0012', 2], ['SP-0020', 1]]));
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 13, quantityHeld: 0 });
    expect(await product('SP-0020')).toMatchObject({ stockOnHand: 31, quantityHeld: 0 });
    const done = await act(order, 'confirm-returned', await confirmBody([['SP-0012', 1], ['SP-0020', 0]], { note: ' Box was torn ' }));
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'RETURNED', returnReason: 'CUSTOMER_REFUSED', returnNote: 'Box was torn',
      carrierReturnReason: 'Customer not at home', refundMarked: false });
    expect(done.body.data.returnedAt).toEqual(expect.any(String));
    expect(done.body.data.lines.map((line) => [line.productCode, line.quantity, line.resellableQuantity])).toEqual([['SP-0012', 2, 1], ['SP-0020', 1, 0]]);
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 14, quantityHeld: 0 });
    expect(await product('SP-0020')).toMatchObject({ stockOnHand: 31, quantityHeld: 0 });
    // A second confirmation changes nothing and never adds stock again.
    const again = await act(order, 'confirm-returned', await confirmBody([['SP-0012', 2], ['SP-0020', 1]]));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ORDER_STATE_CONFLICT');
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 14, quantityHeld: 0 });
  });

  test('AC-04 everything resellable returns the whole line to stock', async () => {
    const order = await returning(await placeShipped('a', [['SP-0012', 3]]));
    await act(order, 'confirm-returned', await confirmBody([['SP-0012', 3]], { reason: 'CARRIER_UNDELIVERABLE' })).expect(200);
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 15, quantityHeld: 0 });
  });

  test('AC-04 a quantity above what was returned is MSG104 and nothing changes', async () => {
    const order = await returning(await placeShipped('a', [['SP-0012', 2], ['SP-0020', 1]]));
    for (const bad of [3, -1, 1.5, '1', null]) {
      const body = await confirmBody([['SP-0012', bad], ['SP-0020', 1]]);
      const res = await act(order, 'confirm-returned', body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('RESELLABLE_QUANTITY_INVALID');
      expect(res.body.error.details ?? res.body.error).toMatchObject({ productId: await idOf('SP-0012') });
    }
    expect(await models.ProductOrder.findById(order.id).lean()).toMatchObject({ status: 'BEING_RETURNED' });
    expect(await models.ProductCustomerRefusal.countDocuments()).toBe(0);
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 13 });
    expect(await product('SP-0020')).toMatchObject({ stockOnHand: 31 });
  });

  test('AC-04 the request must cover every line of the order once, with a known reason', async () => {
    const order = await returning(await placeShipped('a', [['SP-0012', 2], ['SP-0020', 1]]));
    const full = await confirmBody([['SP-0012', 1], ['SP-0020', 1]]);
    const bad = [
      { ...full, lines: full.lines.slice(0, 1) },
      { ...full, lines: [full.lines[0], { productId: String(oid()), resellableQuantity: 1 }] },
      { ...full, lines: [full.lines[0], full.lines[0]] },
      { ...full, lines: [] },
      { ...full, reason: 'BECAUSE' },
      { lines: full.lines },
      { ...full, extra: 1 },
      { ...full, note: 'x'.repeat(501) }
    ];
    for (const body of bad) expect((await act(order, 'confirm-returned', body)).status).toBe(422);
    expect(await models.ProductOrder.findById(order.id).lean()).toMatchObject({ status: 'BEING_RETURNED' });
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 13 });
  });

  test('AC-04 (AC-19) only an order that is being returned can be confirmed, and two requests apply once', async () => {
    const shipped = await placeShipped('a', [['SP-0012', 2]]);
    expect((await act(shipped, 'confirm-returned', await confirmBody([['SP-0012', 2]]))).body.error.code).toBe('ORDER_STATE_CONFLICT');
    const order = await returning(await placeShipped('b', [['SP-0020', 2]]));
    const body = await confirmBody([['SP-0020', 2]]);
    const results = await Promise.all([act(order, 'confirm-returned', body), act(order, 'confirm-returned', body)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await product('SP-0020')).toMatchObject({ stockOnHand: 32 });
    expect(await models.ProductCustomerRefusal.countDocuments()).toBe(1);
  });

  test('AC-04 stock that cannot be put back rolls the whole confirmation back', async () => {
    const order = await returning(await placeShipped('a', [['SP-0012', 1], ['SP-0020', 1]]));
    const body = await confirmBody([['SP-0012', 1], ['SP-0020', 1]]);
    await models.Product.deleteOne({ code: 'SP-0020' });
    const res = await act(order, 'confirm-returned', body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_STOCK_MISMATCH');
    expect(await models.ProductOrder.findById(order.id).lean()).toMatchObject({ status: 'BEING_RETURNED' });
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 14 });
    expect(await models.ProductCustomerRefusal.countDocuments()).toBe(0);
  });

  test('AC-18 the customer is counted as refusing only when the shop says the customer refused', async () => {
    const refused = await returning(await placeShipped('a', [['SP-0012', 1]]));
    await act(refused, 'confirm-returned', await confirmBody([['SP-0012', 1]])).expect(200);
    const records = await models.ProductCustomerRefusal.find({}).lean();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ reason: 'REFUSED_DELIVERY' });
    expect(String(records[0].customerId)).toBe(actors.a.userId);
    expect(String(records[0].orderId)).toBe(refused.id);
    expect(records[0].occurredAt).toEqual(expect.any(Date));

    for (const reason of ['CARRIER_UNDELIVERABLE', 'SHOP_FAULT']) {
      const other = await returning(await placeShipped('b', [['SP-0020', 1]]));
      await act(other, 'confirm-returned', await confirmBody([['SP-0020', 1]], { reason })).expect(200);
    }
    expect(await models.ProductCustomerRefusal.countDocuments()).toBe(1);

    const second = await returning(await placeShipped('a', [['SP-0031', 1]]));
    await act(second, 'confirm-returned', await confirmBody([['SP-0031', 0]])).expect(200);
    expect(await models.ProductCustomerRefusal.countDocuments({ customerId: actors.a.userId })).toBe(2);
    // One record per order: the order id cannot be recorded twice.
    await expect(models.ProductCustomerRefusal.create({ customerId: actors.a.userId, orderId: refused.id, reason: 'REFUSED_DELIVERY', occurredAt: new Date() }))
      .rejects.toThrow();
  });

  test('AC-18 an advance payment that was paid is marked for refund; cash on delivery and unpaid ones are not', async () => {
    const paid = await returning(await placeShipped('a', [['SP-0012', 1]], { paymentMethod: 'PREPAID', paid: true }));
    expect((await act(paid, 'confirm-returned', await confirmBody([['SP-0012', 1]], { reason: 'SHOP_FAULT' }))).body.data.refundMarked).toBe(true);
    const unpaid = await returning(await placeShipped('b', [['SP-0020', 1]], { paymentMethod: 'PREPAID', paid: false }));
    expect((await act(unpaid, 'confirm-returned', await confirmBody([['SP-0020', 1]]))).body.data.refundMarked).toBe(false);
    const cod = await returning(await placeShipped('c', [['SP-0031', 1]]));
    expect((await act(cod, 'confirm-returned', await confirmBody([['SP-0031', 1]]))).body.data.refundMarked).toBe(false);
    await models.ProductOrder.updateOne({ _id: cod.id }, { $set: { paid: true } });
    expect((await models.ProductOrder.findById(cod.id).lean()).refundMarked).toBe(false);
  });

  test('AC-34 return details are for the shop only; the customer view does not carry them', async () => {
    const order = await returning(await placeShipped('a', [['SP-0012', 1]]), 'Secret carrier remark');
    await act(order, 'confirm-returned', await confirmBody([['SP-0012', 1]], { note: 'Internal note' })).expect(200);
    const mine = await api('a').get(`/api/v1/product-orders/${order.id}`).expect(200);
    expect(mine.body.data.status).toBe('RETURNED');
    expect(JSON.stringify(mine.body)).not.toMatch(/Secret carrier remark|Internal note|carrierReturnReason|returnNote|refundMarked|resellableQuantity/u);
    const shop = await api('admin').get(`${MANAGE}/${order.id}`).expect(200);
    expect(shop.body.data).toMatchObject({ carrierReturnReason: 'Secret carrier remark', returnNote: 'Internal note' });
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

describe('JOB-04 pickup deadlines', () => {
  const now = Date.parse('2026-11-14T17:05:00Z');
  const due = new Date(now);
  const orderDoc = (order) => models.ProductOrder.findById(order.id).lean();
  const orderNotices = (order) => connection.db.collection('notifications').find({ eventId: { $regex: '^product-order:' + order.id + ':' } }).toArray();
  const refusals = (order) => models.ProductCustomerRefusal.find({ orderId: order.id }).lean();
  const expiry = () => productOrderManagement.createProductPickupExpiryService({ connection, clock: () => now });

  async function readyPickup(fields = { pickupDeadlineAt: due }, productCode = 'SP-0020') {
    const order = await placePickup('a', productCode, 1);
    await act(order, 'mark-ready').expect(200);
    await models.ProductOrder.collection.updateOne({ _id: new mongoose.Types.ObjectId(order.id) }, { $set: fields });
    return order;
  }

  async function markReadyAt(order, time, pickupDeadlineHours) {
    const app = salesApp({ connection, pickupDeadlineHours, clock: () => time });
    const testServer = createServer(app);
    await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + testServer.address().port;
    try {
      await request(origin).post(MANAGE + '/' + order.id + '/mark-ready').set('Origin', origin)
        .set('x-test-actor', 'saleStaff').set('X-CSRF-Token', 'synthetic-csrf').send({}).expect(200);
    } finally {
      await new Promise(resolve => testServer.close(resolve));
    }
  }

  test('AC-17 stores the configured deadline from mark ready even with JOB-04 disabled', async () => {
    const order = await placePickup('a', 'SP-0020', 1);
    await markReadyAt(order, now, 2);
    expect(await orderDoc(order)).toMatchObject({ status: 'READY', pickupDeadlineAt: new Date(now + 2 * 3_600_000) });
    expect(await product('SP-0020')).toMatchObject({ quantityHeld: 1, stockOnHand: 32 });
  });

  test('AC-17 and GBR-46 notify the exact Vietnam deadline with JOB-04 disabled', async () => {
    const order = await placePickup('a', 'SP-0020', 1);
    await markReadyAt(order, now - 72 * 3_600_000, 72);
    expect(await orderNotices(order)).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: 'product-order:' + order.id + ':1', role: 'CUSTOMER',
        message: 'Đơn ' + order.code + ' đã sẵn sàng để nhận tại cửa hàng. Vui lòng đến lấy trước 00:05 15/11/2026.' })
    ]));
  });

  test('AC-22 cancels at the exact deadline, releases only held stock and records one refusal on replay', async () => {
    const order = await readyPickup();
    const job = expiry();
    expect(await job.runBatch()).toMatchObject({ cancelled: 1, failed: 0 });
    expect(await job.runBatch()).toMatchObject({ cancelled: 0, failed: 0 });
    expect(await orderDoc(order)).toMatchObject({ status: 'CANCELLED', version: 2, refundMarked: false });
    expect(await product('SP-0020')).toMatchObject({ quantityHeld: 0, stockOnHand: 32 });
    expect(await refusals(order)).toEqual([expect.objectContaining({ reason: 'NOT_COLLECTED', occurredAt: due })]);
  });

  const cancellationNotices = async (order) => (await orderNotices(order))
    .filter((notice) => notice.eventId === 'product-order:' + order.id + ':2');

  test('GBR-46 sends one expiry notice even when the job runs again', async () => {
    const expired = await readyPickup();
    const job = expiry();
    await job.runBatch();
    await job.runBatch();
    expect(await cancellationNotices(expired)).toEqual([expect.objectContaining({
      message: 'Đơn ' + expired.code + ' đã huỷ vì quá hạn lấy hàng.',
      deepLink: '/customer/product-orders?order=' + expired.id
    })]);
  });

  test('GBR-46 preserves the manual cancellation wording', async () => {
    const manual = await readyPickup();
    await act(manual, 'cancel').expect(200);
    expect(await cancellationNotices(manual)).toEqual([expect.objectContaining({
      message: 'Đơn ' + manual.code + ' đã hủy.'
    })]);
  });

  test('JOB-04 skips future, legacy undated, paid-at-shop, delivery, counter and placed orders', async () => {
    const future = await readyPickup({ pickupDeadlineAt: new Date(now + 1) });
    const legacy = await readyPickup();
    await models.ProductOrder.collection.updateOne({ _id: new mongoose.Types.ObjectId(legacy.id) }, { $unset: { pickupDeadlineAt: '' } });
    const paid = await readyPickup({ pickupDeadlineAt: due, paid: true });
    const delivery = await readyPickup({ pickupDeadlineAt: due, receiveMethod: 'DELIVERY' });
    const counter = await readyPickup({ pickupDeadlineAt: due, channel: 'COUNTER' });
    const placed = await placePickup('a', 'SP-0020', 1);
    await models.ProductOrder.collection.updateOne({ _id: new mongoose.Types.ObjectId(placed.id) }, { $set: { pickupDeadlineAt: due } });
    expect(await expiry().runBatch()).toMatchObject({ cancelled: 0, failed: 0 });
    for (const order of [future, legacy, paid, delivery, counter]) {
      expect(await orderDoc(order)).toMatchObject({ status: 'READY', version: 1 });
      expect(await refusals(order)).toEqual([]);
    }
    expect(await orderDoc(placed)).toMatchObject({ status: 'PLACED' });
    expect(await product('SP-0020')).toMatchObject({ quantityHeld: 6, stockOnHand: 32 });
  });

  test('GBR-37 marks a paid PREPAID pickup for refund and handles old online orders without channel', async () => {
    const order = await readyPickup({ pickupDeadlineAt: new Date(now - 1), paymentMethod: 'PREPAID', paid: true });
    await models.ProductOrder.collection.updateOne({ _id: new mongoose.Types.ObjectId(order.id) }, { $unset: { channel: '' } });
    expect(await expiry().runBatch()).toMatchObject({ cancelled: 1, failed: 0 });
    expect(await orderDoc(order)).toMatchObject({ status: 'CANCELLED', paid: true, refundMarked: true });
    expect(await refusals(order)).toHaveLength(1);
  });

  test('JOB-04 processes at most 100 orders per run, starting with the oldest deadline', async () => {
    const order = await readyPickup();
    const { _id, code, idempotencyKey, ...fixture } = await orderDoc(order);
    const older = Array.from({ length: 100 }, (_, index) => ({
      ...fixture,
      code: code + '-' + index,
      idempotencyKey: idempotencyKey + '-' + index,
      pickupDeadlineAt: new Date(now - 1)
    }));
    await models.Product.updateOne({ code: 'SP-0020' }, { $set: { stockOnHand: 101, quantityHeld: 101 } });
    await models.ProductOrder.collection.insertMany(older);
    const job = expiry();
    expect(await job.runBatch()).toMatchObject({ cancelled: 100, failed: 0 });
    expect(await models.ProductOrder.findById(_id).lean()).toMatchObject({ status: 'READY' });
    expect(await product('SP-0020')).toMatchObject({ quantityHeld: 1, stockOnHand: 101 });
    expect(await job.runBatch()).toMatchObject({ cancelled: 1, failed: 0 });
    expect(await orderDoc(order)).toMatchObject({ status: 'CANCELLED' });
  });

  test.each([
    ['record-payment', {}, 'READY', 1, 32],
    ['hand-to-customer', { paymentMethod: 'PREPAID', paid: true }, 'PICKED_UP', 0, 31]
  ])('GBR-35 keeps stock consistent when JOB-04 races with %s', async (action, fields, staffStatus, held, stockOnHand) => {
    const order = await readyPickup({ pickupDeadlineAt: due, ...fields });
    const [staff, batch] = await Promise.all([
      api('saleStaff').post(MANAGE + '/' + order.id + '/' + action).send({}), expiry().runBatch()
    ]);
    expect(batch.failed).toBe(0);
    expect(await orderDoc(order)).toMatchObject({ version: 2 });
    if (staff.status === 200) {
      expect(batch.cancelled).toBe(0);
      expect(await orderDoc(order)).toMatchObject({ status: staffStatus, paid: true, refundMarked: false });
      expect(await product('SP-0020')).toMatchObject({ quantityHeld: held, stockOnHand });
      expect(await refusals(order)).toEqual([]);
    } else {
      expect(staff.status).toBe(409);
      expect(staff.body.error.code).toBe('ORDER_STATE_CONFLICT');
      expect(batch.cancelled).toBe(1);
      expect(await orderDoc(order)).toMatchObject({ status: 'CANCELLED' });
      expect(await product('SP-0020')).toMatchObject({ quantityHeld: 0, stockOnHand: 32 });
      expect(await refusals(order)).toHaveLength(1);
    }
  });

  test('AC-22 rolls back a DB write failure for one order and retries it on the next run', async () => {
    const failing = await readyPickup();
    const other = await readyPickup({ pickupDeadlineAt: due }, 'SP-0012');
    const notificationCollection = connection.db.collection('notifications');
    await connection.db.command({ collMod: notificationCollection.collectionName,
      validator: { eventId: { $ne: 'product-order:' + failing.id + ':2' } } });
    try {
      expect(await expiry().runBatch()).toMatchObject({ cancelled: 1, failed: 1 });
      expect(await orderDoc(failing)).toMatchObject({ status: 'READY', version: 1 });
      expect(await product('SP-0020')).toMatchObject({ quantityHeld: 1, stockOnHand: 32 });
      expect(await refusals(failing)).toEqual([]);
      expect((await orderNotices(failing)).map(row => row.eventId)).not.toContain('product-order:' + failing.id + ':2');
      expect(await orderDoc(other)).toMatchObject({ status: 'CANCELLED' });
    } finally {
      await connection.db.command({ collMod: notificationCollection.collectionName, validator: {} });
    }
    expect(await expiry().runBatch()).toMatchObject({ cancelled: 1, failed: 0 });
    expect(await orderDoc(failing)).toMatchObject({ status: 'CANCELLED' });
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

test.each([
  [undefined, 401, 401, 401, 401],
  ['a', 403, 403, 200, 403],
  ['sitter', 403, 403, 403, 403],
  ['staff', 403, 403, 403, 403],
  ['admin', 200, 200, 403, 200],
  ['saleStaff', 200, 403, 403, 403]
])('Permission Matrix for product sales as %s', async (who, manage, administer, cart, cancel) => {
  await api(who).get('/api/v1/products').expect(200);
  await api(who).get('/api/v1/product-cart').expect(cart);
  await api(who).get(MANAGE).expect(manage);
  await api(who).get('/api/v1/admin/products').expect(administer);
  await api(who).get('/api/v1/admin/suppliers').expect(administer);
  const order = await placePickup('a', 'SP-0012', 1);
  await api(who).post(`${MANAGE}/${order.id}/cancel`).send({}).expect(cancel);
});

test('Permission Matrix Sale Staff handles pickup, delivery and returns', async () => {
  const sale = api('saleStaff');
  const step = (order, action, body = {}) => sale.post(`${MANAGE}/${order.id}/${action}`).send(body).expect(200);
  const pickup = await placePickup('a', 'SP-0012', 1);
  await sale.get(`${MANAGE}/${pickup.id}`).expect(200);
  await step(pickup, 'mark-ready');
  await step(pickup, 'record-payment');
  await step(pickup, 'hand-to-customer');
  const delivery = await placeDelivery('a', 'SP-0012', 1);
  await step(delivery, 'hand-to-carrier', { trackingCode: 'TEST-DELIVERY' });
  await step(delivery, 'mark-delivered');
  const returned = await placeDelivery('a', 'SP-0012', 1);
  await step(returned, 'hand-to-carrier', { trackingCode: 'TEST-RETURN' });
  await step(returned, 'mark-returning', { carrierReason: 'Synthetic carrier reason' });
  await step(returned, 'confirm-returned', await confirmBody([['SP-0012', 1]]));
  await sale.post('/api/v1/product-orders').send({}).expect(403);
});
