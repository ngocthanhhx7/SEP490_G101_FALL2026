import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { createProductPricingEligibility } from '../../src/services/product-sales/product-pricing-eligibility.service.js';
import { createProductCustomerPriceService } from '../../src/services/product-sales/product-customer-price.service.js';
import { createProductCartService } from '../../src/services/product-sales/product-cart.service.js';
import { createProductOrderService } from '../../src/services/product-sales/product-order.service.js';
import { createCounterCatalogService } from '../../src/services/product-sales/counter-catalog.service.js';
import { createCounterSaleService } from '../../src/services/product-sales/counter-sale.service.js';
import { CUSTOMER_TIER_COLLECTIONS } from '../../src/models/customer-tier.model.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';
import { productSalesRuntimeModules } from '../../src/routes/product-sales.routes.js';
import { registerModules } from '../../src/routes/module-registry.js';
import { errorHandler, requestId } from '../../src/middlewares/http.js';

const oid = () => new mongoose.Types.ObjectId();
const customer = oid(), other = oid(), staff = oid();
const policy = {
  _id: 'current', version: 7, state: 'APPROVED', approvedAt: new Date('2026-11-01'),
  approvedBy: 'synthetic-reviewer', approvalReference: 'synthetic-policy-fixture',
  thresholds: { MEMBER: 0, SILVER: 2000000, GOLD: 5000000 },
  discountsBps: { MEMBER: 0, SILVER: 500, GOLD: 800 }
};
let replica, connection, eligibility;
const col = name => connection.db.collection(name);
const policies = () => col(CUSTOMER_TIER_COLLECTIONS.policies);
const refusals = () => productSalesModels(connection).ProductCustomerRefusal;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_product_tier' }).asPromise();
  eligibility = createProductPricingEligibility({ connection });
  await refusals().createCollection();
  await refusals().createIndexes();
  await col(CUSTOMER_TIER_COLLECTIONS.tiers).insertOne({ _id: customer, tier: 'SILVER' });
  await col('users').insertMany([{ _id: customer, state: 'ACTIVE', roles: ['CUSTOMER'] },
    { _id: other, state: 'ACTIVE', roles: ['CUSTOMER'] },
    { _id: staff, state: 'ACTIVE', roles: ['SALE_STAFF'], displayName: 'Synthetic cashier' }]);
  await col('contacts').insertOne({ userId: customer, channel: 'PHONE', state: 'VERIFIED' });
}, 180000);

beforeEach(async () => {
  await policies().replaceOne({ _id: 'current' }, policy, { upsert: true });
  await col('bookings').deleteMany({});
  await refusals().deleteMany({});
});

afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('AC-10 and AC-11 read approved rates and keep the tier with draft or absent policy', async () => {
  expect(await eligibility.read(customer)).toMatchObject({ tierCode: 'SILVER', tierPolicyVersion: 7, discountBps: 500, prepaidOnly: false });
  expect(await eligibility.read(other)).toMatchObject({ tierCode: 'MEMBER', discountBps: 0 });
  await policies().updateOne({ _id: 'current' }, { $set: { state: 'DRAFT' } });
  expect(await eligibility.read(customer)).toMatchObject({ tierCode: 'SILVER', tierPolicyVersion: null, discountBps: 0 });
  await policies().deleteOne({ _id: 'current' });
  expect(await eligibility.read(customer)).toMatchObject({ tierCode: 'SILVER', tierPolicyVersion: null, discountBps: 0 });
});

test('AC-08 only counts the customer’s own refusals and requires advance payment above L', async () => {
  const rows = Array.from({ length: 3 }, () => ({ customerId: customer, orderId: oid(), reason: 'REFUSED_DELIVERY', occurredAt: new Date() }));
  await refusals().create([...rows.slice(0, 2), { ...rows[2], orderId: oid(), customerId: other }]);
  expect(await eligibility.read(customer)).toMatchObject({ discountBps: 500, prepaidOnly: false });
  await refusals().create(rows[2]);
  const snapshot = await createUnitOfWork(connection).run(session => eligibility.read(customer, { session }));
  expect(snapshot).toMatchObject({ tierCode: 'SILVER', tierPolicyVersion: 7, discountBps: 0, prepaidOnly: true });
  expect(await createProductPricingEligibility({ connection, refusalLimit: '3' }).read(customer))
    .toMatchObject({ discountBps: 500, prepaidOnly: false });
  expect(() => createProductPricingEligibility({ connection, refusalLimit: '2.5' })).toThrow(TypeError);
});

