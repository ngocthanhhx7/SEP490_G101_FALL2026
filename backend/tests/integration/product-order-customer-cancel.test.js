import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import { createServer } from 'node:http';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { provisionProductCatalog } from '../../src/services/product-sales/product-catalog-provisioning.service.js';
import { createProductOrderService } from '../../src/services/product-sales/product-order.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { AppError } from '../../src/utils/app-error.js';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { userModel } from '../../src/models/user.model.js';
import { identityModels } from '../../src/models/identity.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { requestId, notFound, errorHandler } from '../../src/middlewares/http.js';
import { registerModules } from '../../src/routes/module-registry.js';

const oid = () => new mongoose.Types.ObjectId();
const actors = {
  a: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  b: { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' },
  admin: { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE' },
  saleStaff: { userId: String(oid()), roles: ['SALE_STAFF'], state: 'ACTIVE' },
  staff: { userId: String(oid()), roles: ['STAFF'], state: 'ACTIVE' }
};
const CONTACT_KEYS = {
  contactLookupSecret: 'synthetic-contact-lookup-secret-0123',
  contactEncryptionKey: 'synthetic-contact-encryption-key'
};
const idem = (() => { let n = 0; return () => `cust-cancel-key-${String(++n).padStart(6, '0')}`; })();

let replica, connection, server, base, models, addressA;

const api = (who) => {
  const call = (method, path) => {
    const req = request(base)[method](path);
    if (who) req.set('x-test-actor', who);
    if (method !== 'get') req.set('Origin', base).set('X-CSRF-Token', 'synthetic-csrf');
    return req;
  };
  return { get: (p) => call('get', p), post: (p) => call('post', p) };
};

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_product_order_customer_cancel' }).asPromise();
  models = productSalesModels(connection);
  const { CustomerAddress } = petCareModels(connection);
  await CustomerAddress.createCollection();
  await CustomerAddress.createIndexes();
  addressA = await CustomerAddress.create({
    ownerId: actors.a.userId,
    label: 'Synthetic home',
    location: 'Synthetic private address',
    point: { type: 'Point', coordinates: [105.85, 21.02] },
    pointConfirmedAt: new Date(),
    areaCode: 'DISTRICT_THANH_XUAN',
    version: 0
  });
  const User = userModel(connection);
  await User.create([
    { _id: actors.a.userId, displayName: 'Synthetic Mai', roles: ['CUSTOMER'], state: 'ACTIVE' },
    { _id: actors.b.userId, displayName: 'Synthetic Lan', roles: ['CUSTOMER'], state: 'ACTIVE' }
  ]);
  const { Contact } = identityModels(connection);
  await Contact.createCollection();
  const crypto = createContactCrypto({ lookupSecret: CONTACT_KEYS.contactLookupSecret, encryptionKey: CONTACT_KEYS.contactEncryptionKey });
  const canon = crypto.lookup('PHONE', '+84912345678');
  await Contact.create({
    userId: actors.a.userId, channel: 'PHONE', canonicalCiphertext: crypto.encrypt(canon.canonicalValue),
    lookupKey: canon.lookupKey, state: 'VERIFIED', verifiedAt: new Date()
  });
  await provisionProductCatalog({ connection });
  await provisionFinanceSources(connection);

  const sessionService = {
    authenticate: async (req) => {
      const actor = actors[req.get('x-test-actor')];
      return actor ? { ...actor, expiresAt: Date.now() + 60000 } : null;
    },
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf'
  };
  const app = express();
  app.use(express.json(), requestId);
  registerModules(app, productSalesRuntimeModules({
    config: { auth: { enabled: true, ...CONTACT_KEYS } },
    connection,
    env: { PRODUCT_SALES_ENABLED: 'true' },
    sessionService
  }));
  app.use(notFound, errorHandler(() => {}));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await connection?.close();
  await replica?.stop();
});

beforeEach(async () => {
  await Promise.all([
    models.Product.deleteMany({}),
    models.ProductCart.deleteMany({}),
    models.ProductOrder.deleteMany({}),
    models.ProductCustomerRefusal.deleteMany({})
  ]);
  await models.Product.create({
    code: 'SP-CAN-01', name: 'Thức ăn test huỷ đơn', category: 'FOOD', petType: 'DOG',
    sellingPrice: 50000, stockOnHand: 10, quantityHeld: 0, visible: true
  });
});

