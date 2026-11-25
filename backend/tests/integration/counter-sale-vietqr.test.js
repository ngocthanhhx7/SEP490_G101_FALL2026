import { beforeAll, afterAll, beforeEach, describe, test, expect, jest } from '@jest/globals';
import { createServer } from 'node:http';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { userModel } from '../../src/models/user.model.js';
import { createPayosPaymentWebhookService } from '../../src/services/providers/payos/payment-webhook.service.js';
import { createMongoPaymentWebhookRepository } from '../../src/services/providers/payos/mongo-payment-webhook.repository.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { COUNTER_VIETQR_LINK_TTL_MS } from '../../src/constants/counter-sale-fields.js';
import { AppError } from '../../src/utils/app-error.js';
import { registerModules } from '../../src/routes/module-registry.js';
import { requestId, notFound, errorHandler } from '../../src/middlewares/http.js';

// UC-68 / GBR-38 / GBR-18 / ST-CTR-02 / ST-CTR-04: Counter Sale VietQR through payOS, plus regression for online PREPAID.
const ROOT = '/api/v1/admin/counter-orders';
const ONLINE = '/api/v1/product-orders';
const MANAGE = '/api/v1/admin/product-orders';
const oid = () => new mongoose.Types.ObjectId();
const actors = Object.fromEntries(['ADMIN', 'SALE_STAFF', 'CUSTOMER', 'STAFF', 'PET_SITTER'].map(role =>
  [role, { userId: String(oid()), roles: [role], state: 'ACTIVE' }]));
const keys = { contactLookupSecret: 'synthetic-counter-vietqr-lookup-000', contactEncryptionKey: 'v'.repeat(32) };
const START = Date.parse('2026-11-25T03:00:00Z');
let replica, connection, models, User, server, base, now, failCreate, failLookup, sequence = 0;
let customerAddress;
const links = new Map();
const key = () => `synthetic-cvq-${++sequence}`;

const provider = {
  createPaymentLink: jest.fn(async (input) => {
    if (failCreate) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Payment provider is unavailable');
    links.set(input.orderCode, { status: 'PENDING', amount: input.amount, amountPaid: 0 });
    return {
      orderCode: input.orderCode,
      amount: input.amount,
      currency: 'VND',
      providerStatus: 'PENDING',
      paymentLinkId: `link-${input.orderCode}`,
      checkoutUrl: `https://pay.payos.vn/web/${input.orderCode}`,
      qrCode: `000201010212${input.orderCode}`
    };
  }),
  getPaymentLink: jest.fn(async (orderCode) => {
    if (failLookup) throw new AppError(503, 'PAYOS_REQUEST_FAILED', 'Payment provider request failed');
    const link = links.get(orderCode);
    if (!link) throw new AppError(503, 'PAYOS_REQUEST_FAILED', 'Payment provider request failed');
    return {
      orderCode,
      amount: link.amount,
      amountPaid: link.amountPaid,
      amountRemaining: link.amount - link.amountPaid,
      providerStatus: link.status
    };
  }),
  verifyWebhook: (body) => body.data
};

const webhook = () => createPayosPaymentWebhookService({
  provider,
  clock: () => new Date(now),
  repository: createMongoPaymentWebhookRepository({ connection })
});

const call = (method, path, role = 'SALE_STAFF', csrf = true) => {
  const req = request(base)[method](path);
  if (role) req.set('x-test-role', role);
  if (method !== 'get') {
    req.set('Origin', base);
    if (csrf) req.set('X-CSRF-Token', 'synthetic-csrf');
  }
  return req;
};

const product = (code = 'SP-0001', more = {}) => models.Product.create({
  code, name: `Synthetic ${code}`, category: 'FOOD', petType: 'DOG',
  sellingPrice: 125000, stockOnHand: 10, quantityHeld: 0, visible: true, version: 0, detailsVersion: 1, ...more
});

const createCounterOrder = async (p, quantity = 2, role = 'SALE_STAFF') => (
  await call('post', ROOT, role).set('Idempotency-Key', key()).send({ lines: [{ productId: p.id, quantity }] }).expect(201)
).body.data;