test('AC-11 stored overdue states suppress the discount without limiting payment options', async () => {
  await col('bookings').insertMany([{ customerId: other, paymentState: 'OVERDUE' },
    { customerId: customer, state: 'OVERDUE', paymentState: 'PAID' }]);
  expect(await eligibility.read(customer)).toMatchObject({ discountBps: 500, prepaidOnly: false });
  const stored = await col('bookings').insertOne({ customerId: customer, paymentState: 'OVERDUE' });
  expect(await eligibility.read(customer)).toMatchObject({ tierCode: 'SILVER', discountBps: 0, prepaidOnly: false });
  await col('bookings').updateOne({ _id: stored.insertedId }, { $set: { state: 'OVERDUE' }, $unset: { paymentState: '' } });
  expect(await eligibility.read(customer)).toMatchObject({ tierCode: 'SILVER', discountBps: 0, prepaidOnly: false });
});

test('AC-27 counter quote reads only an active customer with a verified contact', async () => {
  expect(await eligibility.readCounterCustomer()).toMatchObject({ tierCode: null, discountBps: 0, prepaidOnly: false });
  expect(await eligibility.readCounterCustomer(customer)).toMatchObject({ tierCode: 'SILVER', discountBps: 500 });
  await expect(eligibility.readCounterCustomer(other)).rejects.toMatchObject({ code: 'COUNTER_CUSTOMER_UNAVAILABLE' });
  await expect(eligibility.readCounterCustomer(staff)).rejects.toMatchObject({ code: 'COUNTER_CUSTOMER_UNAVAILABLE' });
});

test('AC-11 customer price derives the rate from the authenticated actor and keeps public price', async () => {
  const catalog = { read: async () => ({ sellingPrice: 250000 }) };
  const service = createProductCustomerPriceService({ catalog, eligibility });
  const actor = { userId: String(customer), state: 'ACTIVE', roles: ['CUSTOMER'] };
  expect(await service.read(actor, String(oid()))).toEqual({
    unitPrice: 250000, unitDiscount: 12500, discountedUnitPrice: 237500, tierCode: 'SILVER', discountBps: 500
  });
  await expect(service.read(null, String(oid()))).rejects.toMatchObject({ status: 401 });
  await expect(service.read({ ...actor, roles: ['ADMIN'] }, String(oid()))).rejects.toMatchObject({ status: 403 });
});

test('AC-11 personalized catalog pricing is private and hides unavailable products', async () => {
  const { Product } = productSalesModels(connection);
  const product = await Product.create({
    code: 'SP-9994', name: 'Synthetic food', category: 'FOOD', petType: 'DOG',
    sellingPrice: 250000, visible: true, stockOnHand: 5
  });
  const app = express();
  app.use(requestId);
  registerModules(app, productSalesRuntimeModules({
    connection,
    config: { auth: { enabled: true, contactLookupSecret: 'a'.repeat(32), contactEncryptionKey: 'b'.repeat(32) } },
    env: { PRODUCT_SALES_ENABLED: 'true' },
    sessionService: { verifyCsrf: async () => false, authenticate: async req => {
      const role = req.get('x-test-role');
      return role ? { userId: String(customer), state: 'ACTIVE', roles: [role], expiresAt: Date.now() + 60000 } : null;
    } }
  }));
  app.use(errorHandler(() => {}));
  const path = '/api/v1/products/' + product.id;
  try {
    const publicResult = await request(app).get(path).expect(200);
    expect(publicResult.body.data).toMatchObject({ sellingPrice: 250000 });
    expect(publicResult.body.data).not.toHaveProperty('discountedUnitPrice');
    await request(app).get(path + '/customer-price').expect(401);
    await request(app).get(path + '/customer-price').set('x-test-role', 'SALE_STAFF').expect(403);
    const result = await request(app).get(path + '/customer-price').set('x-test-role', 'CUSTOMER')
      .expect('Cache-Control', 'private, no-store').expect(200);
    expect(result.body.data).toMatchObject({ tierCode: 'SILVER', discountedUnitPrice: 237500 });
    await Product.updateOne({ _id: product._id }, { $set: { visible: false } });
    await request(app).get(path + '/customer-price').set('x-test-role', 'CUSTOMER').expect(404);
  } finally {
    await Product.deleteOne({ _id: product._id });
  }
});

