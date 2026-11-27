import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { createSessionService } from '../../src/services/session.service.js';
import { userModel } from '../../src/models/user.model.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { systemSettingVersionModel } from '../../src/models/system-setting-version.model.js';

let replica;
let connection;
let app;
let nowMs;
let customerSession;
let otherCustomerSession;
let saleSession;
let adminSession;
let models;

const oid = () => new mongoose.Types.ObjectId();
const col = name => connection.db.collection(name);
const baseHeaders = { Host: '127.0.0.1', Origin: 'http://127.0.0.1' };
const authHeaders = (session, key) => ({
  ...baseHeaders,
  Cookie: `pwc_session=${session.token}`,
  'X-CSRF-Token': session.csrfToken,
  ...(key ? { 'Idempotency-Key': key } : {})
});

const env = {
  NODE_ENV: 'test',
  AUTH_ENABLED: 'true',
  PRODUCT_SALES_ENABLED: 'true',
  R2_ENABLED: 'true',
  R2_ACCOUNT_ID: '0'.repeat(32),
  R2_BUCKET: 'pwc-r53-test',
  R2_ACCESS_KEY_ID: '1'.repeat(32),
  R2_SECRET_ACCESS_KEY: '2'.repeat(64),
  SESSION_TOKEN_SECRET: 'a'.repeat(48),
  SESSION_CSRF_SECRET: 'b'.repeat(48),
  OTP_HMAC_SECRET: 'c'.repeat(48),
  CONTACT_LOOKUP_SECRET: 'd'.repeat(48),
  CONTACT_ENCRYPTION_KEY: 'e'.repeat(32)
};

const memoryMedia = new Map();
const fakePrivateMedia = {
  async upload({ storageRef, body, contentType }) {
    memoryMedia.set(storageRef, { body, contentType });
  },
  async read({ storageRef }) {
    const stored = memoryMedia.get(storageRef);
    if (!stored) throw new Error('missing');
    return stored;
  }
};

async function createActorSession(sessions, displayName, roles) {
  const user = await userModel(connection).create({ displayName, roles, state: 'ACTIVE' });
  return connection.transaction(session => sessions.issueInTransaction(user, session));
}

async function seedProduct({ code = 'SP-001', name = 'Hạt khô cao cấp', sellingPrice = 120000, stockOnHand = 5, quantityHeld = 0 } = {}) {
  return models.Product.create({
    code,
    name,
    category: 'FOOD',
    petType: 'DOG',
    sellingPrice,
    stockOnHand,
    quantityHeld,
    visible: true
  });
}

async function seedDeliveredOrder({ customerId, product, quantity = 2, status = 'DELIVERED', receiveMethod = 'DELIVERY', deliveredAt }) {
  const subtotal = product.sellingPrice * quantity;
  return models.ProductOrder.create({
    code: `DH-${Math.floor(Math.random() * 9000 + 1000)}`,
    channel: 'ONLINE',
    customerId: new mongoose.Types.ObjectId(customerId),
    lines: [{
      productId: product._id,
      productCode: product.code,
      productName: product.name,
      quantity,
      sellingPriceWhenOrdered: product.sellingPrice,
      unitDiscount: 0
    }],
    receiveMethod,
    subtotal,
    shippingFee: 0,
    total: subtotal,
    paymentMethod: 'COD',
    paid: true,
    status,
    deliveredAt,
    idempotencyKey: `order-${oid()}`,
    requestFingerprint: 'f'.repeat(64)
  });
}

async function seedCustomerPhoto(customerId, photoId) {
  const body = Buffer.from('fake-jpeg-bytes');
  const { createHash } = await import('node:crypto');
  const contentDigest = createHash('sha256').update(body).digest('hex');
  const storageRef = `private-images/${photoId}`;
  memoryMedia.set(storageRef, { body, contentType: 'image/jpeg' });
  await col('privateimages').insertOne({
    _id: photoId,
    ownerId: new mongoose.Types.ObjectId(customerId),
    storageRef,
    state: 'READY',
    contentDigest,
    byteLength: body.length,
    contentType: 'image/jpeg'
  });
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  env.MONGO_URI = replica.getUri();
  env.MONGO_DB = 'faulty_product_claims_test';
  const config = loadConfig(env);
  connection = await mongoose.createConnection(replica.getUri(), { dbName: env.MONGO_DB }).asPromise();
  nowMs = Date.parse('2026-11-27T04:00:00.000Z');
  app = createApp({
    config,
    connection,
    env,
    clock: () => nowMs,
    portOverrides: { privateMedia: fakePrivateMedia },
    lifecycle: { draining: false }
  });
  models = productSalesModels(connection);
  systemSettingVersionModel(connection);
  for (const model of Object.values(connection.models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  const sessions = createSessionService({
    connection,
    clock: () => nowMs,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });
  customerSession = await createActorSession(sessions, 'Khách Hàng 01', ['CUSTOMER']);
  otherCustomerSession = await createActorSession(sessions, 'Khách Hàng 02', ['CUSTOMER']);
  saleSession = await createActorSession(sessions, 'Sale Staff 01', ['SALE_STAFF']);
  adminSession = await createActorSession(sessions, 'Admin 01', ['ADMIN']);
}, 180000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});