const placeOnlinePrepaid = async (p, quantity = 1) => {
  await call('post', '/api/v1/product-cart/lines', 'CUSTOMER').send({ productId: p.id, quantity }).expect(201);
  return (await call('post', ONLINE, 'CUSTOMER').set('Idempotency-Key', key())
    .send({ receiveMethod: 'DELIVERY', paymentMethod: 'PREPAID', addressId: String(customerAddress._id) }).expect(201)).body.data;
};

const placePickupAtShop = async (p, quantity = 1) => {
  await call('post', '/api/v1/product-cart/lines', 'CUSTOMER').send({ productId: p.id, quantity }).expect(201);
  return (await call('post', ONLINE, 'CUSTOMER').set('Idempotency-Key', key())
    .send({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }).expect(201)).body.data;
};
const orderDoc = (id) => models.ProductOrder.findById(id).lean();
const lastRef = async (id) => (await orderDoc(id)).payment.providerReferences.at(-1);
const payOf = async (order, patch = {}) => {
  const ref = await lastRef(order.id);
  return {
    orderCode: Number(ref),
    amount: order.total,
    currency: 'VND',
    code: '00',
    reference: `BANK-${ref}`,
    paymentLinkId: `link-${ref}`,
    transactionDateTime: '2026-11-25T03:02:00Z',
    ...patch
  };
};
const receive = async (order, patch) => webhook().handleWebhook({ data: await payOf(order, patch) });

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_counter_vietqr' }).asPromise();
  models = productSalesModels(connection);
  User = userModel(connection);
  const { CustomerAddress } = petCareModels(connection);
  await CustomerAddress.createCollection();
  await CustomerAddress.createIndexes();
  customerAddress = await CustomerAddress.create({
    ownerId: actors.CUSTOMER.userId, label: 'Synthetic home', location: 'Synthetic address',
    point: { type: 'Point', coordinates: [105.85, 21.02] }, pointConfirmedAt: new Date(),
    areaCode: 'DISTRICT_THANH_XUAN', version: 0
  });
  await models.ProductOrder.createIndexes();
  await provisionFinanceSources(connection);
  const session = {
    authenticate: async req => actors[req.get('x-test-role')]
      ? { ...actors[req.get('x-test-role')], expiresAt: now + 60000 } : null,
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf'
  };
  const app = express();
  app.use(express.json(), requestId);
  registerModules(app, productSalesRuntimeModules({
    connection,
    sessionService: session,
    clock: () => now,
    provider,
    env: { PRODUCT_SALES_ENABLED: 'true', BOOKING_WEB_ORIGIN: 'http://localhost:5187' },
    config: { auth: { enabled: true, ...keys }, paymentDeadlineHours: 1 }
  }));
  app.use(notFound, errorHandler(() => {}));
  server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}, 600000);

afterAll(async () => {
  await new Promise(resolve => (server ? server.close(resolve) : resolve()));
  await connection?.close();
  await replica?.stop();
}, 30000);

beforeEach(async () => {
  now = START;
  failCreate = false;
  failLookup = false;
  links.clear();
  provider.createPaymentLink.mockClear();
  provider.getPaymentLink.mockClear();
  for (const model of Object.values(models)) await model.deleteMany({});
  for (const name of ['payments', 'financesourcecommands', 'financesourceevents', 'notifications']) {
    await connection.db.collection(name).deleteMany({});
  }
  await User.deleteMany({});
  await User.create(Object.entries(actors).map(([role, actor]) => ({
    _id: actor.userId, displayName: `Synthetic ${role}`, roles: actor.roles, state: 'ACTIVE'
  })));
});