test('AC-08 placing a pickup above L leaves the cart and stock unchanged', async () => {
  const { Product, ProductCart, ProductOrder } = productSalesModels(connection);
  const product = await Product.create({
    code: 'SP-9997', name: 'Synthetic collar', category: 'ACCESSORY', petType: 'DOG',
    sellingPrice: 101, visible: true, stockOnHand: 5, quantityHeld: 0
  });
  const actor = { userId: String(customer), state: 'ACTIVE', roles: ['CUSTOMER'] };
  await refusals().create(Array.from({ length: 3 }, () => ({
    customerId: customer, orderId: oid(), reason: 'REFUSED_DELIVERY', occurredAt: new Date()
  })));
  try {
    const view = await createProductCartService({ connection }).addLine(actor, { productId: String(product._id), quantity: 2 });
    expect(view).toMatchObject({ prepaidOnly: true, subtotal: 202, total: 202 });
    const orders = createProductOrderService({ connection });
    await expect(orders.place(actor, { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, 'synthetic-prepaid-guard'))
      .rejects.toMatchObject({ code: 'PRODUCT_ORDER_PREPAY_REQUIRED', status: 409 });
    expect(await ProductOrder.countDocuments({ customerId: customer })).toBe(0);
    expect((await ProductCart.findOne({ customerId: customer })).lines).toHaveLength(1);
    expect((await Product.findById(product._id)).quantityHeld).toBe(0);
  } finally {
    await ProductCart.deleteOne({ customerId: customer });
    await ProductOrder.deleteMany({ customerId: customer });
    await Product.deleteOne({ _id: product._id });
  }
});

test('AC-10 cart and persisted online order agree and replay keeps the old snapshot', async () => {
  const { Product, ProductCart, ProductOrder } = productSalesModels(connection);
  const product = await Product.create({
    code: 'SP-9996', name: 'Synthetic food', category: 'FOOD', petType: 'DOG',
    sellingPrice: 101, visible: true, stockOnHand: 5
  });
  const actor = { userId: String(customer), state: 'ACTIVE', roles: ['CUSTOMER'] };
  const body = { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' };
  try {
    const cart = await createProductCartService({ connection }).addLine(actor, { productId: String(product._id), quantity: 3 });
    expect(cart).toMatchObject({ tierCode: 'SILVER', subtotal: 303, tierDiscount: 15, total: 288,
      lines: [{ unitPrice: 101, discountedUnitPrice: 96, netLineTotal: 288 }] });
    const orders = createProductOrderService({ connection });
    const key = 'synthetic-tier-snapshot';
    const placed = await orders.place(actor, body, key);
    expect(placed).toMatchObject({ tierCode: 'SILVER', tierPolicyVersion: 7, tierDiscount: cart.tierDiscount,
      subtotal: cart.subtotal, total: cart.total, lines: [{ unitPrice: 101, unitDiscount: 5, lineTotal: 303 }] });
    expect(await ProductOrder.findById(placed.id).lean()).toMatchObject({
      tierCode: 'SILVER', tierPolicyVersion: 7, tierDiscount: 15, lines: [{ sellingPriceWhenOrdered: 101, unitDiscount: 5 }]
    });
    await policies().updateOne({ _id: 'current' }, { $set: { version: 8, 'discountsBps.SILVER': 1000 } });
    await Product.updateOne({ _id: product._id }, { $set: { sellingPrice: 200 } });
    expect(await orders.place(actor, body, key)).toEqual(placed);
    expect(await orders.read(actor, placed.id)).toEqual(placed);
    expect((await Product.findById(product._id)).quantityHeld).toBe(3);
  } finally {
    await ProductCart.deleteOne({ customerId: customer });
    await ProductOrder.deleteMany({ customerId: customer });
    await Product.deleteOne({ _id: product._id });
  }
});

test('AC-27 counter cash records the quoted price and still sells above L without a discount', async () => {
  const { Product, ProductOrder } = productSalesModels(connection);
  const product = await Product.create({
    code: 'SP-9995', name: 'Synthetic toy', category: 'ACCESSORY', petType: 'DOG',
    sellingPrice: 101, visible: true, stockOnHand: 8
  });
  const actor = { userId: String(staff), state: 'ACTIVE', roles: ['SALE_STAFF'] };
  const body = { customerId: String(customer), lines: [{ productId: String(product._id), quantity: 2 }] };
  const catalog = createCounterCatalogService({ connection, eligibility });
  const counter = createCounterSaleService({ connection, eligibility });
  try {
    const quote = await catalog.preview(actor, body);
    expect(quote).toMatchObject({ tierCode: 'SILVER', subtotal: 202, tierDiscount: 10, total: 192 });
    const order = await counter.create(actor, body, 'synthetic-counter-discount');
    expect(order).toMatchObject({ tierCode: 'SILVER', tierPolicyVersion: 7, tierDiscount: 10, total: quote.total });
    expect(await counter.recordCash(actor, order.id, {})).toMatchObject({ cashPayment: { amount: quote.total } });
    await refusals().create(Array.from({ length: 3 }, () => ({
      customerId: customer, orderId: oid(), reason: 'REFUSED_DELIVERY', occurredAt: new Date()
    })));
    const fullPrice = await catalog.preview(actor, body);
    expect(fullPrice).toMatchObject({ tierCode: 'SILVER', tierDiscount: 0, total: 202 });
    const blocked = await counter.create(actor, body, 'synthetic-counter-full-price');
    expect(blocked).toMatchObject({ tierCode: 'SILVER', tierDiscount: 0, total: fullPrice.total });
    expect(await counter.recordCash(actor, blocked.id, {})).toMatchObject({ cashPayment: { amount: 202 } });
  } finally {
    await ProductOrder.deleteMany({ customerId: customer });
    await Product.deleteOne({ _id: product._id });
  }
});
