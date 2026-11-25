import { beforeAll, afterAll, beforeEach, describe, test, expect, jest } from '@jest/globals';
import { createServer } from 'node:http';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { provisionProductCatalog } from '../../src/services/product-sales/product-catalog-provisioning.service.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { createProductOrderExpiryService } from '../../src/services/product-sales/product-order-management.service.js';
import { createProductOrderPaymentSettler } from '../../src/services/product-sales/product-order-payment.service.js';
import { createPayosPaymentWebhookService } from '../../src/services/providers/payos/payment-webhook.service.js';
import { createMongoPaymentWebhookRepository } from '../../src/services/providers/payos/mongo-payment-webhook.repository.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { AppError } from '../../src/utils/app-error.js';
import { requestId, notFound, errorHandler } from '../../src/middlewares/http.js';
import { registerModules } from '../../src/routes/module-registry.js';

// UC-62 / GBR-36 / GBR-18 / JOB-04: prepaid product orders through payOS. System tests ST-ORD-02, 07, 11, 13.
const oid = () => new mongoose.Types.ObjectId();
const actors = {
  a: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  b: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  c: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  admin: { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE' },
  saleStaff: { userId: String(oid()), roles: ['SALE_STAFF'], state: 'ACTIVE' }
};
const MANAGE = '/api/v1/admin/product-orders';
const ORDERS = '/api/v1/product-orders';
const START = Date.parse('2026-11-24T10:00:00Z');
const HOUR = 3_600_000;
let replica, connection, server, base, models, now, failCreate;
const addressOf = {};
const links = new Map();
const idem = (() => { let n = 0; return () => `synthetic-key-${String(++n).padStart(6, '0')}`; })();

// A stand-in for payOS: it keeps the links it made and reports the state a test gives them.
const provider = {
  createPaymentLink: jest.fn(async (input) => {
    if (failCreate) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Payment provider is unavailable');
    links.set(input.orderCode, { status: 'PENDING', amount: input.amount, amountPaid: 0 });
    return { orderCode: input.orderCode, amount: input.amount, currency: 'VND', providerStatus: 'PENDING',
      paymentLinkId: `link-${input.orderCode}`, checkoutUrl: `https://pay.payos.vn/web/${input.orderCode}` };
  }),
  getPaymentLink: jest.fn(async (orderCode) => {
    const link = links.get(orderCode);
    if (!link) throw new AppError(503, 'PAYOS_REQUEST_FAILED', 'Payment provider request failed');
    return { orderCode, amount: link.amount, amountPaid: link.amountPaid, amountRemaining: link.amount - link.amountPaid, providerStatus: link.status };
  }),
  verifyWebhook: (body) => body.data
};
const webhook = () => createPayosPaymentWebhookService({ provider, clock: () => new Date(now),
  repository: createMongoPaymentWebhookRepository({ connection }) });

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
const place = async (who, code, quantity, body) => {
  await api(who).post('/api/v1/product-cart/lines').send({ productId: await idOf(code), quantity });
  // A delivery uses an address of the customer who orders.
  return api(who).post(ORDERS).set('Idempotency-Key', idem()).send(body.addressId === 'OWN' ? { ...body, addressId: String(addressOf[who]._id) } : body);
};
const delivery = (paymentMethod) => ({ receiveMethod: 'DELIVERY', paymentMethod, addressId: 'OWN' });
const pickup = (paymentMethod) => ({ receiveMethod: 'PICKUP', paymentMethod });
const placed = async (who, code, quantity, body) => {
  const res = await place(who, code, quantity, body);
  expect(res.status).toBe(201);
  return res.body.data;
};
const orderDoc = (order) => models.ProductOrder.findById(order.id).lean();
const act = (order, action, body = {}) => api('admin').post(`${MANAGE}/${order.id}/${action}`).send(body);
const link = (who, order) => api(who).post(`${ORDERS}/${order.id}/payment-link`);
const reference = async (order) => (await orderDoc(order)).payment.providerReferences.at(-1);
// The signed result payOS sends for a payment of this order's last link.
const payOf = async (order, patch = {}) => {
  const ref = await reference(order);
  return { orderCode: Number(ref), amount: order.total, currency: 'VND', code: '00', reference: `BANK-${ref}`,
    paymentLinkId: `link-${ref}`, transactionDateTime: '2026-11-24T10:05:00Z', ...patch };
};
const receive = async (order, patch) => webhook().handleWebhook({ data: await payOf(order, patch) });
const notices = (order) => connection.db.collection('notifications').find({ eventId: { $regex: `^product-order:${order.id}:` } }).toArray();

function salesApp() {
  const sessionService = { authenticate: async (req) => {
    const actor = actors[req.get('x-test-actor')];
    return actor ? { ...actor, expiresAt: now + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const config = { auth: { enabled: true, contactLookupSecret: 'synthetic-contact-lookup-secret-0123',
    contactEncryptionKey: 'synthetic-contact-encryption-key' }, paymentDeadlineHours: 1 };
  const env = { PRODUCT_SALES_ENABLED: 'true', BOOKING_WEB_ORIGIN: 'http://localhost:5173' };
  const app = express();
  app.use(express.json(), requestId);
  registerModules(app, productSalesRuntimeModules({ config, connection, env, sessionService, clock: () => now, provider }));
  app.use(notFound, errorHandler(() => {}));
  return app;
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_product_order_prepay' }).asPromise();
  models = productSalesModels(connection);
  const { CustomerAddress } = petCareModels(connection);
  await CustomerAddress.createCollection(); await CustomerAddress.createIndexes();
  for (const who of ['a', 'b', 'c']) {
    addressOf[who] = await CustomerAddress.create({ ownerId: actors[who].userId, label: 'Synthetic home', location: 'Synthetic private address',
      point: { type: 'Point', coordinates: [105.85, 21.02] }, pointConfirmedAt: new Date(), areaCode: 'DISTRICT_THANH_XUAN', version: 0 });
  }
  await models.ProductOrder.createIndexes();
  await connection.db.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(actors.admin.userId), state: 'ACTIVE', roles: ['ADMIN'] });
  await provisionFinanceSources(connection);
  server = createServer(salesApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}, 600000);
afterAll(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await connection?.close(); await replica?.stop();
}, 30000);
beforeEach(async () => {
  now = START; failCreate = false; links.clear();
  for (const model of Object.values(models)) await model.deleteMany({});
  for (const name of ['payments', 'financesourcecommands', 'financesourceevents', 'notifications']) {
    await connection.db.collection(name).deleteMany({});
  }
  await provisionProductCatalog({ connection });
});

describe('ST-ORD-02 / ST-ORD-07 ways to pay (GBR-36)', () => {
  test('a delivery is paid through payOS in advance or in cash on delivery, never at the shop', async () => {
    expect((await place('a', 'SP-0012', 1, delivery('PAY_AT_SHOP'))).status).toBe(422);
    const cod = await placed('a', 'SP-0012', 1, delivery('COD'));
    expect(cod).toMatchObject({ paymentMethod: 'COD', paid: false, paymentDeadlineAt: null });
    const prepaid = await placed('b', 'SP-0012', 1, delivery('PREPAID'));
    expect(prepaid).toMatchObject({ paymentMethod: 'PREPAID', paid: false, status: 'PLACED' });
  });

  test('a pick-up is paid through payOS in advance or at the shop, never on delivery', async () => {
    expect((await place('a', 'SP-0020', 1, pickup('COD'))).status).toBe(422);
    expect((await place('a', 'SP-0020', 1, pickup('PAY_AT_SHOP'))).status).toBe(201);
    expect((await place('b', 'SP-0020', 1, pickup('PREPAID'))).status).toBe(201);
    expect((await place('c', 'SP-0020', 1, { ...pickup('PREPAID'), addressId: 'OWN' })).status).toBe(422);
  });

  test('a prepaid order is placed unpaid, holds its quantity and is due one hour after it was placed', async () => {
    const order = await placed('a', 'SP-0012', 3, delivery('PREPAID'));
    expect(new Date(order.paymentDeadlineAt).getTime()).toBe(START + HOUR);
    expect(order.total).toBe(order.subtotal + order.shippingFee);
    // GBR-35: the quantity is held, the stock on hand does not move.
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 15, quantityHeld: 3 });
    const [notice] = await notices(order);
    expect(notice.message).toContain('Vui lòng thanh toán trước');
  });
});

