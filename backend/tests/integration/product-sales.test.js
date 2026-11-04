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
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { registerModules } from '../../src/routes/module-registry.js';
import { provisionStorefrontCatalog } from '../../src/services/product-sales/storefront-catalog-provisioning.service.js';

const oid = () => new mongoose.Types.ObjectId();
const actors = {
  a: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  b: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  admin: { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE' }
};
// Synthetic keys only: the order router reads customer phones through the same contact crypto as sign-in.
const CONTACT_KEYS = { contactLookupSecret: 'synthetic-contact-lookup-secret-0123', contactEncryptionKey: 'synthetic-contact-encryption-key' };
let replica, connection, server, base, models, addressA, addressOutside, addressB;
const idem = (() => { let n = 0; return () => `synthetic-key-${String(++n).padStart(6, '0')}`; })();

const api = (who) => {
  const call = (method, path) => {
    const req = request(base)[method](path);
    if (who) req.set('x-test-actor', who);
    if (method !== 'get') req.set('Origin', base).set('X-CSRF-Token', 'synthetic-csrf');
    return req;
  };
  return { get: (p) => call('get', p), post: (p) => call('post', p), patch: (p) => call('patch', p), delete: (p) => call('delete', p) };
};
const product = (code) => models.Product.findOne({ code }).lean();
const idOf = async (code) => String((await product(code))._id);
const addToCart = async (who, code, quantity) => api(who).post('/api/v1/product-cart/lines').send({ productId: await idOf(code), quantity });
const placeDelivery = (who, addressId, key = idem()) => api(who).post('/api/v1/product-orders').set('Idempotency-Key', key)
  .send({ receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: String(addressId) });
const placePickup = (who, key = idem()) => api(who).post('/api/v1/product-orders').set('Idempotency-Key', key)
  .send({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' });

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_product_sales' }).asPromise();
  models = productSalesModels(connection);
  const { CustomerAddress } = petCareModels(connection);
  await CustomerAddress.createCollection(); await CustomerAddress.createIndexes();
  const make = (ownerId, areaCode) => CustomerAddress.create({ ownerId: ownerId, label: 'Synthetic home', location: 'Synthetic private address',
    point: { type: 'Point', coordinates: [105.85, 21.02] }, pointConfirmedAt: new Date(), areaCode, version: 0 });
  addressA = await make(actors.a.userId, 'DISTRICT_THANH_XUAN');
  addressOutside = await make(actors.a.userId, 'DISTRICT_UNKNOWN');
  addressB = await make(actors.b.userId, 'DISTRICT_DONG_DA');
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
  await provisionProductCatalog({ connection });
});

describe('seed', () => {
  test('is idempotent and keeps edited stock', async () => {
    await models.Product.updateOne({ code: 'SP-0012' }, { $set: { stockOnHand: 3 } });
    expect(await provisionProductCatalog({ connection })).toEqual({ state: 'APPLIED', inserted: 0, existing: 9 });
    expect((await product('SP-0012')).stockOnHand).toBe(3);
  });
});

describe('catalog', () => {
  test('pages the inherited catalogue and provisioning preserves Admin edits', async () => {
    expect((await provisionStorefrontCatalog({ connection })).inserted).toBe(20);
    await models.Product.updateOne({ code: 'SP-0038' }, { $set: { sellingPrice: 123000, stockOnHand: 2 } });
    expect((await provisionStorefrontCatalog({ connection })).inserted).toBe(0);
    expect(await product('SP-0038')).toMatchObject({ sellingPrice: 123000, stockOnHand: 2, sampleCatalog: true });
    const first = await api().get('/api/v1/products').expect(200);
    const second = await api().get('/api/v1/products?page=2').expect(200);
    expect(first.body.data).toMatchObject({ page: 1, limit: 20, total: 28 });
    expect(second.body.data.items).toHaveLength(8);
    expect(new Set([...first.body.data.items, ...second.body.data.items].map(row => row.id)).size).toBe(28);
    await api().get('/api/v1/products?page=0').expect(422);
  });
  test('lists only Shown products and filters by category, pet type and name', async () => {
    const all = await api().get('/api/v1/products').expect(200);
    expect(all.body.data.items).toHaveLength(8);
    expect(all.body.data.items.map((item) => item.code)).not.toContain('SP-0036');
    const dogFood = await api().get('/api/v1/products?category=FOOD&petType=DOG').expect(200);
    expect(dogFood.body.data.items.map((item) => item.code)).toEqual(['SP-0012', 'SP-0020']);
    const search = await api().get('/api/v1/products').query({ search: 'pate' }).expect(200);
    expect(search.body.data.items.map((item) => item.code)).toEqual(['SP-0016']);
    expect((await api().get('/api/v1/products').query({ search: 'zzz' }).expect(200)).body.data.items).toEqual([]);
  });

  test('reports availability and hides Hidden products from details', async () => {
    const collar = await api().get(`/api/v1/products/${await idOf('SP-0035')}`).expect(200);
    expect(collar.body.data).toMatchObject({ inStock: false, available: 0, sellingPrice: 60000 });
    await api().get(`/api/v1/products/${await idOf('SP-0036')}`).expect(404);
    await api().get('/api/v1/products?category=NOPE').expect(422);
  });
});

describe('cart', () => {
  test('rejects accumulated quantities above 99 and leaves a purchasable cart', async () => {
    await models.Product.updateOne({ code: 'SP-0012' }, { $set: { stockOnHand: 1000 } });
    await addToCart('a', 'SP-0012', 99);
    expect((await addToCart('a', 'SP-0012', 99)).status).toBe(422);
    expect((await api('a').get('/api/v1/product-cart')).body.data.lines[0].quantity).toBe(99);
    expect((await placePickup('a')).status).toBe(201);
  });

  test('two concurrent additions preserve both increments', async () => {
    await addToCart('a', 'SP-0012', 1);
    const added = await Promise.all([addToCart('a', 'SP-0012', 1), addToCart('a', 'SP-0012', 1)]);
    expect(added.map(response => response.status)).toEqual([201, 201]);
    expect((await api('a').get('/api/v1/product-cart')).body.data.lines[0].quantity).toBe(3);
  });
  test('requires a Customer session and does not reserve stock', async () => {
    await api().get('/api/v1/product-cart').expect(401);
    await api('admin').get('/api/v1/product-cart').expect(403);
    const added = await addToCart('a', 'SP-0012', 2);
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ lineCount: 1, subtotal: 500000, deliveryFee: 25000 });
    expect((await product('SP-0012')).quantityHeld).toBe(0);
  });

  test('rejects quantities above what can be sold and out-of-stock products', async () => {
    const tooMany = await addToCart('a', 'SP-0014', 7);
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error).toMatchObject({ code: 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE', available: 6 });
    await addToCart('a', 'SP-0014', 4);
    expect((await addToCart('a', 'SP-0014', 3)).body.error.code).toBe('PRODUCT_QUANTITY_EXCEEDS_AVAILABLE');
    expect((await addToCart('a', 'SP-0035', 1)).body.error.code).toBe('PRODUCT_OUT_OF_STOCK');
    expect((await addToCart('a', 'SP-0036', 1)).status).toBe(404);
  });

  test('changes and removes lines', async () => {
    await addToCart('a', 'SP-0012', 1);
    const productId = await idOf('SP-0012');
    const changed = await api('a').patch(`/api/v1/product-cart/lines/${productId}`).send({ quantity: 3 }).expect(200);
    expect(changed.body.data.lines[0].quantity).toBe(3);
    await api('a').patch(`/api/v1/product-cart/lines/${productId}`).send({ quantity: 99 }).expect(409);
    const removed = await api('a').delete(`/api/v1/product-cart/lines/${productId}`).expect(200);
    expect(removed.body.data.lineCount).toBe(0);
    await api('b').patch(`/api/v1/product-cart/lines/${productId}`).send({ quantity: 1 }).expect(404);
  });
});