async function placeOrder(who, { receiveMethod = 'DELIVERY', paymentMethod = 'COD', quantity = 3 } = {}) {
  const product = await models.Product.findOne({ code: 'SP-CAN-01' }).lean();
  await api(who).post('/api/v1/product-cart/lines').send({ productId: String(product._id), quantity }).expect(201);
  const body = receiveMethod === 'DELIVERY'
    ? { receiveMethod, paymentMethod, addressId: String(addressA._id) }
    : { receiveMethod, paymentMethod };
  const res = await api(who).post('/api/v1/product-orders').set('Idempotency-Key', idem()).send(body).expect(201);
  return res.body.data;
}

describe('ST-ORD-10 customer cancels order while PLACED', () => {
  test('cancels PLACED COD order: releases hold only, keeps stockOnHand, no refund mark, no refusal', async () => {
    const order = await placeOrder('a', { receiveMethod: 'DELIVERY', paymentMethod: 'COD', quantity: 3 });
    let prod = await models.Product.findOne({ code: 'SP-CAN-01' }).lean();
    expect(prod.stockOnHand).toBe(10);
    expect(prod.quantityHeld).toBe(3);

    const res = await api('a').post(`/api/v1/product-orders/${order.id}/cancel`)
      .set('Idempotency-Key', idem()).send({}).expect(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.cancelledBy).toBe('CUSTOMER');
    expect(res.body.data.refundMarked).toBeUndefined();

    const stored = await models.ProductOrder.findById(order.id).lean();
    expect(stored.refundMarked).toBe(false);
    expect(stored.refundAmountVnd).toBeUndefined();

    prod = await models.Product.findOne({ code: 'SP-CAN-01' }).lean();
    expect(prod.stockOnHand).toBe(10);
    expect(prod.quantityHeld).toBe(0);
    expect(await models.ProductCustomerRefusal.countDocuments({ orderId: order.id })).toBe(0);
  });

  test('cancels paid PREPAID PLACED order: marks full refund including shippingFee, no refusal, visible in Admin Order refunds tab', async () => {
    const order = await placeOrder('a', { receiveMethod: 'DELIVERY', paymentMethod: 'PREPAID', quantity: 2 });
    await models.ProductOrder.updateOne({ _id: order.id }, { $set: { paid: true, 'payment.paidAt': new Date() } });
    expect(order.subtotal).toBe(100000);
    expect(order.shippingFee).toBeGreaterThan(0);
    expect(order.total).toBe(order.subtotal + order.shippingFee);

    const cancelKey = idem();
    const res = await api('a').post(`/api/v1/product-orders/${order.id}/cancel`)
      .set('Idempotency-Key', cancelKey).send({}).expect(200);
    expect(res.body.data.status).toBe('CANCELLED');

    const stored = await models.ProductOrder.findById(order.id).lean();
    expect(stored.refundMarked).toBe(true);
    expect(stored.refundAmountVnd).toBe(order.total);

    const prod = await models.Product.findOne({ code: 'SP-CAN-01' }).lean();
    expect(prod.stockOnHand).toBe(10);
    expect(prod.quantityHeld).toBe(0);
    expect(await models.ProductCustomerRefusal.countDocuments({ orderId: order.id })).toBe(0);

    // Repeating with the same Idempotency-Key is idempotent and does not double-release hold
    const replay = await api('a').post(`/api/v1/product-orders/${order.id}/cancel`)
      .set('Idempotency-Key', cancelKey).send({}).expect(200);
    expect(replay.body.data.status).toBe('CANCELLED');
    expect((await models.Product.findOne({ code: 'SP-CAN-01' }).lean()).quantityHeld).toBe(0);

    // Second cancel with a different key returns 409 ORDER_NOT_CANCELLABLE
    const again = await api('a').post(`/api/v1/product-orders/${order.id}/cancel`)
      .set('Idempotency-Key', idem()).send({}).expect(409);
    expect(again.body.error.code).toBe('ORDER_NOT_CANCELLABLE');

    // Admin Order refunds endpoint lists this order; Sale Staff & Customer are forbidden (403)
    const adminList = await api('admin').get('/api/v1/admin/product-orders/refunds').expect(200);
    expect(adminList.body.data.total).toBe(1);
    expect(adminList.body.data.items[0].code).toBe(order.code);
    expect(adminList.body.data.items[0].refundAmountVnd).toBe(order.total);
    expect(adminList.body.data.items[0].customer.displayName).toBe('Synthetic Mai');

    await api('saleStaff').get('/api/v1/admin/product-orders/refunds').expect(403);
    await api('a').get('/api/v1/admin/product-orders/refunds').expect(403);
  });

  test('forbids cancelling another customer order with 403 and does not leak data', async () => {
    const order = await placeOrder('a', { receiveMethod: 'DELIVERY', paymentMethod: 'COD', quantity: 1 });
    const res = await api('b').post(`/api/v1/product-orders/${order.id}/cancel`)
      .set('Idempotency-Key', idem()).send({}).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.data).toBeUndefined();
    expect((await models.ProductOrder.findById(order.id).lean()).status).toBe('PLACED');
  });

  test('blocks cancelling orders already HANDED_TO_CARRIER or READY with 409 ORDER_NOT_CANCELLABLE (MSG156)', async () => {
    const delivery = await placeOrder('a', { receiveMethod: 'DELIVERY', paymentMethod: 'COD', quantity: 1 });
    await api('admin').post(`/api/v1/admin/product-orders/${delivery.id}/hand-to-carrier`)
      .send({ trackingCode: 'VN-123456' }).expect(200);
    const resDelivery = await api('a').post(`/api/v1/product-orders/${delivery.id}/cancel`)
      .set('Idempotency-Key', idem()).send({}).expect(409);
    expect(resDelivery.body.error.code).toBe('ORDER_NOT_CANCELLABLE');

    const pickup = await placeOrder('a', { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP', quantity: 1 });
    await api('admin').post(`/api/v1/admin/product-orders/${pickup.id}/mark-ready`).send({}).expect(200);
    const resPickup = await api('a').post(`/api/v1/product-orders/${pickup.id}/cancel`)
      .set('Idempotency-Key', idem()).send({}).expect(409);
    expect(resPickup.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
  });

  test('cancels unpaid PREPAID order without any payment link even when payOS is not configured (payments null)', async () => {
    const order = await placeOrder('a', { receiveMethod: 'DELIVERY', paymentMethod: 'PREPAID', quantity: 2 });
    const res = await api('a').post(`/api/v1/product-orders/${order.id}/cancel`)
      .set('Idempotency-Key', idem()).send({}).expect(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.cancelledBy).toBe('CUSTOMER');
    const stored = await models.ProductOrder.findById(order.id).lean();
    expect(stored.refundMarked).toBe(false);
    expect((await models.Product.findOne({ code: 'SP-CAN-01' }).lean()).quantityHeld).toBe(0);
  });

  test('refuses to cancel prepaid order with an issued payment link when payOS is not configured (payments null): returns 503 and keeps order/hold unchanged', async () => {
    const order = await placeOrder('a', { receiveMethod: 'DELIVERY', paymentMethod: 'PREPAID', quantity: 2 });
    await models.ProductOrder.updateOne(
      { _id: order.id },
      { $set: { 'payment.providerReferences': ['777001'], 'payment.linkState': 'ACTIVE' }, $inc: { version: 1 } }
    );

    const res = await api('a').post(`/api/v1/product-orders/${order.id}/cancel`)
      .set('Idempotency-Key', idem()).send({}).expect(503);
    expect(res.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');

    const stored = await models.ProductOrder.findById(order.id).lean();
    expect(stored.status).toBe('PLACED');
    expect((await models.Product.findOne({ code: 'SP-CAN-01' }).lean()).quantityHeld).toBe(2);
  });

  test('reconciles payOS on prepaid order with payment link: provider error -> 503, RECONCILE -> 409, PAID -> settles and cancels with full refund (GBR-37)', async () => {
    const links = new Map();
    let failLookup = false;
    const provider = {
      async createPaymentLink(input) {
        links.set(input.orderCode, { status: 'PENDING', amount: input.amount, amountPaid: 0 });
        return {
          orderCode: input.orderCode, amount: input.amount, currency: 'VND', providerStatus: 'PENDING',
          paymentLinkId: `link-${input.orderCode}`, checkoutUrl: `https://pay.payos.vn/web/${input.orderCode}`
        };
      },
      async getPaymentLink(orderCode) {
        if (failLookup) throw new AppError(503, 'PAYOS_REQUEST_FAILED', 'payOS unreachable');
        const link = links.get(orderCode);
        if (!link) throw new AppError(503, 'PAYOS_REQUEST_FAILED', 'Unknown link');
        return {
          orderCode, amount: link.amount, amountPaid: link.amountPaid,
          amountRemaining: link.amount - link.amountPaid, providerStatus: link.status
        };
      },
      verifyWebhook: (body) => body.data
    };
    const payApp = express();
    payApp.use(express.json(), requestId);
    const sessionService = {
      authenticate: async (req) => {
        const actor = actors[req.get('x-test-actor')];
        return actor ? { ...actor, expiresAt: Date.now() + 60000 } : null;
      },
      verifyCsrf: async (_actor, token) => token === 'synthetic-csrf'
    };
    registerModules(payApp, productSalesRuntimeModules({
      config: { auth: { enabled: true, ...CONTACT_KEYS } },
      connection,
      env: { PRODUCT_SALES_ENABLED: 'true', BOOKING_WEB_ORIGIN: 'http://127.0.0.1:5173' },
      sessionService,
      provider
    }));
    payApp.use(notFound, errorHandler(() => {}));
    const payServer = createServer(payApp);
    await new Promise((resolve) => payServer.listen(0, '127.0.0.1', resolve));
    const payBase = `http://127.0.0.1:${payServer.address().port}`;
    const callPay = (who, method, path) => {
      const req = request(payBase)[method](path).set('x-test-actor', who);
      if (method !== 'get') req.set('Origin', payBase).set('X-CSRF-Token', 'synthetic-csrf');
      return req;
    };

    try {
      const order = await placeOrder('a', { receiveMethod: 'DELIVERY', paymentMethod: 'PREPAID', quantity: 2 });
      await callPay('a', 'post', `/api/v1/product-orders/${order.id}/payment-link`).expect(200);
      const linked = await models.ProductOrder.findById(order.id).lean();
      const orderCode = Number(linked.payment.providerReferences.at(-1));

      // 1. payOS error -> 503, order remains PLACED and hold stays 2
      failLookup = true;
      const errRes = await callPay('a', 'post', `/api/v1/product-orders/${order.id}/cancel`)
        .set('Idempotency-Key', idem()).send({}).expect(503);
      expect(errRes.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
      expect((await models.ProductOrder.findById(order.id).lean()).status).toBe('PLACED');
      expect((await models.Product.findOne({ code: 'SP-CAN-01' }).lean()).quantityHeld).toBe(2);

      // 2. payOS reports PENDING -> RECONCILE -> 409 ORDER_PAYMENT_IN_PROGRESS, order remains PLACED and hold stays 2
      failLookup = false;
      const recRes = await callPay('a', 'post', `/api/v1/product-orders/${order.id}/cancel`)
        .set('Idempotency-Key', idem()).send({}).expect(409);
      expect(recRes.body.error.code).toBe('ORDER_PAYMENT_IN_PROGRESS');
      expect((await models.ProductOrder.findById(order.id).lean()).status).toBe('PLACED');
      expect((await models.Product.findOne({ code: 'SP-CAN-01' }).lean()).quantityHeld).toBe(2);

      // 3. payOS reports PAID -> settler records payment, then order is cancelled with full refund (GBR-37) and hold released
      links.set(orderCode, { status: 'PAID', amount: order.total, amountPaid: order.total });
      const paidCancel = await callPay('a', 'post', `/api/v1/product-orders/${order.id}/cancel`)
        .set('Idempotency-Key', idem()).send({}).expect(200);
      expect(paidCancel.body.data).toMatchObject({ status: 'CANCELLED', paid: true, cancelledBy: 'CUSTOMER' });

      const stored = await models.ProductOrder.findById(order.id).lean();
      expect(stored.paid).toBe(true);
      expect(stored.status).toBe('CANCELLED');
      expect(stored.refundMarked).toBe(true);
      expect(stored.refundAmountVnd).toBe(order.total);
      expect((await models.Product.findOne({ code: 'SP-CAN-01' }).lean()).quantityHeld).toBe(0);
      expect(await models.ProductCustomerRefusal.countDocuments({ orderId: order.id })).toBe(0);
    } finally {
      await new Promise((resolve) => payServer.close(resolve));
    }
  });

  test('detects concurrent version/paid/providerReferences changes after payOS check even without expectedVersion, keeping order and hold unchanged', async () => {
    const order = await placeOrder('a', { receiveMethod: 'DELIVERY', paymentMethod: 'PREPAID', quantity: 2 });
    await models.ProductOrder.updateOne(
      { _id: order.id },
      { $set: { 'payment.providerReferences': ['888001'] }, $inc: { version: 1 } }
    );
    const service = createProductOrderService({
      connection,
      payments: {
        async settleIfPaid(target) {
          // Simulate a concurrent payment-link or payment update happening between payOS check and cancel transaction
          await models.ProductOrder.updateOne(
            { _id: target._id },
            { $push: { 'payment.providerReferences': '888002' }, $inc: { version: 1 } }
          );
          return 'UNPAID';
        }
      }
    });

    await expect(service.cancel(
      { ...actors.a, expiresAt: Date.now() + 60000 },
      order.id,
      {},
      idem()
    )).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });

    const stored = await models.ProductOrder.findById(order.id).lean();
    expect(stored.status).toBe('PLACED');
    expect((await models.Product.findOne({ code: 'SP-CAN-01' }).lean()).quantityHeld).toBe(2);
  });
});