describe('ST-ORD-13 customer over the refusal limit (MSG60)', () => {
  test('only payment in advance is accepted, but the customer can still order', async () => {
    await models.ProductCustomerRefusal.create([1, 2, 3].map((n) => ({
      customerId: actors.c.userId, orderId: oid(), reason: 'REFUSED_DELIVERY', occurredAt: new Date(START - n * HOUR) })));
    const refused = await place('c', 'SP-0012', 1, delivery('COD'));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('PRODUCT_ORDER_PREPAY_REQUIRED');
    expect((await place('c', 'SP-0012', 1, pickup('PAY_AT_SHOP'))).body.error.code).toBe('PRODUCT_ORDER_PREPAY_REQUIRED');
    expect(await models.ProductOrder.countDocuments()).toBe(0);
    expect((await place('c', 'SP-0012', 1, delivery('PREPAID'))).status).toBe(201);
  });
});

describe('payment link (UC-62 step 7, MSG33)', () => {
  test('is made for the amount of the order, due at the deadline, and goes back to My Orders', async () => {
    const order = await placed('a', 'SP-0012', 2, delivery('PREPAID'));
    const res = await link('a', order);
    expect(res.status).toBe(200);
    const ref = await reference(order);
    expect(res.body.data.checkoutUrl).toBe(`https://pay.payos.vn/web/${ref}`);
    expect(provider.createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ orderCode: Number(ref), amount: order.total,
      expiredAt: Math.floor((START + HOUR) / 1000), returnUrl: `http://localhost:5173/customer/product-orders?order=${order.id}` }));
    expect((await orderDoc(order)).payment).toMatchObject({ linkState: 'READY', providerReferences: [ref] });
  });

  test('the same link is returned while it can still be paid, and a new one once it was cancelled', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    await link('a', order).expect(200);
    const first = await reference(order);
    expect((await link('a', order)).body.data.checkoutUrl).toBe(`https://pay.payos.vn/web/${first}`);
    expect(provider.createPaymentLink).toHaveBeenCalledTimes(1);
    links.get(Number(first)).status = 'CANCELLED';
    now = START + 20 * 60_000;
    const again = await link('a', order);
    expect(again.status).toBe(200);
    const second = await reference(order);
    expect(second).not.toBe(first);
    // UC-62 step 8.1: a link cancelled at payOS is not handed out again; the new link is a new payOS order and
    // still ends at the payment deadline of the order, not later.
    expect(again.body.data.checkoutUrl).toBe(`https://pay.payos.vn/web/${second}`);
    expect(provider.createPaymentLink).toHaveBeenCalledTimes(2);
    expect(provider.createPaymentLink).toHaveBeenLastCalledWith(expect.objectContaining({ orderCode: Number(second),
      expiredAt: Math.floor((START + HOUR) / 1000) }));
    expect((await orderDoc(order)).payment.providerReferences).toEqual([first, second]);
    links.get(Number(second)).status = 'EXPIRED';
    await link('a', order).expect(200);
    expect((await orderDoc(order)).payment.providerReferences).toHaveLength(3);
    expect(provider.createPaymentLink).toHaveBeenLastCalledWith(expect.objectContaining({ expiredAt: Math.floor((START + HOUR) / 1000) }));
  });

  test.each([true, false])('a superseded provider response cannot change the newer link (success: %s)', async success => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    const started = Promise.withResolvers();
    const delayed = Promise.withResolvers();
    const createLink = provider.createPaymentLink.getMockImplementation();
    provider.createPaymentLink.mockImplementationOnce(async input => {
      started.resolve();
      await delayed.promise;
      if (!success) throw new Error('Provider timeout');
      return createLink(input);
    });
    const first = Promise.resolve(link('a', order));
    await started.promise;
    now += 61_000;
    let next;
    try {
      next = await link('a', order);
    } finally {
      delayed.resolve();
    }
    expect(next.status).toBe(200);
    expect((await first).status).toBe(success ? 409 : 503);
    expect((await orderDoc(order)).payment).toMatchObject({ linkState: 'READY', checkoutUrl: next.body.data.checkoutUrl });
  });

  test('MSG33: when payOS cannot make the link the order stays placed and can be paid within the deadline', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    failCreate = true;
    const failed = await link('a', order);
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    expect(await orderDoc(order)).toMatchObject({ status: 'PLACED', paid: false });
    failCreate = false;
    expect((await link('a', order)).status).toBe(200);
  });

  test('is refused for another customer, a cash order, a paid order and a late order', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    expect((await link('b', order)).status).toBe(404);
    const cod = await placed('a', 'SP-0020', 1, delivery('COD'));
    expect((await link('a', cod)).body.error.code).toBe('ORDER_STATE_CONFLICT');
    now = START + HOUR;
    const late = await link('a', order);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('ORDER_PAYMENT_EXPIRED');
  });
});

