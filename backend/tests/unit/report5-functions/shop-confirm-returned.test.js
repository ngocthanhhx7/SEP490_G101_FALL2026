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
const ADMIN = { userId: '222222222222222222222222', roles: ['ADMIN'], state: 'ACTIVE' };
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
  const confirmReturned = createProductOrderManagementService({ connection, phones, clock: () => NOW.getTime() }).confirmReturned;
  return { confirmReturned, state: () => committed, models: connection.models, notify };
}

// SRS: UC-66 Normal 2–5; GBR-35/36; III Order Management return reasons.
test("SHOP-MGMT-06-UTCID01 [N] Xác nhận hoàn CUSTOMER_REFUSED, chỉ cộng hàng bán lại và tính đúng từ chối", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY', status: 'BEING_RETURNED' } });
  const actual = await f.confirmReturned(SALE, ORDER, { reason: 'CUSTOMER_REFUSED',
    lines: [{ productId: PRODUCT, resellableQuantity: 1 }] });
  expect(actual).toMatchObject({ status: 'RETURNED', returnReason: 'CUSTOMER_REFUSED' });
  expect(f.state().product).toMatchObject({ stockOnHand: 9, quantityHeld: 0 });
  expect(f.state().refusals).toHaveLength(1);
});

// SRS: UC-66 Normal 2–5; GBR-35/36; III Order Management return reasons.
test("SHOP-MGMT-06-UTCID02 [N] Xác nhận hoàn CARRIER_UNDELIVERABLE, chỉ cộng hàng bán lại và tính đúng từ chối", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY', status: 'BEING_RETURNED' } });
  const actual = await f.confirmReturned(SALE, ORDER, { reason: 'CARRIER_UNDELIVERABLE',
    lines: [{ productId: PRODUCT, resellableQuantity: 1 }] });
  expect(actual).toMatchObject({ status: 'RETURNED', returnReason: 'CARRIER_UNDELIVERABLE' });
  expect(f.state().product).toMatchObject({ stockOnHand: 9, quantityHeld: 0 });
  expect(f.state().refusals).toHaveLength(0);
});

// SRS: UC-66 Normal 2–5; GBR-35/36; III Order Management return reasons.
test("SHOP-MGMT-06-UTCID03 [N] Xác nhận hoàn SHOP_FAULT, chỉ cộng hàng bán lại và tính đúng từ chối", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY', status: 'BEING_RETURNED' } });
  const actual = await f.confirmReturned(SALE, ORDER, { reason: 'SHOP_FAULT',
    lines: [{ productId: PRODUCT, resellableQuantity: 1 }] });
  expect(actual).toMatchObject({ status: 'RETURNED', returnReason: 'SHOP_FAULT' });
  expect(f.state().product).toMatchObject({ stockOnHand: 9, quantityHeld: 0 });
  expect(f.state().refusals).toHaveLength(0);
});

// SRS: UC-66 Normal 2/4; III Order Management quantity 0..returned; MSG104.
test("SHOP-MGMT-06-UTCID04 [B] Lượng bán lại 0 so với tổng trả về 2", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY', status: 'BEING_RETURNED' } });
  const request = { reason: 'SHOP_FAULT', lines: [{ productId: PRODUCT, resellableQuantity: 0 }] };
  await f.confirmReturned(SALE, ORDER, request);
  expect(f.state().product.stockOnHand).toBe(8);
});

// SRS: UC-66 Normal 2/4; III Order Management quantity 0..returned; MSG104.
test("SHOP-MGMT-06-UTCID05 [B] Lượng bán lại 2 so với tổng trả về 2", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY', status: 'BEING_RETURNED' } });
  const request = { reason: 'SHOP_FAULT', lines: [{ productId: PRODUCT, resellableQuantity: 2 }] };
  await f.confirmReturned(SALE, ORDER, request);
  expect(f.state().product.stockOnHand).toBe(10);
});

// SRS: UC-66 Normal 2/4; III Order Management quantity 0..returned; MSG104.
test("SHOP-MGMT-06-UTCID06 [B] Lượng bán lại 3 so với tổng trả về 2", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY', status: 'BEING_RETURNED' } });
  const request = { reason: 'SHOP_FAULT', lines: [{ productId: PRODUCT, resellableQuantity: 3 }] };
  await expect(f.confirmReturned(SALE, ORDER, request)).rejects.toMatchObject({ code: 'RESELLABLE_QUANTITY_INVALID' });
  expect(f.state().product.stockOnHand).toBe(8);
  expect(f.state().orders[0].status).toBe('BEING_RETURNED');
});

// SRS: UC-66 Normal 2/4; III Order Management quantity 0..returned; MSG104.
test("SHOP-MGMT-06-UTCID07 [B] Lượng bán lại -1 so với tổng trả về 2", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY', status: 'BEING_RETURNED' } });
  const request = { reason: 'SHOP_FAULT', lines: [{ productId: PRODUCT, resellableQuantity: -1 }] };
  await expect(f.confirmReturned(SALE, ORDER, request)).rejects.toMatchObject({ code: 'RESELLABLE_QUANTITY_INVALID' });
  expect(f.state().product.stockOnHand).toBe(8);
  expect(f.state().orders[0].status).toBe('BEING_RETURNED');
});

// SRS: UC-66 Alternative 1.1; GBR-35.
test("SHOP-MGMT-06-UTCID08 [A] Không xác nhận hoàn hai lần cho cùng đơn", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY', status: 'BEING_RETURNED' } });
  const request = { reason: 'CUSTOMER_REFUSED', lines: [{ productId: PRODUCT, resellableQuantity: 1 }] };
  await f.confirmReturned(SALE, ORDER, request);
  await expect(f.confirmReturned(SALE, ORDER, request)).rejects.toMatchObject({ code: 'ORDER_STATE_CONFLICT' });
  expect(f.state().product.stockOnHand).toBe(9);
  expect(f.state().refusals).toHaveLength(1);
});

// SRS: UC-66 Normal 6; GBR-37.
test("SHOP-MGMT-06-UTCID09 [N] Đơn prepaid đã trả khi hoàn được đánh dấu refund", async () => {
  const f = fixture({ stock: 8, held: 0, orderPatch: { receiveMethod: 'DELIVERY',
    status: 'BEING_RETURNED', paymentMethod: 'PREPAID', paid: true } });
  const actual = await f.confirmReturned(ADMIN, ORDER, { reason: 'CARRIER_UNDELIVERABLE',
    lines: [{ productId: PRODUCT, resellableQuantity: 2 }] });
  expect(actual).toMatchObject({ status: 'RETURNED', refundMarked: true });
  expect(f.state().product.stockOnHand).toBe(10);
  // Chỉ refund mark; không tính số tiền hoàn hoặc chuyển tiền kế toán.
});
