import { test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/models/product.model.js', () => ({ productSalesModels: c => c.models }));
jest.unstable_mockModule('../../../src/models/pet-care.model.js', () => ({ petCareModels: c => ({ CustomerAddress: c.address }) }));
jest.unstable_mockModule('../../../src/models/user.model.js', () => ({ userModel: c => c.user }));
jest.unstable_mockModule('../../../src/services/notifications/domain-notifications.service.js', () => ({
  createDomainNotifications: ({ connection }) => ({ productOrder: connection.notify })
}));
jest.unstable_mockModule('../../../src/services/product-sales/product-order-code.service.js', () => ({
  createProductOrderCodeService: () => ({ nextCode: async () => 'DH-SYNTHETIC-001' })
}));
const { createProductOrderManagementService } = await import('../../../src/services/product-sales/product-order-management.service.js');

const CUSTOMER = { userId: '111111111111111111111111', roles: ['CUSTOMER'], state: 'ACTIVE' };
const SALE = { userId: '666666666666666666666666', roles: ['SALE_STAFF'], state: 'ACTIVE' };
const PRODUCT = '333333333333333333333333';
const ORDER = '444444444444444444444444';
const ADDRESS = '555555555555555555555555';
const NOW = new Date('2026-11-14T03:00:00.000Z');

// Double lưu thật các thay đổi vào state transaction; không tự áp quy tắc SRS thay target.
function fixture({ stock = 10, held = 2, quantity = 2, emptyCart = false,
  areaCode = 'AREA-A', orderPatch = {} } = {}) {
  let committed = { product: { _id: PRODUCT, code: 'SP-SYNTHETIC', name: 'Hạt tổng hợp',
    sellingPrice: 100000, visible: true, deletedAt: null, stockOnHand: stock, quantityHeld: held, version: 0 },
    cart: { customerId: CUSTOMER.userId, lines: emptyCart ? [] : [{ productId: PRODUCT, quantity }], version: 0 },
    address: { _id: ADDRESS, ownerId: CUSTOMER.userId, state: 'ACTIVE', areaCode,
      label: 'Địa chỉ tổng hợp', location: { type: 'Point', coordinates: [105.8, 21] } },
    orders: [{ _id: ORDER, customerId: CUSTOMER.userId, code: 'DH-SYNTHETIC', channel: 'ONLINE',
      receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP', paid: false, status: 'PLACED', version: 0,
      createdAt: NOW, lines: [{ productId: PRODUCT, productCode: 'SP-SYNTHETIC', productName: 'Hạt tổng hợp',
        quantity: 2, sellingPriceWhenOrdered: 100000 }], subtotal: 200000, shippingFee: 0, total: 200000, ...orderPatch }], refusals: [] };
  function matches(row, filter) {
    if (!row) return false;
    return Object.entries(filter).every(([field, value]) => {
      if (field === '$expr') {
        const [expression, minimum] = value.$gte;
        const [a, b] = expression.$subtract.map(key => row[key.slice(1)]);
        return a - b >= minimum;
      }
      if (field === 'lines.0') return row.lines.length > 0;
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('$ne' in value) return row[field] !== value.$ne;
        if ('$gte' in value) return row[field] >= value.$gte;
        if ('$in' in value) return value.$in.map(String).includes(String(row[field]));
      }
      return String(row[field]) === String(value);
    });
  }
  function patch(row, update) {
    Object.assign(row, update.$set ?? {});
    for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = (row[key] ?? 0) + value;
  }
  function query(read, initialSession) {
    let session = initialSession;
    const q = { session: value => { session = value; return q; }, select: () => q,
      lean: async () => globalThis.structuredClone(read(session?.state ?? committed)),
      then: (resolve, reject) => q.lean().then(resolve, reject) };
    return q;
  }
  const Product = {
    findById: id => query(s => s.product._id === id ? s.product : null),
    findOneAndUpdate: jest.fn((filter, update, { session }) => query(s => {
      if (!matches(s.product, filter)) return null;
      patch(s.product, update); return s.product;
    }, session)),
    updateOne: jest.fn(async (filter, update, { session }) => {
      if (!matches(session.state.product, filter)) return { modifiedCount: 0 };
      patch(session.state.product, update); return { modifiedCount: 1 };
    })
  };
  const ProductOrder = {
    findOne: filter => query(s => s.orders.find(row => matches(row, filter)) ?? null),
    findOneAndUpdate: jest.fn((filter, update, { session }) => query(s => {
      const row = s.orders.find(order => matches(order, filter));
      if (!row) return null;
      patch(row, update); return row;
    }, session)),
    create: jest.fn(async (rows, { session }) => rows.map(row => {
      const saved = { _id: ORDER, version: 0, createdAt: NOW, ...row };
      session.state.orders.push(globalThis.structuredClone(saved));
      return { ...saved, toObject: () => globalThis.structuredClone(saved) };
    }))
  };
  const ProductCart = {
    exists: filter => query(s => matches(s.cart, filter)),
    findOne: filter => query(s => matches(s.cart, filter) ? s.cart : null),
    updateOne: async (filter, update, { session }) => {
      if (matches(session.state.cart, filter)) patch(session.state.cart, update);
    }
  };
  const ProductCustomerRefusal = { create: jest.fn(async (rows, { session }) => {
    session.state.refusals.push(...globalThis.structuredClone(rows)); return rows;
  }) };
  const notify = jest.fn(async () => undefined);
  const connection = { models: { Product, ProductOrder, ProductCart, ProductCustomerRefusal }, notify,
    address: { findOne: filter => query(s => matches(s.address, filter) ? s.address : null) },
    user: { find: () => query(() => [{ _id: CUSTOMER.userId, displayName: 'Khách tổng hợp' }]) },
    transaction: async callback => {
      const session = { state: globalThis.structuredClone(committed) };
      const result = await callback(session); committed = session.state; return result;
    } };
  const phones = { userIdsByPhone: async () => [], phonesOf: async () => new Map() };
  const markDelivered = createProductOrderManagementService({ connection, phones, clock: () => NOW.getTime() }).markDelivered;
  return { markDelivered, state: () => committed, models: connection.models, notify };
}

// SRS: UC-65; III Order Management Delivered; UC-64 Alternative 5.1; GBR-35/36.
test("SHOP-MGMT-04-UTCID01 [N] Giao thành công COD được ghi đã trả, không trừ tồn lần hai", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY',
    status: 'HANDED_TO_CARRIER', paymentMethod: 'COD', paid: false } });
  const actual = await f.markDelivered(SALE, ORDER, {});
  expect(actual).toMatchObject({ status: 'DELIVERED', paid: true });
  expect(f.state().product).toMatchObject({ stockOnHand: 8, quantityHeld: 0 });
});

// SRS: UC-65; III Order Management Delivered; UC-64 Alternative 5.1; GBR-35/36.
test("SHOP-MGMT-04-UTCID02 [N] Giao thành công PREPAID được ghi đã trả, không trừ tồn lần hai", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY',
    status: 'HANDED_TO_CARRIER', paymentMethod: 'PREPAID', paid: true } });
  const actual = await f.markDelivered(SALE, ORDER, {});
  expect(actual).toMatchObject({ status: 'DELIVERED', paid: true });
  expect(f.state().product).toMatchObject({ stockOnHand: 8, quantityHeld: 0 });
});