describe('payOS result (UC-62 step 8, GBR-18)', () => {
  test('ST-ORD-02 a paid result marks the order paid, once, even when payOS sends it again', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    await link('a', order).expect(200);
    expect(await receive(order)).toEqual({ status: 'PAYMENT_VERIFIED' });
    expect(await receive(order)).toEqual({ status: 'DUPLICATE' });
    const doc = await orderDoc(order);
    expect(doc).toMatchObject({ paid: true, status: 'PLACED', version: 1 });
    expect(doc.payment.receipts).toHaveLength(1);
    expect(doc.payment.receipts[0]).toMatchObject({ state: 'VERIFIED', amountVnd: order.total });
    expect(await connection.db.collection('financesourcecommands').countDocuments()).toBe(1);
    expect((await notices(order)).some((row) => row.message.includes('ghi nhận thanh toán'))).toBe(true);
  });

  test('ST-ORD-03 a paid delivery order is handed to the carrier at once; an unpaid one is not', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    const blocked = await act(order, 'hand-to-carrier', { trackingCode: 'VN7290018342' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ORDER_NOT_PAID');
    await link('a', order).expect(200); await receive(order);
    const handed = await act(order, 'hand-to-carrier', { trackingCode: 'VN7290018342' });
    expect(handed.status).toBe(200);
    expect(handed.body.data).toMatchObject({ status: 'HANDED_TO_CARRIER', paid: true });
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 14, quantityHeld: 0 });
  });

  test('ST-ORD-07 a paid pick-up order is readied and handed over without taking any money (MSG106)', async () => {
    const order = await placed('a', 'SP-0020', 1, pickup('PREPAID'));
    expect((await act(order, 'mark-ready')).body.error.code).toBe('ORDER_NOT_PAID');
    expect((await act(order, 'record-payment')).body.error.code).toBe('ORDER_STATE_CONFLICT');
    await link('a', order).expect(200); await receive(order);
    expect((await act(order, 'mark-ready')).status).toBe(200);
    expect((await act(order, 'hand-to-customer')).body.data).toMatchObject({ status: 'PICKED_UP', paid: true });
  });

  test('MSG32: a failed or wrong payment leaves the order unpaid and it can be paid again', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    await link('a', order).expect(200);
    expect(await receive(order, { code: '01' })).toMatchObject({ status: 'RECONCILIATION_REQUIRED', reason: 'PROVIDER_PAYMENT_NOT_SUCCESSFUL' });
    expect(await receive(order, { amount: order.total - 1, reference: 'BANK-SHORT' })).toMatchObject({ reason: 'AMOUNT_MISMATCH' });
    expect(await orderDoc(order)).toMatchObject({ paid: false, status: 'PLACED' });
    // A payment that did not go through is not for staff to reconcile; money that cannot be placed is (one notice, for the wrong amount).
    expect(await connection.db.collection('notifications').countDocuments({ eventType: 'PaymentReconciliationRequired' })).toBe(1);
    links.get(Number(await reference(order))).status = 'CANCELLED';
    await link('a', order).expect(200);
    expect(await receive(order)).toEqual({ status: 'PAYMENT_VERIFIED' });
    expect(await orderDoc(order)).toMatchObject({ paid: true });
  });

  test('money that arrives after the order was cancelled is kept for reconciliation and never reopens the order', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    await link('a', order).expect(200);
    await act(order, 'cancel').expect(200);
    expect(await receive(order)).toEqual({ status: 'RECONCILIATION_REQUIRED', reason: 'ORDER_NOT_PAYABLE' });
    const doc = await orderDoc(order);
    expect(doc).toMatchObject({ status: 'CANCELLED', paid: false });
    expect(doc.payment.receipts).toMatchObject([{ state: 'RECONCILIATION_REQUIRED', reason: 'ORDER_NOT_PAYABLE', amountVnd: order.total }]);
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 15, quantityHeld: 0 });
  });

  test('a result for an unknown payOS order code finds no order and changes nothing', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    await link('a', order).expect(200);
    const result = await webhook().handleWebhook({ data: { ...(await payOf(order)), orderCode: 999999999999 } });
    expect(result).toMatchObject({ status: 'RECONCILIATION_REQUIRED', reason: 'UNKNOWN_REFERENCE' });
    expect(await orderDoc(order)).toMatchObject({ paid: false });
  });
});