describe('placing an order', () => {
  test('concurrent identical retries return the same order even after the winner empties the cart', async () => {
    await addToCart('a', 'SP-0012', 2);
    const key = idem();
    const results = await Promise.all([placePickup('a', key), placePickup('a', key)]);
    expect(results.map(row => row.status)).toEqual([201, 201]);
    expect(results[0].body.data.id).toBe(results[1].body.data.id);
    expect(await models.ProductOrder.countDocuments()).toBe(1);
    expect((await product('SP-0012')).quantityHeld).toBe(2);
  });
  test('holds stock, snapshots prices, adds the flat delivery fee and empties the cart', async () => {
    await addToCart('a', 'SP-0012', 2); await addToCart('a', 'SP-0031', 1);
    const placed = await placeDelivery('a', addressA._id);
    expect(placed.status).toBe(201);
    expect(placed.body.data).toMatchObject({ code: 'DH-0001', status: 'PLACED', receiveMethod: 'DELIVERY', paymentMethod: 'COD',
      paid: false, subtotal: 600000, shippingFee: 25000, total: 625000, trackingCode: null });
    expect(placed.body.data.deliveryAddress).toMatchObject({ areaCode: 'DISTRICT_THANH_XUAN' });
    expect(placed.body.data.lines.map((line) => line.unitPrice).sort()).toEqual([100000, 250000]);
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 15, quantityHeld: 2 });
    expect(await product('SP-0031')).toMatchObject({ stockOnHand: 9, quantityHeld: 1 });
    expect((await api('a').get('/api/v1/product-cart').expect(200)).body.data.lineCount).toBe(0);
  });

  test('an empty-cart attempt does not use up an order number', async () => {
    expect((await placePickup('a')).body.error.code).toBe('CART_EMPTY');
    await addToCart('a', 'SP-0020', 1);
    expect((await placePickup('a')).body.data.code).toBe('DH-0001');
  });

  test('pickup orders carry no address or fee', async () => {
    await addToCart('a', 'SP-0020', 2);
    const placed = await placePickup('a');
    expect(placed.status).toBe(201);
    expect(placed.body.data).toMatchObject({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP', shippingFee: 0, total: 90000, deliveryAddress: null });
  });

  test('replaying the same key returns the same order without holding twice', async () => {
    await addToCart('a', 'SP-0012', 2);
    const key = idem();
    const first = await placeDelivery('a', addressA._id, key);
    const again = await placeDelivery('a', addressA._id, key);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect((await product('SP-0012')).quantityHeld).toBe(2);
    await addToCart('a', 'SP-0012', 1);
    const other = await placePickup('a', key);
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  test('validates the cart, the address and the service area', async () => {
    expect((await placeDelivery('a', addressA._id)).body.error.code).toBe('CART_EMPTY');
    await addToCart('a', 'SP-0012', 1);
    const noAddress = await api('a').post('/api/v1/product-orders').set('Idempotency-Key', idem())
      .send({ receiveMethod: 'DELIVERY', paymentMethod: 'COD' });
    expect(noAddress.status).toBe(422); expect(noAddress.body.error.code).toBe('ADDRESS_REQUIRED');
    expect((await placeDelivery('a', addressOutside._id)).body.error.code).toBe('ADDRESS_OUT_OF_SERVICE_AREA');
    expect((await placeDelivery('a', addressB._id)).status).toBe(404);
    await api('a').post('/api/v1/product-orders').send({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }).expect(422);
    await api('a').post('/api/v1/product-orders').set('Idempotency-Key', idem())
      .send({ receiveMethod: 'DELIVERY', paymentMethod: 'PAY_AT_SHOP', addressId: String(addressA._id) }).expect(422);
    expect((await product('SP-0012')).quantityHeld).toBe(0);
  });

  test('creates no order and holds nothing when one line no longer fits', async () => {
    await addToCart('a', 'SP-0012', 2); await addToCart('a', 'SP-0014', 5);
    await models.Product.updateOne({ code: 'SP-0014' }, { $set: { stockOnHand: 3 } });
    const failed = await placeDelivery('a', addressA._id);
    expect(failed.status).toBe(409);
    expect(failed.body.error).toMatchObject({ code: 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE', available: 3 });
    expect(await models.ProductOrder.countDocuments()).toBe(0);
    expect((await product('SP-0012')).quantityHeld).toBe(0);
    expect((await api('a').get('/api/v1/product-cart').expect(200)).body.data.lineCount).toBe(2);
  });

  test('two concurrent orders can never hold more than the sellable quantity', async () => {
    await models.Product.updateOne({ code: 'SP-0031' }, { $set: { stockOnHand: 5 } });
    await addToCart('a', 'SP-0031', 3); await addToCart('b', 'SP-0031', 3);
    const results = await Promise.all([placeDelivery('a', addressA._id), placeDelivery('b', addressB._id)]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect((await product('SP-0031')).quantityHeld).toBe(3);
    expect(await models.ProductOrder.countDocuments()).toBe(1);
  });

  test('price changes after ordering do not touch the placed order', async () => {
    await addToCart('a', 'SP-0012', 1);
    const placed = await placePickup('a');
    await models.Product.updateOne({ code: 'SP-0012' }, { $set: { sellingPrice: 999000 } });
    const read = await api('a').get(`/api/v1/product-orders/${placed.body.data.id}`).expect(200);
    expect(read.body.data).toMatchObject({ subtotal: 250000, total: 250000 });
  });
});

describe('reading orders', () => {
  test('a Customer sees only their own orders', async () => {
    await addToCart('a', 'SP-0012', 1);
    const placed = await placePickup('a');
    await addToCart('b', 'SP-0020', 1); await placePickup('b');
    const mine = await api('a').get('/api/v1/product-orders').expect(200);
    expect(mine.body.data.items).toHaveLength(1);
    await api('b').get(`/api/v1/product-orders/${placed.body.data.id}`).expect(404);
    await api().get('/api/v1/product-orders').expect(401);
    await api('admin').get('/api/v1/product-orders').expect(403);
  });
});

describe('feature flag', () => {
  test('mounts nothing unless explicitly enabled and rejects invalid values', () => {
    const context = { config: { auth: { enabled: true } }, connection };
    expect(productSalesRuntimeModules({ ...context, env: {} })).toEqual([]);
    expect(productSalesRuntimeModules({ ...context, env: { PRODUCT_SALES_ENABLED: 'false' } })).toEqual([]);
    expect(() => productSalesRuntimeModules({ ...context, env: { PRODUCT_SALES_ENABLED: 'yes' } })).toThrow(TypeError);
  });
});
