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
const SUPPLIERS = '/api/v1/admin/suppliers';
// Synthetic keys only; the supplier routes share a runtime with the order routes, which need them.
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
const valid = (over = {}) => ({ name: 'Synthetic Pet Food Co', contactName: 'Synthetic Contact', phone: '0936452118', email: 'synthetic@example.test', ...over });
const create = (body = valid()) => admin.post(SUPPLIERS).send(body);
const made = async (over) => (await create(valid(over)).expect(201)).body.data;
const productId = async (code) => String((await models.Product.findOne({ code }).lean())._id);
const stop = (id, version) => admin.post(`${SUPPLIERS}/${id}/stop`).send({ version });
const resume = (id, version) => admin.post(`${SUPPLIERS}/${id}/resume`).send({ version });
const fieldsOf = (res) => res.body.error.fields;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_supplier_management' }).asPromise();
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
  test('AC-34 a guest gets 401 and a Customer, Staff or Pet Sitter gets 403 on every supplier call', async () => {
    const { id } = await made();
    const calls = [['get', SUPPLIERS], ['get', `${SUPPLIERS}/${id}`], ['post', SUPPLIERS], ['patch', `${SUPPLIERS}/${id}`],
      ['post', `${SUPPLIERS}/${id}/stop`], ['post', `${SUPPLIERS}/${id}/resume`]];
    for (const [method, path] of calls) {
      const call = (who) => (method === 'get' ? api(who).get(path) : api(who)[method](path).send({}));
      expect((await call()).status).toBe(401);
      for (const who of ['customer', 'staff', 'sitter']) expect((await call(who)).status).toBe(403);
    }
    expect(await models.Supplier.countDocuments()).toBe(1);
  });

  test('AC-34 only Admin may use it, and a write needs the CSRF token', async () => {
    await admin.get(SUPPLIERS).expect(200);
    await request(base).post(SUPPLIERS).set('x-test-actor', 'admin').set('Origin', base).send(valid()).expect(403);
    expect(await models.Supplier.countDocuments()).toBe(0);
  });

  test('AC-34 an unknown supplier is 404, a malformed id is 422, and there is no way to delete a supplier', async () => {
    await admin.get(`${SUPPLIERS}/${oid()}`).expect(404);
    await admin.patch(`${SUPPLIERS}/${oid()}`).send({ version: 0, name: 'Synthetic' }).expect(404);
    await stop(oid(), 0).expect(404);
    await resume(oid(), 0).expect(404);
    await admin.get(`${SUPPLIERS}/not-an-id`).expect(422);
    const { id } = await made();
    expect((await admin.delete(`${SUPPLIERS}/${id}`)).status).toBe(404);
    expect(await models.Supplier.countDocuments()).toBe(1);
  });
});