describe('GBR-37 refund of a prepaid order that is cancelled', () => {
  test('a paid order cancelled by Sale Staff is marked for the whole amount; an unpaid one is not marked', async () => {
    const paid = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    await link('a', paid).expect(200); await receive(paid);
    expect((await act(paid, 'cancel')).body.data).toMatchObject({ status: 'CANCELLED', refundMarked: true, refundAmountVnd: paid.total });
    const unpaid = await placed('b', 'SP-0020', 1, delivery('PREPAID'));
    expect((await act(unpaid, 'cancel')).body.data).toMatchObject({ status: 'CANCELLED', refundMarked: false, refundAmountVnd: null });
  });
});

describe('ST-ORD-11 JOB-04 prepaid order not paid in time', () => {
  const settler = () => createProductOrderPaymentSettler({ provider, handleVerifiedPayment: webhook().handleVerifiedPayment });
  const expiry = (payments) => createProductOrderExpiryService({ connection, clock: () => now, payments });

  test('is cancelled after the deadline, its hold ends, the customer is told and no refusal is counted', async () => {
    const order = await placed('a', 'SP-0012', 2, delivery('PREPAID'));
    await link('a', order).expect(200);
    now = START + HOUR - 1;
    expect(await expiry(settler()).runBatch()).toMatchObject({ cancelled: 0, failed: 0 });
    expect(await orderDoc(order)).toMatchObject({ status: 'PLACED' });
    now = START + HOUR;
    expect(await expiry(settler()).runBatch()).toMatchObject({ cancelled: 1, failed: 0, kept: 0 });
    expect(await orderDoc(order)).toMatchObject({ status: 'CANCELLED', paid: false, refundMarked: false });
    expect(await product('SP-0012')).toMatchObject({ stockOnHand: 15, quantityHeld: 0 });
    expect(await models.ProductCustomerRefusal.countDocuments()).toBe(0);
    expect((await notices(order)).some((row) => row.message.includes('quá hạn thanh toán'))).toBe(true);
    expect(await expiry(settler()).runBatch()).toMatchObject({ cancelled: 0, failed: 0 });
  });

  test('is cancelled when no link was ever made, and a cash order is never touched', async () => {
    const prepaid = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    const cod = await placed('b', 'SP-0020', 1, delivery('COD'));
    now = START + 5 * HOUR;
    expect(await expiry(settler()).runBatch()).toMatchObject({ cancelled: 1 });
    expect(await orderDoc(prepaid)).toMatchObject({ status: 'CANCELLED' });
    expect(await orderDoc(cod)).toMatchObject({ status: 'PLACED' });
  });

  test('records a different transfer for an already paid link for reconciliation', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    await link('a', order).expect(200);
    expect(await receive(order)).toMatchObject({ status: 'PAYMENT_VERIFIED' });
    expect(await receive(order, { reference: 'BANK-SECOND-TRANSFER' }))
      .toMatchObject({ status: 'RECONCILIATION_REQUIRED' });
    expect((await orderDoc(order)).payment.receipts.map(receipt => receipt.state))
      .toEqual(['VERIFIED', 'RECONCILIATION_REQUIRED']);
  });

  test('is kept and recorded as paid when payOS says it was paid after all', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    await link('a', order).expect(200);
    const ref = Number(await reference(order));
    Object.assign(links.get(ref), { status: 'PAID', amountPaid: order.total });
    now = START + 2 * HOUR;
    expect(await expiry(settler()).runBatch()).toMatchObject({ cancelled: 0, failed: 0, kept: 1 });
    expect(await orderDoc(order)).toMatchObject({ status: 'PLACED', paid: true });
    // The status lookup cannot prove the bank reference is the same transfer.
    expect(await receive(order)).toMatchObject({ status: 'RECONCILIATION_REQUIRED' });
    expect((await orderDoc(order)).payment.receipts.map(receipt => receipt.state))
      .toEqual(['VERIFIED', 'RECONCILIATION_REQUIRED']);
  });

  test('keeps an issued payment link for reconciliation while payOS is disabled', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    await link('a', order).expect(200);
    now = START + HOUR;
    expect(await expiry(null).runBatch()).toMatchObject({ cancelled: 0, kept: 1 });
    expect(await orderDoc(order)).toMatchObject({ status: 'PLACED', paid: false });
    expect(await product('SP-0012')).toMatchObject({ quantityHeld: 1 });
  });

  test('is left alone when payOS cannot be asked, so a paid order is never cancelled by mistake', async () => {
    const order = await placed('a', 'SP-0012', 1, delivery('PREPAID'));
    await link('a', order).expect(200);
    links.clear();
    now = START + 2 * HOUR;
    expect(await expiry(settler()).runBatch()).toMatchObject({ cancelled: 0, failed: 1 });
    expect(await orderDoc(order)).toMatchObject({ status: 'PLACED' });
    expect(await product('SP-0012')).toMatchObject({ quantityHeld: 1 });
  });

  test('a paid prepaid pick-up order not collected is cancelled with a refund of the whole amount (GBR-37)', async () => {
    const order = await placed('a', 'SP-0020', 1, pickup('PREPAID'));
    await link('a', order).expect(200); await receive(order);
    await act(order, 'mark-ready').expect(200);
    now = START + 100 * HOUR;
    expect(await expiry(settler()).runBatch()).toMatchObject({ cancelled: 1 });
    expect(await orderDoc(order)).toMatchObject({ status: 'CANCELLED', refundMarked: true, refundAmountVnd: order.total, shippingFee: 0 });
    expect(order.total).toBe(order.subtotal);
    expect(await models.ProductCustomerRefusal.find().lean()).toEqual([expect.objectContaining({ orderId: expect.anything(), reason: 'NOT_COLLECTED' })]);
    expect(await product('SP-0020')).toMatchObject({ quantityHeld: 0 });
    // A second run changes nothing: one refusal, one refund mark.
    expect(await expiry(settler()).runBatch()).toMatchObject({ cancelled: 0 });
    expect(await models.ProductCustomerRefusal.countDocuments()).toBe(1);
  });
});