describe('UC-68 counter VietQR payment link creation', () => {
  test('enforces Sale Staff/Admin role, CSRF, empty body, and AWAITING_PAYMENT state', async () => {
    const p = await product();
    const order = await createCounterOrder(p);
    for (const role of ['', 'CUSTOMER', 'STAFF', 'PET_SITTER']) {
      await call('post', `${ROOT}/${order.id}/payment-link`, role).send({}).expect(role ? 403 : 401);
    }
    expect((await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF', false).send({})).body.error.code).toBe('CSRF_REJECTED');
    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({ total: 1 }).expect(422);

    const created = await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    const ref = await lastRef(order.id);
    expect(created.body.data).toMatchObject({
      checkoutUrl: `https://pay.payos.vn/web/${ref}`,
      orderCode: ref,
      expiresAt: new Date(START + COUNTER_VIETQR_LINK_TTL_MS).toISOString()
    });
    expect(provider.createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({
      orderCode: Number(ref),
      amount: order.total,
      expiredAt: Math.floor((START + COUNTER_VIETQR_LINK_TTL_MS) / 1000),
      returnUrl: `http://localhost:5187/admin/counter-sale?order=${order.id}`,
      cancelUrl: `http://localhost:5187/admin/counter-sale?order=${order.id}`
    }));
    // Counter orders never set online paymentDeadlineAt.
    expect((await orderDoc(order.id)).paymentDeadlineAt).toBeUndefined();

    // Admin can also request the link while still PENDING, reusing the active link.
    const reused = await call('post', `${ROOT}/${order.id}/payment-link`, 'ADMIN').send({}).expect(200);
    expect(reused.body.data.checkoutUrl).toBe(`https://pay.payos.vn/web/${ref}`);
    expect(provider.createPaymentLink).toHaveBeenCalledTimes(1);

    // Cancelled or paid orders cannot create a link.
    await call('post', `${ROOT}/${order.id}/cancel`, 'SALE_STAFF').send({}).expect(200);
    expect((await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(409)).body.error.code).toBe('ORDER_STATE_CONFLICT');
  });

  test('MSG33: payOS failure keeps the counter order AWAITING_PAYMENT and allows retrying or taking cash', async () => {
    const p = await product();
    const order = await createCounterOrder(p);
    failCreate = true;
    const failed = await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(503);
    expect(failed.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    expect(await orderDoc(order.id)).toMatchObject({ status: 'AWAITING_PAYMENT', paid: false });
    expect((await orderDoc(order.id)).payment.providerReferences).toEqual([]);

    failCreate = false;
    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    expect((await orderDoc(order.id)).payment.providerReferences).toHaveLength(1);
  });

  test('creates a fresh payOS orderCode after link expiry or cancellation on payOS', async () => {
    const p = await product();
    const order = await createCounterOrder(p);
    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    const first = await lastRef(order.id);
    links.get(Number(first)).status = 'CANCELLED';

    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    const second = await lastRef(order.id);
    expect(second).not.toBe(first);

    // A locally expired link can only be replaced once payOS confirms that it is closed.
    now = START + COUNTER_VIETQR_LINK_TTL_MS + 1000;
    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(409);
    links.get(Number(second)).status = 'EXPIRED';
    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    const third = await lastRef(order.id);
    expect(third).not.toBe(second);
    expect((await orderDoc(order.id)).payment.providerReferences).toEqual([first, second, third]);
  });
});

describe('ST-CTR-02 / GBR-18 counter VietQR webhook and completion', () => {
  test('marks counter order PAID once as COUNTER_VIETQR even when webhook repeats, without online notification', async () => {
    const p = await product();
    const order = await createCounterOrder(p, 2);
    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    const ref = await lastRef(order.id);

    expect(await receive(order)).toEqual({ status: 'PAYMENT_VERIFIED' });
    expect(await receive(order)).toEqual({ status: 'DUPLICATE' });

    const doc = await orderDoc(order.id);
    expect(doc).toMatchObject({ status: 'PAID', paid: true, paymentMethod: 'COUNTER_VIETQR' });
    expect(doc.payment.receipts).toHaveLength(1);
    expect(doc.payment.receipts[0]).toMatchObject({ state: 'VERIFIED', providerOrderCode: ref, amountVnd: order.total });
    expect(doc.cashPayment).toBeUndefined();
    expect(await connection.db.collection('notifications').countDocuments()).toBe(0);

    const view = (await call('get', `${ROOT}/${order.id}`, 'SALE_STAFF').expect(200)).body.data;
    expect(view).toMatchObject({
      status: 'PAID',
      paid: true,
      paymentMethod: 'COUNTER_VIETQR',
      cashPayment: null,
      vietqrPayment: { amount: order.total, providerOrderCode: ref }
    });

    // Stock stays held until Sale Staff clicks Complete sale (GBR-38).
    expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 10, quantityHeld: 2 });
    await call('post', `${ROOT}/${order.id}/cancel`, 'SALE_STAFF').send({}).expect(409);
    const completed = (await call('post', `${ROOT}/${order.id}/complete`, 'SALE_STAFF').send({}).expect(200)).body.data;
    expect(completed).toMatchObject({ status: 'COMPLETED', paid: true, paymentMethod: 'COUNTER_VIETQR' });
    expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 8, quantityHeld: 0 });
  });
});