describe('list (UC-69)', () => {
  test('lists suppliers by name per tab with the size of every tab, and no products, only how many', async () => {
    const a = await made({ name: 'Synthetic Bravo', phone: '0911000001', productIds: [await productId('SP-0012'), await productId('SP-0014')] });
    const c = await made({ name: 'Synthetic Charlie', phone: '0911000003' });
    await made({ name: 'Synthetic Alpha', phone: '0911000002' });
    await stop(c.id, c.version).expect(200);
    const all = (await admin.get(SUPPLIERS).expect(200)).body.data;
    expect(all.items.map((item) => item.name)).toEqual(['Synthetic Alpha', 'Synthetic Bravo', 'Synthetic Charlie']);
    expect(all.counts).toEqual({ ACTIVE: 2, STOPPED: 1, ALL: 3 });
    expect([all.total, all.page, all.limit]).toEqual([3, 1, 20]);
    const bravo = all.items.find((item) => item.id === a.id);
    expect(bravo).toMatchObject({ contactName: 'Synthetic Contact', phone: '0911000001', email: 'synthetic@example.test', status: 'ACTIVE', productCount: 2, version: 0 });
    expect(bravo).not.toHaveProperty('products');
    const active = (await admin.get(`${SUPPLIERS}?status=ACTIVE`)).body.data;
    expect(active.items.map((item) => item.name)).toEqual(['Synthetic Alpha', 'Synthetic Bravo']);
    expect([active.total, active.counts.ALL]).toEqual([2, 3]);
    const stopped = (await admin.get(`${SUPPLIERS}?status=STOPPED`)).body.data;
    expect(stopped.items.map((item) => item.name)).toEqual(['Synthetic Charlie']);
    expect(stopped.items[0].status).toBe('STOPPED');
  });

  test('lists in Vietnamese letter order: D, then Đ, then E; u before ư; and across pages', async () => {
    for (const name of ['Synthetic Zeta', 'Synthetic Eden', 'Synthetic Đông', 'Synthetic Dương', 'Synthetic Dung', 'Synthetic Đức', 'Synthetic Dũng', 'Synthetic Ân', 'Synthetic An']) {
      await made({ name });
    }
    const names = (await admin.get(SUPPLIERS).expect(200)).body.data.items.map((item) => item.name.replace('Synthetic ', ''));
    expect(names).toEqual(['An', 'Ân', 'Dung', 'Dũng', 'Dương', 'Đông', 'Đức', 'Eden', 'Zeta']);
    const second = (await admin.get(SUPPLIERS).query({ limit: 4, page: 2 }).expect(200)).body.data;
    expect(second.items.map((item) => item.name.replace('Synthetic ', ''))).toEqual(['Dương', 'Đông', 'Đức', 'Eden']);
  });

  test('an empty list still has its counts, and pages with a total, a page past the end being empty', async () => {
    expect((await admin.get(SUPPLIERS).expect(200)).body.data).toMatchObject({ items: [], total: 0, counts: { ACTIVE: 0, STOPPED: 0, ALL: 0 } });
    for (const letter of ['A', 'B', 'C', 'D', 'E']) await made({ name: `Synthetic ${letter}` });
    const page = async (query) => (await admin.get(SUPPLIERS).query(query).expect(200)).body.data;
    const first = await page({ limit: 2 });
    const second = await page({ limit: 2, page: 2 });
    const third = await page({ limit: 2, page: 3 });
    expect([first, second, third].map((p) => p.items.map((item) => item.name))).toEqual([
      ['Synthetic A', 'Synthetic B'], ['Synthetic C', 'Synthetic D'], ['Synthetic E']]);
    expect([first.total, second.total, third.total]).toEqual([5, 5, 5]);
    expect(await page({ limit: 2, page: 4 })).toMatchObject({ items: [], total: 5, page: 4 });
  });

  test('rejects a bad tab, page, limit or key', async () => {
    for (const query of [{ status: 'OLD' }, { status: 'active' }, { page: 0 }, { page: 'x' }, { limit: 0 }, { limit: 51 }, { search: 'a' }]) {
      expect((await admin.get(SUPPLIERS).query(query)).status).toBe(422);
    }
  });

  test('reads one supplier with its products by code and name, hidden ones too, in the order they were put', async () => {
    const hiddenId = await productId('SP-0036');
    const shownId = await productId('SP-0012');
    const { id } = await made({ productIds: [hiddenId, shownId] });
    const read = (await admin.get(`${SUPPLIERS}/${id}`).expect(200)).body.data;
    expect(read.productCount).toBe(2);
    expect(read.products.map((product) => product.code)).toEqual(['SP-0036', 'SP-0012']);
    expect(read.products[0]).toEqual({ id: hiddenId, code: 'SP-0036', name: expect.any(String), visible: false });
    expect(read.products[1].visible).toBe(true);
  });
});