beforeEach(async () => {
  nowMs = Date.parse('2026-11-27T04:00:00.000Z');
  memoryMedia.clear();
  for (const name of [
    'products', 'productorders', 'faultyproductclaims', 'productcounters',
    'stockadjustments', 'goodsreceipts', 'notifications', 'privateimages',
    'systemsettingversions'
  ]) {
    await col(name).deleteMany({});
  }
});

test('ST-ORD-14 full exchange flow: submit, MSG107/MSG108, Admin approve exchange, exchange-sent deducts stock once & writes FAULTY_EXCHANGE history without StockAdjustment', async () => {
  // Admin can read default 7 days and update setting to 10 days; non-admin gets 403
  await request(app)
    .put('/api/v1/system-settings/faulty-product-report-days')
    .set(authHeaders(saleSession))
    .send({ expectedVersion: 0, days: 10 })
    .expect(403);
  const defaultSetting = await request(app)
    .get('/api/v1/system-settings/faulty-product-report-days')
    .set(authHeaders(adminSession))
    .expect(200);
  expect(defaultSetting.body.data.days).toBe(7);

  const savedSetting = await request(app)
    .put('/api/v1/system-settings/faulty-product-report-days')
    .set(authHeaders(adminSession))
    .send({ expectedVersion: 0, days: 10 })
    .expect(200);
  expect(savedSetting.body.data.days).toBe(10);

  const product = await seedProduct({ stockOnHand: 5, quantityHeld: 1, sellingPrice: 120000 });
  const order = await seedDeliveredOrder({
    customerId: customerSession.user.id,
    product,
    quantity: 2,
    deliveredAt: new Date(nowMs - 2 * 86_400_000)
  });
  const photoId = 'a'.repeat(64);
  await seedCustomerPhoto(customerSession.user.id, photoId);

  // Role isolation: customer cannot access admin claims routes
  await request(app).get('/api/v1/admin/faulty-product-claims').set(authHeaders(customerSession)).expect(403);
  await request(app).get(`/api/v1/product-orders/${order._id}/faulty-claim-eligibility`).set(authHeaders(otherCustomerSession)).expect(404);

  // Customer eligibility & submit claim
  const elig = await request(app)
    .get(`/api/v1/product-orders/${order._id}/faulty-claim-eligibility`)
    .set(authHeaders(customerSession))
    .expect(200);
  expect(elig.body.data.eligible).toBe(true);
  expect(elig.body.data.reportDays).toBe(10);

  const submitted = await request(app)
    .post(`/api/v1/product-orders/${order._id}/faulty-claims`)
    .set(authHeaders(customerSession, 'claim-submit-001'))
    .send({
      productId: String(product._id),
      quantity: 2,
      problemType: 'FAULTY_PRODUCT',
      description: 'Túi hạt bị rách niêm phong',
      photoIds: [photoId]
    })
    .expect(201);
  const claim = submitted.body.data;
  expect(claim.status).toBe('WAITING_CHECK');
  expect(claim.refundEstimateVnd).toBe(240000);

  // Sale Staff notification inbox loads cleanly (no SENSITIVE_KEY crash) & dashboard counts claim
  const saleNotifs = await request(app).get('/api/v1/notifications').set(authHeaders(saleSession)).expect(200);
  expect(saleNotifs.body.data.items.some(item => item.eventType === 'FaultyProductClaimSubmitted')).toBe(true);
  const dash = await request(app).get('/api/v1/dashboards/sale-staff').set(authHeaders(saleSession)).expect(200);
  expect(dash.body.data.counts.CLAIMS_TO_CHECK).toBe(1);

  // Sale Staff can read the claim photo
  await request(app)
    .get(`/api/v1/admin/faulty-product-claims/${claim.id}/photos/${photoId}`)
    .set(authHeaders(saleSession))
    .expect(200);

  // Sale Staff tries to send without inspection result -> MSG107 (422 INSPECTION_RESULT_REQUIRED)
  const emptyInspect = await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claim.id}/inspect`)
    .set(authHeaders(saleSession))
    .send({ expectedVersion: 0, inspectionResult: '   ' })
    .expect(422);
  expect(emptyInspect.body.error.code).toBe('INSPECTION_RESULT_REQUIRED');

  // Sale Staff submits inspection result -> WAITING_ADMIN
  const inspected = await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claim.id}/inspect`)
    .set(authHeaders(saleSession))
    .send({ expectedVersion: 0, inspectionResult: 'Ảnh cho thấy túi bị rách đúng như khách báo.' })
    .expect(200);
  expect(inspected.body.data.status).toBe('WAITING_ADMIN');

  // Sale Staff cannot decide (Admin only)
  await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claim.id}/decide`)
    .set(authHeaders(saleSession))
    .send({ expectedVersion: 1, decision: 'EXCHANGE' })
    .expect(403);

  // Admin approves exchange -> EXCHANGE_APPROVED
  const decided = await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claim.id}/decide`)
    .set(authHeaders(adminSession))
    .send({ expectedVersion: 1, decision: 'EXCHANGE', note: 'Đổi mới 2 túi cùng loại' })
    .expect(200);
  expect(decided.body.data.status).toBe('EXCHANGE_APPROVED');
  expect(decided.body.data.canSendExchange).toBe(true); // available = 5 - 1 = 4 >= 2

  // Sale Staff clicks "Đã gửi hàng đổi" -> stockOnHand 5 -> 3 (quantityHeld stays 1)
  const sent = await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claim.id}/exchange-sent`)
    .set(authHeaders(saleSession))
    .send({ expectedVersion: 2 })
    .expect(200);
  expect(sent.body.data.status).toBe('EXCHANGE_SENT');
  expect(sent.body.data.exchangeSentByName).toBe('Sale Staff 01');

  // Clicking "Đã gửi hàng đổi" a second time MUST NOT deduct stock twice
  const duplicate = await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claim.id}/exchange-sent`)
    .set(authHeaders(saleSession))
    .send({ expectedVersion: 2 })
    .expect(409);
  expect(duplicate.body.error.code).toBe('EXCHANGE_ALREADY_SENT');

  // Verify stockOnHand deducted exactly once, no StockAdjustment created, stock history shows FAULTY_EXCHANGE
  const dbProduct = await models.Product.findById(product._id).lean();
  expect(dbProduct.stockOnHand).toBe(3);
  expect(dbProduct.quantityHeld).toBe(1);
  expect(await models.StockAdjustment.countDocuments()).toBe(0);

  const history = await request(app)
    .get(`/api/v1/admin/stock-levels/${product._id}/history`)
    .set(authHeaders(saleSession))
    .expect(200);
  const exchangeRow = history.body.data.items.find(row => row.kind === 'FAULTY_EXCHANGE');
  expect(exchangeRow).toMatchObject({
    kind: 'FAULTY_EXCHANGE',
    referenceCode: claim.code,
    quantityChange: -2,
    recorderName: 'Sale Staff 01'
  });

  // Customer inbox received notifications cleanly
  const custNotifs = await request(app).get('/api/v1/notifications').set(authHeaders(customerSession)).expect(200);
  expect(custNotifs.body.data.items.some(item => item.eventType === 'FaultyProductClaimDecided')).toBe(true);
  expect(custNotifs.body.data.items.some(item => item.eventType === 'FaultyProductExchangeSent')).toBe(true);
});

