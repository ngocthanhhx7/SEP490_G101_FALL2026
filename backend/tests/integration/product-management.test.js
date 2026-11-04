import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import { createServer } from 'node:http';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { provisionProductCatalog } from '../../src/services/product-sales/product-catalog-provisioning.service.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { registerModules } from '../../src/routes/module-registry.js';

const oid = () => new mongoose.Types.ObjectId();
const actors = {
  admin: { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE' },
  customer: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  staff: { userId: String(oid()), roles: ['STAFF'], state: 'ACTIVE' },
  sitter: { userId: String(oid()), roles: ['PET_SITTER'], state: 'ACTIVE' }
};
const ADMIN_PRODUCTS = '/api/v1/admin/products';
// Synthetic keys only; the product routes share a runtime with the order routes, which need them.
const CONTACT_KEYS = { contactLookupSecret: 'synthetic-contact-lookup-secret-0123', contactEncryptionKey: 'synthetic-contact-encryption-key' };
let replica, connection, server, base, models;
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
const admin = api('admin');
const valid = (over = {}) => ({ name: 'Synthetic bone toy', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 80000, ...over });
const create = (body = valid()) => admin.post(ADMIN_PRODUCTS).send(body);
const byCode = (code) => models.Product.findOne({ code }).lean();
const publicCodes = async (query = '') => (await api().get(`/api/v1/products${query}`).expect(200)).body.data.items.map((item) => item.code);
const placePickup = async (code, quantity) => {
  const product = await byCode(code);
  await api('customer').post('/api/v1/product-cart/lines').send({ productId: String(product._id), quantity }).expect(201);
  const res = await api('customer').post('/api/v1/product-orders').set('Idempotency-Key', idem())
    .send({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' });
  expect(res.status).toBe(201);
  return res.body.data;
};

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_product_management' }).asPromise();
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
  await provisionProductCatalog({ connection });
});

describe('access (AC-34)', () => {
  test('AC-34 a guest gets 401 and a Customer, Staff or Pet Sitter gets 403 on every product management call', async () => {
    const id = String((await byCode('SP-0012'))._id);
    const calls = [['get', ADMIN_PRODUCTS], ['get', `${ADMIN_PRODUCTS}/${id}`], ['post', ADMIN_PRODUCTS], ['patch', `${ADMIN_PRODUCTS}/${id}`]];
    for (const [method, path] of calls) {
      const call = (who) => (method === 'get' ? api(who).get(path) : api(who)[method](path).send({}));
      expect((await call()).status).toBe(401);
      for (const who of ['customer', 'staff', 'sitter']) expect((await call(who)).status).toBe(403);
    }
    expect(await models.Product.countDocuments()).toBe(9);
  });

  test('AC-34 only Admin may use it, and a write needs the CSRF token', async () => {
    await admin.get(ADMIN_PRODUCTS).expect(200);
    await request(base).post(ADMIN_PRODUCTS).set('x-test-actor', 'admin').set('Origin', base).send(valid()).expect(403);
    expect(await models.Product.countDocuments()).toBe(9);
  });

  test('AC-34 an unknown product is 404, a malformed id is 422, and there is no way to delete a product', async () => {
    await admin.get(`${ADMIN_PRODUCTS}/${oid()}`).expect(404);
    await admin.patch(`${ADMIN_PRODUCTS}/${oid()}`).send({ version: 0, name: 'Synthetic' }).expect(404);
    await admin.get(`${ADMIN_PRODUCTS}/not-an-id`).expect(422);
    const id = String((await byCode('SP-0012'))._id);
    expect((await admin.delete(`${ADMIN_PRODUCTS}/${id}`)).status).toBe(404);
    expect(await models.Product.countDocuments()).toBe(9);
  });
});

describe('list (UC-57)', () => {
  test('shows every product, hidden ones too, without any stock figure, in code order', async () => {
    const res = await admin.get(ADMIN_PRODUCTS).expect(200);
    const { items, total, page, limit } = res.body.data;
    expect([total, page, limit, items.length]).toEqual([9, 1, 20, 9]);
    expect(items.map((item) => item.code)).toEqual([...items.map((item) => item.code)].sort());
    expect(items.find((item) => item.code === 'SP-0036')).toMatchObject({ visible: false, sellingPrice: 120000, category: 'ACCESSORY', petType: 'DOG' });
    expect(Object.keys(items[0]).sort()).toEqual(['category', 'code', 'description', 'id', 'name', 'petType', 'photos', 'sellingPrice', 'updatedAt', 'version', 'visible']);
  });

  test('searches a part of the name or of the code, whatever the case, and filters by category and pet together', async () => {
    const codes = async (query) => (await admin.get(ADMIN_PRODUCTS).query(query).expect(200)).body.data.items.map((item) => item.code);
    expect(await codes({ search: 'xương' })).toEqual(['SP-0020']);
    expect(await codes({ search: 'XƯƠNG' })).toEqual(['SP-0020']);
    expect(await codes({ search: 'sp-003' })).toEqual(['SP-0031', 'SP-0035', 'SP-0036', 'SP-0037']);
    expect(await codes({ search: '0036' })).toEqual(['SP-0036']);
    expect(await codes({ search: ' dây  dắt ' })).toEqual(['SP-0031']);
    expect(await codes({ category: 'FOOD', petType: 'CAT' })).toEqual(['SP-0014', 'SP-0016']);
    expect(await codes({ category: 'ACCESSORY', petType: 'DOG', search: 'sp-003' })).toEqual(['SP-0031', 'SP-0035', 'SP-0036']);
    expect(await codes({ search: 'zzz' })).toEqual([]);
    // Regex characters are matched literally.
    expect(await codes({ search: '.*' })).toEqual([]);
  });

  test('pages through the list with a total, and a page past the end is empty', async () => {
    const page = async (query) => (await admin.get(ADMIN_PRODUCTS).query(query).expect(200)).body.data;
    const first = await page({ limit: 4 });
    const second = await page({ limit: 4, page: 2 });
    const third = await page({ limit: 4, page: 3 });
    expect([first.items.length, second.items.length, third.items.length]).toEqual([4, 4, 1]);
    expect([first.total, second.total, third.total]).toEqual([9, 9, 9]);
    expect(new Set([...first.items, ...second.items, ...third.items].map((item) => item.code)).size).toBe(9);
    const past = await page({ limit: 4, page: 4 });
    expect(past).toMatchObject({ items: [], total: 9, page: 4, limit: 4 });
    expect((await page({ limit: 50 })).items).toHaveLength(9);
  });

  test('rejects a bad page, limit, filter or key', async () => {
    for (const query of [{ page: 0 }, { page: 'x' }, { page: '1.5' }, { page: 100001 }, { limit: 0 }, { limit: 51 }, { limit: 'x' },
      { category: 'TOYS' }, { petType: 'BIRD' }, { status: 'x' }, { search: 'a'.repeat(101) }]) {
      expect((await admin.get(ADMIN_PRODUCTS).query(query)).status).toBe(422);
    }
  });
});

describe('create (UC-57, AC-29)', () => {
  test('AC-29 saves a hidden product with no stock and a system code that continues after the highest one', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ code: 'SP-0038', name: 'Synthetic bone toy', category: 'ACCESSORY', petType: 'DOG',
      sellingPrice: 80000, visible: false, description: '', photos: [], version: 0 });
    expect(await byCode('SP-0038')).toMatchObject({ stockOnHand: 0, quantityHeld: 0, visible: false });
    expect((await create(valid({ name: 'Synthetic second' }))).body.data.code).toBe('SP-0039');
    await models.Product.create({ code: 'SP-0100', name: 'Synthetic late', category: 'FOOD', petType: 'CAT', sellingPrice: 1000, stockOnHand: 1 });
    expect((await create()).body.data.code).toBe('SP-0101');
  });

  test('AC-29 a new product is not on the public Products page until it is shown', async () => {
    const created = (await create()).body.data;
    expect(await publicCodes()).not.toContain(created.code);
    await api().get(`/api/v1/products/${created.id}`).expect(404);
  });

  test('AC-29 simultaneous saves never share a code', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => create(valid({ name: `Synthetic parallel ${i}` }))));
    expect(results.map((res) => res.status)).toEqual(Array(6).fill(201));
    const codes = results.map((res) => res.body.data.code);
    expect(new Set(codes).size).toBe(6);
    expect(codes.sort()).toEqual(['SP-0038', 'SP-0039', 'SP-0040', 'SP-0041', 'SP-0042', 'SP-0043']);
  });

  test('AC-29 the same name may be used twice, the code is what is unique', async () => {
    const first = (await create()).body.data;
    const second = (await create()).body.data;
    expect(second.name).toBe(first.name);
    expect(second.code).not.toBe(first.code);
  });

  test('AC-29 a missing name is MSG01 (REQUIRED) and a price that is not a whole number above 0 is MSG113 (WHOLE_NUMBER)', async () => {
    const failure = async (body) => {
      const res = await create(body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      return res.body.error.fields;
    };
    for (const name of [undefined, '', '   ', null]) expect(await failure(valid({ name }))).toEqual({ name: 'REQUIRED' });
    expect(await failure({ category: 'FOOD', petType: 'CAT', sellingPrice: 1000 })).toEqual({ name: 'REQUIRED' });
    for (const sellingPrice of [undefined, '', '  ', 0, '0', -5, '-5', 1.5, '1.5', '12.5', '12.50', '1.00', 'abc', null, {}, [], true, '250,000', 'e5', '0250']) {
      expect(await failure(valid({ sellingPrice }))).toEqual({ sellingPrice: 'WHOLE_NUMBER' });
    }
    expect(await failure({ name: '', sellingPrice: 'x' })).toMatchObject({ name: 'REQUIRED', sellingPrice: 'WHOLE_NUMBER', category: 'REQUIRED', petType: 'REQUIRED' });
    expect(await models.Product.countDocuments()).toBe(9);
  });

  test('AC-29 accepts a price as 250000 or 250.000, and refuses one above the limit with 422 but not MSG113', async () => {
    for (const sellingPrice of [250000, '250000', '250.000', ' 250.000 ']) {
      expect((await create(valid({ sellingPrice }))).body.data.sellingPrice).toBe(250000);
    }
    expect((await create(valid({ sellingPrice: '1.000.000' }))).body.data.sellingPrice).toBe(1000000);
    expect((await create(valid({ sellingPrice: 100000000 }))).status).toBe(201);
    for (const sellingPrice of [100000001, '100.000.001', '999999999999999', 99999999999999]) {
      const res = await create(valid({ sellingPrice }));
      expect(res.status).toBe(422);
      expect(res.body.error.fields).toEqual({ sellingPrice: 'TOO_LARGE' });
    }
  });

  test('AC-29 rejects an unknown category or pet, over-long text, a code, stock or Hidden state sent by the caller', async () => {
    const fields = async (body) => (await create(body)).body.error;
    expect((await fields(valid({ category: 'TOYS' }))).fields).toEqual({ category: 'INVALID' });
    expect((await fields(valid({ petType: 'BIRD' }))).fields).toEqual({ petType: 'INVALID' });
    expect((await fields(valid({ name: 'x'.repeat(201) }))).fields).toEqual({ name: 'TOO_LONG' });
    expect((await fields(valid({ description: 'x'.repeat(4001) }))).fields).toEqual({ description: 'TOO_LONG' });
    expect((await fields(valid({ name: 'bad\u0007name' }))).fields).toEqual({ name: 'INVALID' });
    for (const extra of [{ code: 'SP-9000' }, { stockOnHand: 10 }, { quantityHeld: 1 }, { visible: true }, { photos: ['x'] }, { version: 3 }]) {
      expect((await create(valid(extra))).status).toBe(422);
    }
    expect((await create(valid({ name: 'x'.repeat(200), description: `${'y'.repeat(3990)}\nline` }))).status).toBe(201);
    expect(await models.Product.countDocuments()).toBe(10);
  });

  test('AC-29 a failed save leaves no gap in the codes', async () => {
    await create(valid({ sellingPrice: 0 }));
    await create(valid({ name: '' }));
    expect((await create()).body.data.code).toBe('SP-0038');
  });

  test('AC-29 stops with 409 when SP-9999 is used, and saves nothing', async () => {
    await models.ProductCounter.create({ _id: 'PRODUCT_CODE', value: 9999 });
    const res = await create();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_CODES_EXHAUSTED');
    expect(await models.Product.countDocuments()).toBe(9);
  });
});