describe('create (AC-30)', () => {
  test('AC-30 saves a supplier as Đang hợp tác with the phone as ten digits and the products chosen, hidden ones included', async () => {
    const res = await create(valid({ phone: ' 0936 452 118 ', name: '  Synthetic   Pet  Food Co ', productIds: [await productId('SP-0036')] })).expect(201);
    expect(res.body.data).toMatchObject({ name: 'Synthetic Pet Food Co', phone: '0936452118', status: 'ACTIVE', version: 0, productCount: 1,
      products: [{ code: 'SP-0036', visible: false }] });
    const stored = await models.Supplier.findById(res.body.data.id).lean();
    expect(stored).toMatchObject({ name: 'Synthetic Pet Food Co', phone: '0936452118', status: 'ACTIVE' });
    expect(stored.nameKey).toBe('synthetic pet food co');
  });

  test('AC-30 MSG01: a name that is missing, blank or not text is REQUIRED or INVALID', async () => {
    expect(fieldsOf(await create(valid({ name: undefined })).expect(422))).toEqual({ name: 'REQUIRED' });
    expect(fieldsOf(await create(valid({ name: '   ' })).expect(422))).toEqual({ name: 'REQUIRED' });
    expect(fieldsOf(await create(valid({ name: 5 })).expect(422))).toEqual({ name: 'INVALID' });
    expect(await models.Supplier.countDocuments()).toBe(0);
  });

  test('AC-30 MSG125: a phone number or an email is needed, and either one alone is enough', async () => {
    const res = await create(valid({ phone: '', email: '' })).expect(422);
    expect(fieldsOf(res)).toEqual({ phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' });
    expect(fieldsOf(await create(valid({ phone: undefined, email: undefined })).expect(422))).toEqual({ phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' });
    expect(fieldsOf(await create(valid({ phone: '  ', email: ' ', contactName: undefined })).expect(422)).phone).toBe('CONTACT_REQUIRED');
    await create(valid({ name: 'Synthetic Only Phone', email: '' })).expect(201);
    await create(valid({ name: 'Synthetic Only Email', phone: '' })).expect(201);
    expect(await models.Supplier.countDocuments()).toBe(2);
  });

  test('AC-30 MSG03: a phone is ten digits starting with 0, with spaces, dots and hyphens dropped; +84 forms and landlines are not', async () => {
    for (const phone of ['0936 452 118', '0936.452.118', '0936-452-118', '0936452118', '0243825123']) {
      const res = await create(valid({ name: `Synthetic ${phone}`, phone })).expect(201);
      expect(res.body.data.phone).toBe(phone.replace(/[\s.-]/g, ''));
    }
    for (const phone of ['+84936452118', '84936452118', '936452118', '09364521180', '024 3825 1234', '02438251234', '0936 452 11a', 'abc', '(0936) 452 118', 5, {}]) {
      expect(fieldsOf(await create(valid({ name: 'Synthetic Bad Phone', phone })).expect(422))).toEqual({ phone: 'INVALID' });
    }
  });

  test('AC-30 MSG02: an email that is not valid is INVALID; a bad phone or email is not reported as missing contact', async () => {
    for (const email of ['not-an-email', 'a@b', '@example.test', 'a b@example.test', `${'x'.repeat(250)}@example.test`, 7]) {
      expect(fieldsOf(await create(valid({ name: 'Synthetic Bad Email', email })).expect(422))).toEqual({ email: 'INVALID' });
    }
    expect(fieldsOf(await create(valid({ phone: '', email: 'nope' })).expect(422))).toEqual({ email: 'INVALID' });
    expect(fieldsOf(await create(valid({ email: '', phone: 'nope' })).expect(422))).toEqual({ phone: 'INVALID' });
  });

  test('every wrong field is reported in one answer', async () => {
    const res = await create({ name: '', contactName: 'x'.repeat(101), phone: 'bad', email: 'bad', productIds: 'x' }).expect(422);
    expect(fieldsOf(res)).toEqual({ name: 'REQUIRED', contactName: 'TOO_LONG', phone: 'INVALID', email: 'INVALID', productIds: 'INVALID' });
    expect(fieldsOf(await create({ name: 'x'.repeat(201), phone: '0911000009' }).expect(422))).toEqual({ name: 'TOO_LONG' });
  });

  test('AC-30 MSG116: a name already used is refused, also when the other supplier stopped, ignoring case, spaces and the tone mark in oa, oe, uy', async () => {
    const first = await made({ name: 'Công ty Hoà Bình' });
    for (const name of ['Công ty Hoà Bình', 'CÔNG TY HOÀ BÌNH', 'công ty  hòa bình', '  Công ty Hòa Bình  ']) {
      const res = await create(valid({ name })).expect(409);
      expect(res.body.error.code).toBe('SUPPLIER_NAME_TAKEN');
    }
    await stop(first.id, first.version).expect(200);
    expect((await create(valid({ name: 'Công ty Hòa Bình' })).expect(409)).body.error.code).toBe('SUPPLIER_NAME_TAKEN');
    expect(await models.Supplier.countDocuments()).toBe(1);
  });

  test('AC-30 MSG116: the tone mark rule covers hoè = hòe and thuỷ = thủy, but names that differ by a letter or a diacritic stay different', async () => {
    await made({ name: 'Thuỷ Sản Việt' });
    expect((await create(valid({ name: 'Thủy Sản Việt' })).expect(409)).body.error.code).toBe('SUPPLIER_NAME_TAKEN');
    await made({ name: 'Hoè Nhai' });
    expect((await create(valid({ name: 'Hòe Nhai' })).expect(409)).body.error.code).toBe('SUPPLIER_NAME_TAKEN');
    await made({ name: 'Mai Anh' });
    await made({ name: 'Mãi Anh' });
    await made({ name: 'Hoa Binh' });
    await made({ name: 'Hòa Binh' });
    expect(await models.Supplier.countDocuments()).toBe(6);
  });

  test('two Admins saving the same name at once: one saves, the other gets MSG116', async () => {
    const results = await Promise.all([create(valid({ name: 'Synthetic Race' })), create(valid({ name: 'synthetic  race' }))]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await models.Supplier.countDocuments()).toBe(1);
  });

  test('refuses a status, a version, a name key or any other key, and a body that is not an object', async () => {
    for (const extra of [{ status: 'STOPPED' }, { version: 3 }, { nameKey: 'x' }, { id: 'x' }, { products: [] }]) {
      expect((await create(valid(extra))).status).toBe(422);
    }
    for (const bad of [[], 'x', null]) expect((await admin.post(SUPPLIERS).send(bad)).status).toBe(422);
    expect(await models.Supplier.countDocuments()).toBe(0);
  });

  test('products: one that is not in the catalog is PRODUCT_NOT_FOUND, repeats are saved once, and more than 200 is refused', async () => {
    const missing = String(oid());
    const res = await create(valid({ productIds: [await productId('SP-0012'), missing] })).expect(422);
    expect(res.body.error).toMatchObject({ code: 'PRODUCT_NOT_FOUND', productIds: [missing] });
    expect(fieldsOf(await create(valid({ productIds: ['nope'] })).expect(422))).toEqual({ productIds: 'INVALID' });
    expect(fieldsOf(await create(valid({ productIds: Array.from({ length: 201 }, () => String(oid())) })).expect(422))).toEqual({ productIds: 'TOO_MANY' });
    const id = await productId('SP-0012');
    const saved = await create(valid({ productIds: [id, id] })).expect(201);
    expect(saved.body.data.productCount).toBe(1);
    expect(await models.Supplier.countDocuments()).toBe(1);
  });
});

describe('edit (AC-30)', () => {
  test('AC-30 changes only the fields sent, moves the version on and leaves the status and the other fields alone', async () => {
    const supplier = await made({ productIds: [await productId('SP-0012')] });
    const res = await admin.patch(`${SUPPLIERS}/${supplier.id}`).send({ version: 0, contactName: 'Synthetic New Contact', phone: '0912 345 678' }).expect(200);
    expect(res.body.data).toMatchObject({ name: 'Synthetic Pet Food Co', contactName: 'Synthetic New Contact', phone: '0912345678',
      email: 'synthetic@example.test', status: 'ACTIVE', version: 1, productCount: 1 });
    expect(res.body.data.products.map((product) => product.code)).toEqual(['SP-0012']);
  });

  test('AC-30 a rename may only change the case or the tone mark of its own name, but not take another supplier name', async () => {
    const own = await made({ name: 'Công ty Hoà Bình' });
    const other = await made({ name: 'Synthetic Other', phone: '0911000002' });
    const renamed = await admin.patch(`${SUPPLIERS}/${own.id}`).send({ version: 0, name: 'CÔNG TY HÒA BÌNH' }).expect(200);
    expect(renamed.body.data).toMatchObject({ name: 'CÔNG TY HÒA BÌNH', version: 1 });
    const taken = await admin.patch(`${SUPPLIERS}/${other.id}`).send({ version: 0, name: 'công ty hoà  bình' }).expect(409);
    expect(taken.body.error.code).toBe('SUPPLIER_NAME_TAKEN');
    expect((await models.Supplier.findById(other.id).lean()).version).toBe(0);
  });

  test('AC-30 MSG01, MSG03 and MSG02 on an edit; nothing is saved when a field is wrong', async () => {
    const { id } = await made();
    const patch = (body) => admin.patch(`${SUPPLIERS}/${id}`).send({ version: 0, ...body });
    expect(fieldsOf(await patch({ name: '  ' }).expect(422))).toEqual({ name: 'REQUIRED' });
    expect(fieldsOf(await patch({ phone: '+84936452118' }).expect(422))).toEqual({ phone: 'INVALID' });
    expect(fieldsOf(await patch({ email: 'nope' }).expect(422))).toEqual({ email: 'INVALID' });
    expect(fieldsOf(await patch({ name: '', phone: 'x', email: 'y' }).expect(422))).toEqual({ name: 'REQUIRED', phone: 'INVALID', email: 'INVALID' });
    expect((await models.Supplier.findById(id).lean()).version).toBe(0);
  });

  test('AC-30 MSG125: an edit may clear the phone or the email but not both, judged against what is saved', async () => {
    const both = await made({ name: 'Synthetic Both' });
    await admin.patch(`${SUPPLIERS}/${both.id}`).send({ version: 0, phone: '' }).expect(200);
    const res = await admin.patch(`${SUPPLIERS}/${both.id}`).send({ version: 1, email: '' }).expect(422);
    expect(fieldsOf(res)).toEqual({ phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' });
    await admin.patch(`${SUPPLIERS}/${both.id}`).send({ version: 1, phone: '0911000009', email: '' }).expect(200);
    const phoneOnly = await made({ name: 'Synthetic Phone Only', email: '' });
    expect(fieldsOf(await admin.patch(`${SUPPLIERS}/${phoneOnly.id}`).send({ version: 0, phone: '' }).expect(422)).phone).toBe('CONTACT_REQUIRED');
    expect((await models.Supplier.findById(phoneOnly.id).lean()).phone).toBe('0936452118');
  });

  test('products can be added and removed, a hidden one included, and an unknown one is refused', async () => {
    const { id } = await made({ productIds: [await productId('SP-0012')] });
    const added = await admin.patch(`${SUPPLIERS}/${id}`).send({ version: 0, productIds: [await productId('SP-0012'), await productId('SP-0036'), await productId('SP-0014')] }).expect(200);
    expect(added.body.data.products.map((product) => product.code)).toEqual(['SP-0012', 'SP-0036', 'SP-0014']);
    const removed = await admin.patch(`${SUPPLIERS}/${id}`).send({ version: 1, productIds: [await productId('SP-0014')] }).expect(200);
    expect(removed.body.data.products.map((product) => product.code)).toEqual(['SP-0014']);
    expect((await admin.patch(`${SUPPLIERS}/${id}`).send({ version: 2, productIds: [String(oid())] }).expect(422)).body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect((await admin.patch(`${SUPPLIERS}/${id}`).send({ version: 2, productIds: [] }).expect(200)).body.data.productCount).toBe(0);
  });

  test('the products of a supplier are a record only: they leave the catalog and the stock of the products alone', async () => {
    const before = await models.Product.find().sort({ code: 1 }).lean();
    const { id } = await made({ productIds: [await productId('SP-0012'), await productId('SP-0036')] });
    await admin.patch(`${SUPPLIERS}/${id}`).send({ version: 0, productIds: [await productId('SP-0014')] }).expect(200);
    expect(await models.Product.find().sort({ code: 1 }).lean()).toEqual(before);
  });

  test('refuses nothing to change, a missing or bad version, an unknown key, and a status', async () => {
    const { id } = await made();
    for (const body of [{ version: 0 }, { name: 'Synthetic New' }, { version: -1, name: 'x' }, { version: '0', name: 'x' }, { version: 1.5, name: 'x' },
      { version: 0, status: 'STOPPED' }, { version: 0, nameKey: 'x' }, { version: 0, code: 'x' }]) {
      expect((await admin.patch(`${SUPPLIERS}/${id}`).send(body)).status).toBe(422);
    }
    expect((await models.Supplier.findById(id).lean()).version).toBe(0);
  });

  test('a supplier that stopped can still be edited, and stays stopped', async () => {
    const { id, version } = await made();
    await stop(id, version).expect(200);
    const res = await admin.patch(`${SUPPLIERS}/${id}`).send({ version: 1, contactName: 'Synthetic Later' }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'STOPPED', contactName: 'Synthetic Later', version: 2 });
  });

  test('two Admins saving the same version: one is saved and the other gets VERSION_CONFLICT, so nothing is overwritten', async () => {
    const { id } = await made();
    const results = await Promise.all([
      admin.patch(`${SUPPLIERS}/${id}`).send({ version: 0, contactName: 'Synthetic Admin One' }),
      admin.patch(`${SUPPLIERS}/${id}`).send({ version: 0, contactName: 'Synthetic Admin Two' })
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(results.find((res) => res.status === 409).body.error.code).toBe('VERSION_CONFLICT');
    const stored = await models.Supplier.findById(id).lean();
    expect(stored.version).toBe(1);
    const winner = results.find((res) => res.status === 200).body.data.contactName;
    expect(stored.contactName).toBe(winner);
    expect((await admin.patch(`${SUPPLIERS}/${id}`).send({ version: 0, contactName: 'Synthetic Stale' }).expect(409)).body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('stop and resume working with a supplier (AC-30)', () => {
  test('AC-30 stopping keeps the supplier, its name and its products, moves it to the other tab and moves the version on', async () => {
    const supplier = await made({ productIds: [await productId('SP-0012')] });
    const res = await stop(supplier.id, 0).expect(200);
    expect(res.body.data).toMatchObject({ status: 'STOPPED', version: 1, productCount: 1, name: supplier.name });
    const list = (await admin.get(SUPPLIERS)).body.data;
    expect(list.counts).toEqual({ ACTIVE: 0, STOPPED: 1, ALL: 1 });
    expect((await admin.get(`${SUPPLIERS}?status=ACTIVE`)).body.data.items).toEqual([]);
    expect((await admin.get(`${SUPPLIERS}?status=STOPPED`)).body.data.items[0].id).toBe(supplier.id);
    // The name stays taken after stopping.
    expect((await create(valid({ name: supplier.name })).expect(409)).body.error.code).toBe('SUPPLIER_NAME_TAKEN');
  });

  test('AC-30 Hợp tác lại puts a stopped supplier back to Đang hợp tác, and a second Admin repeating a step gets a conflict', async () => {
    const { id } = await made();
    await stop(id, 0).expect(200);
    const again = await stop(id, 1).expect(409);
    expect(again.body.error).toMatchObject({ code: 'SUPPLIER_STATE_CONFLICT', status: 'STOPPED' });
    const back = await resume(id, 1).expect(200);
    expect(back.body.data).toMatchObject({ status: 'ACTIVE', version: 2 });
    expect((await resume(id, 2).expect(409)).body.error).toMatchObject({ code: 'SUPPLIER_STATE_CONFLICT', status: 'ACTIVE' });
    expect((await admin.get(SUPPLIERS)).body.data.counts).toEqual({ ACTIVE: 1, STOPPED: 0, ALL: 1 });
  });

  test('a stale version is VERSION_CONFLICT, a bad body is 422, and nothing changes', async () => {
    const { id } = await made();
    await admin.patch(`${SUPPLIERS}/${id}`).send({ version: 0, contactName: 'Synthetic Changed' }).expect(200);
    expect((await stop(id, 0).expect(409)).body.error.code).toBe('VERSION_CONFLICT');
    for (const body of [{}, { version: 'x' }, { version: -1 }, { version: 1, status: 'STOPPED' }, { version: 1, name: 'x' }]) {
      expect((await admin.post(`${SUPPLIERS}/${id}/stop`).send(body)).status).toBe(422);
      expect((await admin.post(`${SUPPLIERS}/${id}/resume`).send(body)).status).toBe(422);
    }
    expect(await models.Supplier.findById(id).lean()).toMatchObject({ status: 'ACTIVE', version: 1 });
  });

  test('two Admins stopping the same supplier at once: one stops it and the other gets a conflict', async () => {
    const { id } = await made();
    const results = await Promise.all([stop(id, 0), stop(id, 0)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await models.Supplier.findById(id).lean()).toMatchObject({ status: 'STOPPED', version: 1 });
  });
});