test('deadline enforcement (MSG61), refund amount read-only, reject, and insufficient stock switch to refund (GBR-35, GBR-49)', async () => {
  const product = await seedProduct({ code: 'SP-002', sellingPrice: 85000, stockOnHand: 2, quantityHeld: 1 }); // available = 1
  const photoId = 'b'.repeat(64);
  await seedCustomerPhoto(customerSession.user.id, photoId);

  // 1. Expired order (delivered 8 days ago, default limit 7 days) -> blocked with CLAIM_DEADLINE_PASSED
  const expiredOrder = await seedDeliveredOrder({
    customerId: customerSession.user.id,
    product,
    quantity: 1,
    deliveredAt: new Date(nowMs - 8 * 86_400_000)
  });
  const eligExpired = await request(app)
    .get(`/api/v1/product-orders/${expiredOrder._id}/faulty-claim-eligibility`)
    .set(authHeaders(customerSession))
    .expect(200);
  expect(eligExpired.body.data.eligible).toBe(false);
  expect(eligExpired.body.data.reason).toBe('CLAIM_DEADLINE_PASSED');
  expect(eligExpired.body.data.deadlineDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

  const submitExpired = await request(app)
    .post(`/api/v1/product-orders/${expiredOrder._id}/faulty-claims`)
    .set(authHeaders(customerSession, 'claim-expired-001'))
    .send({
      productId: String(product._id),
      quantity: 1,
      problemType: 'WRONG_PRODUCT',
      photoIds: [photoId]
    })
    .expect(409);
  expect(submitExpired.body.error.code).toBe('CLAIM_DEADLINE_PASSED');

  // 2. Approved exchange with insufficient available stock (need 2, available 1) -> exchange-sent blocked, Admin switches to REFUND
  const activeOrder = await seedDeliveredOrder({
    customerId: customerSession.user.id,
    product,
    quantity: 2,
    status: 'PICKED_UP',
    receiveMethod: 'PICKUP',
    deliveredAt: new Date(nowMs - 1 * 86_400_000)
  });
  const claimRes = await request(app)
    .post(`/api/v1/product-orders/${activeOrder._id}/faulty-claims`)
    .set(authHeaders(customerSession, 'claim-lowstock-001'))
    .send({
      productId: String(product._id),
      quantity: 2,
      problemType: 'WRONG_PRODUCT',
      description: 'Giao nhầm vị',
      photoIds: [photoId]
    })
    .expect(201);
  const claimId = claimRes.body.data.id;

  await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claimId}/inspect`)
    .set(authHeaders(saleSession))
    .send({ expectedVersion: 0, inspectionResult: 'Đã xác nhận giao nhầm vị.' })
    .expect(200);

  const approvedEx = await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claimId}/decide`)
    .set(authHeaders(adminSession))
    .send({ expectedVersion: 1, decision: 'EXCHANGE' })
    .expect(200);
  expect(approvedEx.body.data.canSendExchange).toBe(false); // available 1 < 2

  const blockedSend = await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claimId}/exchange-sent`)
    .set(authHeaders(saleSession))
    .send({ expectedVersion: 2 })
    .expect(409);
  expect(blockedSend.body.error.code).toBe('EXCHANGE_INSUFFICIENT_STOCK');
  expect((await models.Product.findById(product._id).lean()).stockOnHand).toBe(2);

  // Admin switches approved exchange to refund -> refundAmountVnd = 85000 * 2 = 170000 (read-only)
  const switchedRefund = await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claimId}/decide`)
    .set(authHeaders(adminSession))
    .send({ expectedVersion: 2, decision: 'REFUND', note: 'Hết hàng đổi, chuyển hoàn tiền' })
    .expect(200);
  expect(switchedRefund.body.data.status).toBe('REFUND_APPROVED');
  expect(switchedRefund.body.data.refundAmountVnd).toBe(170000);

  // 3. Reject decision flow
  const claim2 = await request(app)
    .post(`/api/v1/product-orders/${activeOrder._id}/faulty-claims`)
    .set(authHeaders(customerSession, 'claim-reject-001'))
    .send({
      productId: String(product._id),
      quantity: 1,
      problemType: 'FAULTY_PRODUCT',
      description: 'Báo lỗi thử từ chối',
      photoIds: [photoId]
    })
    .expect(201);
  await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claim2.body.data.id}/inspect`)
    .set(authHeaders(saleSession))
    .send({ expectedVersion: 0, inspectionResult: 'Sản phẩm bình thường' })
    .expect(200);
  const rejected = await request(app)
    .post(`/api/v1/admin/faulty-product-claims/${claim2.body.data.id}/decide`)
    .set(authHeaders(adminSession))
    .send({ expectedVersion: 1, decision: 'REJECT', note: 'Không phải lỗi nhà sản xuất' })
    .expect(200);
  expect(rejected.body.data.status).toBe('REJECTED');
  expect(rejected.body.data.refundAmountVnd).toBeNull();
});