describe('edit (UC-57, AC-29)', () => {
  const edit = (product, body) => admin.patch(`${ADMIN_PRODUCTS}/${product.id}`).send(body);
  const first = async (code = 'SP-0012') => (await admin.get(ADMIN_PRODUCTS).query({ search: code }).expect(200)).body.data.items[0];

  test('AC-29 changes only what was sent, keeps the code, raises the version and never touches the stock', async () => {
    const product = await first();
    const before = await byCode('SP-0012');
    const res = await edit(product, { version: product.version, name: '  Thức ăn hạt mới  ', sellingPrice: '260.000', description: 'Mô tả mới' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ code: 'SP-0012', name: 'Thức ăn hạt mới', sellingPrice: 260000, description: 'Mô tả mới',
      category: 'FOOD', petType: 'DOG', visible: true, version: product.version + 1 });
    const after = await byCode('SP-0012');
    expect([after.stockOnHand, after.quantityHeld]).toEqual([before.stockOnHand, before.quantityHeld]);
    expect((await edit(res.body.data, { version: res.body.data.version, category: 'ACCESSORY', petType: 'CAT' })).body.data)
      .toMatchObject({ category: 'ACCESSORY', petType: 'CAT', name: 'Thức ăn hạt mới' });
  });

  test('AC-29 applies the same checks as saving a new product', async () => {
    const product = await first();
    const failure = async (body) => (await edit(product, { version: product.version, ...body })).body.error.fields;
    expect(await failure({ name: '  ' })).toEqual({ name: 'REQUIRED' });
    expect(await failure({ sellingPrice: 0 })).toEqual({ sellingPrice: 'WHOLE_NUMBER' });
    expect(await failure({ sellingPrice: 100000001 })).toEqual({ sellingPrice: 'TOO_LARGE' });
    expect(await failure({ category: 'TOYS' })).toEqual({ category: 'INVALID' });
    for (const bad of [{ code: 'SP-0001' }, { stockOnHand: 5 }, { quantityHeld: 0 }, { photos: [] }, { visible: 'yes' }, {}, { version: 'x' }]) {
      expect((await edit(product, { version: product.version, ...bad })).status).toBe(422);
    }
    expect((await edit(product, { name: 'No version' })).status).toBe(422);
    expect(await byCode('SP-0012')).toMatchObject({ name: 'Thức ăn hạt cho chó trưởng thành, túi 2 kg', sellingPrice: 250000, version: 0 });
  });

  test('AC-12 hiding takes a product off the public Products page and showing puts it back', async () => {
    const product = await first('SP-0012');
    expect(await publicCodes()).toContain('SP-0012');
    const hidden = (await edit(product, { version: product.version, visible: false })).body.data;
    expect(hidden.visible).toBe(false);
    expect(await publicCodes()).not.toContain('SP-0012');
    await api().get(`/api/v1/products/${product.id}`).expect(404);
    const shown = (await edit(hidden, { version: hidden.version, visible: true })).body.data;
    expect(await publicCodes()).toContain('SP-0012');
    expect(shown.version).toBe(product.version + 2);
    // The Admin list still shows a hidden product.
    expect((await first('SP-0036')).visible).toBe(false);
  });

  test('AC-29 a new product, once shown, appears on the public Products page', async () => {
    const created = (await create(valid({ name: 'Synthetic public toy' }))).body.data;
    await edit(created, { version: created.version, visible: true }).expect(200);
    expect(await publicCodes('?search=public')).toEqual([created.code]);
  });

  test('AC-10 a new price applies to orders placed afterwards, never to orders already placed', async () => {
    const product = await first('SP-0020');
    const before = await placePickup('SP-0020', 1);
    await edit(product, { version: product.version, sellingPrice: 50000 }).expect(200);
    const mine = await api('customer').get(`/api/v1/product-orders/${before.id}`).expect(200);
    expect(mine.body.data.lines[0].unitPrice).toBe(45000);
    expect(mine.body.data.total).toBe(45000);
    const after = await placePickup('SP-0020', 1);
    expect(after.lines[0].unitPrice).toBe(50000);
  });

  test('AC-29 hiding a product leaves orders already placed as they are', async () => {
    const product = await first('SP-0020');
    const order = await placePickup('SP-0020', 2);
    await edit(product, { version: product.version, visible: false }).expect(200);
    const mine = await api('customer').get(`/api/v1/product-orders/${order.id}`).expect(200);
    expect(mine.body.data).toMatchObject({ status: 'PLACED', total: 90000 });
    expect(await byCode('SP-0020')).toMatchObject({ stockOnHand: 32, quantityHeld: 2 });
  });

  test('AC-29 two Admins saving the same product: one is saved, the other is refused with 409 and changes nothing', async () => {
    const product = await first();
    const results = await Promise.all([edit(product, { version: product.version, name: 'Synthetic one' }),
      edit(product, { version: product.version, name: 'Synthetic two' })]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(results.find((res) => res.status === 409).body.error.code).toBe('VERSION_CONFLICT');
    const saved = results.find((res) => res.status === 200).body.data;
    expect((await byCode('SP-0012')).name).toBe(saved.name);
    const stale = await edit(product, { version: product.version, name: 'Synthetic late' });
    expect(stale.status).toBe(409);
    expect((await byCode('SP-0012')).name).toBe(saved.name);
  });
});