describe('ST-CTR-04 failed VietQR, switching to cash, settler guard and late reconciliation', () => {
  test('failed webhook marks linkState FAILED, keeps order unpaid, and allows switching to cash', async () => {
    const p = await product();
    const order = await createCounterOrder(p, 1);
    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);

    expect(await receive(order, { code: '01' })).toEqual({ status: 'RECONCILIATION_REQUIRED', reason: 'PROVIDER_PAYMENT_NOT_SUCCESSFUL' });
    expect(await connection.db.collection('notifications').countDocuments({ eventType: 'PaymentReconciliationRequired' })).toBe(0);
    const failedView = (await call('get', `${ROOT}/${order.id}`, 'SALE_STAFF').expect(200)).body.data;
    expect(failedView).toMatchObject({ status: 'AWAITING_PAYMENT', paid: false, paymentLink: { state: 'FAILED' } });

    const cash = (await call('post', `${ROOT}/${order.id}/record-cash`, 'SALE_STAFF').send({}).expect(200)).body.data;
    expect(cash).toMatchObject({ status: 'PAID', paid: true, paymentMethod: 'COUNTER_CASH', cashPayment: { amount: order.total } });
  });

  test('record-cash checks payOS via settler when link is READY and records VietQR once if already paid', async () => {
    const p = await product();
    const order = await createCounterOrder(p, 1);
    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    const ref = Number(await lastRef(order.id));
    Object.assign(links.get(ref), { status: 'PAID', amountPaid: order.total });

    const res = (await call('post', `${ROOT}/${order.id}/record-cash`, 'SALE_STAFF').send({}).expect(200)).body.data;
    expect(res).toMatchObject({ status: 'PAID', paid: true, paymentMethod: 'COUNTER_VIETQR', cashPayment: null, vietqrPayment: { amount: order.total } });
    // Only the same transaction identity counts as a duplicate.
    expect(await receive(order, { reference: `LINK-${ref}` })).toEqual({ status: 'DUPLICATE' });
    expect((await orderDoc(order.id)).payment.receipts).toHaveLength(1);
  });

  test('record-cash waits for payOS when lookup fails, then accepts confirmed unpaid status', async () => {
    const p = await product();
    const order = await createCounterOrder(p, 1);
    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    failLookup = true;
    await call('post', `${ROOT}/${order.id}/record-cash`, 'SALE_STAFF').send({}).expect(503);
    expect(await orderDoc(order.id)).toMatchObject({ status: 'AWAITING_PAYMENT', paid: false });
    failLookup = false;

    const cash = (await call('post', `${ROOT}/${order.id}/record-cash`, 'SALE_STAFF').send({}).expect(200)).body.data;
    expect(cash).toMatchObject({ status: 'PAID', paid: true, paymentMethod: 'COUNTER_CASH', cashPayment: { amount: order.total } });

    expect(await receive(order)).toEqual({ status: 'RECONCILIATION_REQUIRED', reason: 'INTENT_NOT_PENDING' });
    const doc = await orderDoc(order.id);
    expect(doc).toMatchObject({ status: 'PAID', paid: true, paymentMethod: 'COUNTER_CASH' });
    expect(doc.cashPayment).toBeDefined();
    expect(doc.payment.receipts).toMatchObject([{ state: 'RECONCILIATION_REQUIRED', reason: 'INTENT_NOT_PENDING', amountVnd: order.total }]);
    expect(await connection.db.collection('notifications').countDocuments({ eventType: 'PaymentReconciliationRequired' })).toBe(2);
  });

  test.each(['counter', 'pickup'])('%s holds cash and link replacement for a partial provider payment', async kind => {
    const p = await product();
    const order = kind === 'counter' ? await createCounterOrder(p) : await placePickupAtShop(p, 1);
    const path = (kind === 'counter' ? ROOT : MANAGE) + '/' + order.id;
    if (kind === 'pickup') await call('post', path + '/mark-ready').send({}).expect(200);
    await call('post', path + '/payment-link').send({}).expect(200);
    const reference = await lastRef(order.id);
    Object.assign(links.get(Number(reference)), { status: 'PENDING', amountPaid: 1 });
    const cashAction = kind === 'counter' ? '/record-cash' : '/record-payment';
    await call('post', path + cashAction).send({}).expect(409);
    now += COUNTER_VIETQR_LINK_TTL_MS + 1;
    await call('post', path + '/payment-link').send({}).expect(409);
    expect(await orderDoc(order.id)).toMatchObject({ paid: false, payment: { providerReferences: [reference] } });
  });

  test('VietQR arriving after counter order cancellation is recorded for reconciliation without reopening the order', async () => {
    const p = await product();
    const order = await createCounterOrder(p, 2);
    await call('post', `${ROOT}/${order.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    await call('post', `${ROOT}/${order.id}/cancel`, 'SALE_STAFF').send({}).expect(200);

    expect(await receive(order)).toEqual({ status: 'RECONCILIATION_REQUIRED', reason: 'ORDER_NOT_PAYABLE' });
    const doc = await orderDoc(order.id);
    expect(doc).toMatchObject({ status: 'CANCELLED', paid: false });
    expect(doc.payment.receipts).toMatchObject([{ state: 'RECONCILIATION_REQUIRED', reason: 'ORDER_NOT_PAYABLE', amountVnd: order.total }]);
    expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 10, quantityHeld: 0 });
  });
});

describe('regression: online PREPAID order webhook behavior (#445) is unchanged', () => {
  test('online PREPAID order stays PLACED + paid: true, notifies customer, dedupes repeats, and reconciles cancelled orders', async () => {
    const p = await product('SP-0099', { stockOnHand: 10 });
    const online = await placeOnlinePrepaid(p, 1);
    await call('post', `${ONLINE}/${online.id}/payment-link`, 'CUSTOMER').send({}).expect(200);

    expect(await receive(online)).toEqual({ status: 'PAYMENT_VERIFIED' });
    expect(await receive(online)).toEqual({ status: 'DUPLICATE' });

    const doc = await orderDoc(online.id);
    expect(doc).toMatchObject({ channel: 'ONLINE', status: 'PLACED', paid: true, paymentMethod: 'PREPAID' });
    expect(doc.payment.receipts).toHaveLength(1);
    expect(doc.payment.receipts[0]).toMatchObject({ state: 'VERIFIED', amountVnd: online.total });
    const notices = await connection.db.collection('notifications')
      .find({ eventId: { $regex: `^product-order:${online.id}:` } }).toArray();
    expect(notices.some(row => row.message.includes('ghi nhận thanh toán'))).toBe(true);

    // Cancelled online PREPAID order still reconciles without reopening.
    const cancelledOnline = await placeOnlinePrepaid(p, 1);
    await call('post', `${ONLINE}/${cancelledOnline.id}/payment-link`, 'CUSTOMER').send({}).expect(200);
    await call('post', `${MANAGE}/${cancelledOnline.id}/cancel`, 'ADMIN').send({}).expect(200);
    expect(await receive(cancelledOnline)).toEqual({ status: 'RECONCILIATION_REQUIRED', reason: 'ORDER_NOT_PAYABLE' });
    expect(await orderDoc(cancelledOnline.id)).toMatchObject({ status: 'CANCELLED', paid: false });
  });
});

describe('UC-67 branch 4.1 pick-up order PAY_AT_SHOP VietQR payment at the shop', () => {

  test('creates a VietQR link only when READY + PAY_AT_SHOP + unpaid, settles once via webhook keeping PAY_AT_SHOP, and allows handover', async () => {
    const p = await product('SP-0088', { stockOnHand: 10 });
    const pickup = await placePickupAtShop(p, 2);

    // Not READY yet -> rejected.
    expect((await call('post', `${MANAGE}/${pickup.id}/payment-link`, 'SALE_STAFF').send({}).expect(409)).body.error.code).toBe('ORDER_STATE_CONFLICT');
    // Unpaid PREPAID order -> rejected.
    const prepaid = await placeOnlinePrepaid(p, 1);
    expect((await call('post', `${MANAGE}/${prepaid.id}/payment-link`, 'SALE_STAFF').send({}).expect(409)).body.error.code).toBe('ORDER_STATE_CONFLICT');

    await call('post', `${MANAGE}/${pickup.id}/mark-ready`, 'SALE_STAFF').send({}).expect(200);
    // Hand over blocked until paid (MSG105).
    expect((await call('post', `${MANAGE}/${pickup.id}/hand-to-customer`, 'SALE_STAFF').send({}).expect(409)).body.error.code).toBe('ORDER_NOT_PAID');

    const linkRes = await call('post', `${MANAGE}/${pickup.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    const ref = await lastRef(pickup.id);
    expect(linkRes.body.data.checkoutUrl).toBe(`https://pay.payos.vn/web/${ref}`);
    expect(provider.createPaymentLink).toHaveBeenLastCalledWith(expect.objectContaining({
      orderCode: Number(ref),
      amount: pickup.total,
      returnUrl: `http://localhost:5187/admin/product-orders?tab=AWAITING_PICKUP&order=${pickup.id}`
    }));

    expect(await receive(pickup)).toEqual({ status: 'PAYMENT_VERIFIED' });
    expect(await receive(pickup)).toEqual({ status: 'DUPLICATE' });

    const doc = await orderDoc(pickup.id);
    expect(doc).toMatchObject({ status: 'READY', paid: true, paymentMethod: 'PAY_AT_SHOP' });
    expect(doc.payment.receipts).toHaveLength(1);
    expect(doc.payment.receipts[0]).toMatchObject({ state: 'VERIFIED', providerOrderCode: ref, amountVnd: pickup.total });

    const view = (await call('get', `${MANAGE}/${pickup.id}`, 'SALE_STAFF').expect(200)).body.data;
    expect(view).toMatchObject({ status: 'READY', paid: true, paymentMethod: 'PAY_AT_SHOP', vietqrPaid: true });

    const handed = (await call('post', `${MANAGE}/${pickup.id}/hand-to-customer`, 'SALE_STAFF').send({}).expect(200)).body.data;
    expect(handed).toMatchObject({ status: 'PICKED_UP', paid: true, paymentMethod: 'PAY_AT_SHOP' });
    expect(await models.Product.findById(p.id).lean()).toMatchObject({ stockOnHand: 8, quantityHeld: 1 });
  });

  test('failed pick-up VietQR leaves order unpaid for retry or cash, and record-payment settles PAID link via settler', async () => {
    const p = await product('SP-0089', { stockOnHand: 10 });
    const pickup1 = await placePickupAtShop(p, 1);
    await call('post', `${MANAGE}/${pickup1.id}/mark-ready`, 'SALE_STAFF').send({}).expect(200);
    await call('post', `${MANAGE}/${pickup1.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);

    expect(await receive(pickup1, { code: '01' })).toEqual({ status: 'RECONCILIATION_REQUIRED', reason: 'PROVIDER_PAYMENT_NOT_SUCCESSFUL' });
    expect((await call('get', `${MANAGE}/${pickup1.id}`, 'SALE_STAFF').expect(200)).body.data).toMatchObject({
      status: 'READY', paid: false, paymentLink: { state: 'FAILED' }
    });
    // Can still record cash and hand over.
    await call('post', `${MANAGE}/${pickup1.id}/record-payment`, 'SALE_STAFF').send({}).expect(200);
    await call('post', `${MANAGE}/${pickup1.id}/hand-to-customer`, 'SALE_STAFF').send({}).expect(200);

    // Settler settles PAID link on record-payment without double recording.
    const pickup2 = await placePickupAtShop(p, 1);
    await call('post', `${MANAGE}/${pickup2.id}/mark-ready`, 'SALE_STAFF').send({}).expect(200);
    await call('post', `${MANAGE}/${pickup2.id}/payment-link`, 'SALE_STAFF').send({}).expect(200);
    const ref2 = Number(await lastRef(pickup2.id));
    Object.assign(links.get(ref2), { status: 'PAID', amountPaid: pickup2.total });
    const settled = (await call('post', `${MANAGE}/${pickup2.id}/record-payment`, 'SALE_STAFF').send({}).expect(200)).body.data;
    expect(settled).toMatchObject({ status: 'READY', paid: true, paymentMethod: 'PAY_AT_SHOP', vietqrPaid: true });
    expect(await receive(pickup2, { reference: `LINK-${ref2}` })).toEqual({ status: 'DUPLICATE' });
  });
});
