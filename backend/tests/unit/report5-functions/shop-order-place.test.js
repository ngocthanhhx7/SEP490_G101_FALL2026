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
const { createProductOrderService } = await import('../../../src/services/product-sales/product-order.service.js');

const CUSTOMER = { userId: '111111111111111111111111', roles: ['CUSTOMER'], state: 'ACTIVE' };
const PRODUCT = '333333333333333333333333';
const ORDER = '444444444444444444444444';
const ADDRESS = '555555555555555555555555';
const KEY = 'synthetic-shop-order-01';
const NOW = new Date('2026-11-14T03:00:00.000Z');

// Double lưu thật các thay đổi vào state transaction; không tự áp quy tắc SRS thay target.
function fixture({ stock = 10, held = 0, quantity = 2, emptyCart = false,
  areaCode = 'AREA-A' } = {}) {
  let committed = { product: { _id: PRODUCT, code: 'SP-SYNTHETIC', name: 'Hạt tổng hợp',
    sellingPrice: 100000, visible: true, deletedAt: null, stockOnHand: stock, quantityHeld: held, version: 0 },
    cart: { customerId: CUSTOMER.userId, lines: emptyCart ? [] : [{ productId: PRODUCT, quantity }], version: 0 },
    address: { _id: ADDRESS, ownerId: CUSTOMER.userId, state: 'ACTIVE', areaCode,
      label: 'Địa chỉ tổng hợp', location: { type: 'Point', coordinates: [105.8, 21] } },
    orders: [], refusals: [] };
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
  const place = createProductOrderService({ connection, serviceAreas: [{ code: 'AREA-A' }] }).place;
  return { place, state: () => committed, models: connection.models, notify };
}

// SRS: UC-62 Preconditions / Normal 2–8 / Alternatives 2.1/4.1/7.1; GBR-10/35/36.
test("SHOP-ORDER-01-UTCID01 [N] Đặt pickup giữ hàng và lấy giá server", async () => {
  const f = fixture();
  const actual = await f.place(CUSTOMER, { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, KEY);
  expect(actual).toMatchObject({ status: 'PLACED', paid: false, subtotal: 200000, shippingFee: 0, total: 200000 });
  expect(actual.lines[0]).toMatchObject({ quantity: 2, unitPrice: 100000 });
  expect(f.state().product).toMatchObject({ stockOnHand: 10, quantityHeld: 2 });
  expect(f.state().cart.lines).toEqual([]);
  expect(f.notify).toHaveBeenCalledTimes(1);
});

// SRS: UC-62 Preconditions / Normal 2–8 / Alternatives 2.1/4.1/7.1; GBR-10/35/36.
test("SHOP-ORDER-01-UTCID02 [N] Đặt delivery COD lưu địa chỉ trong khu vực và giữ hàng", async () => {
  const f = fixture();
  const actual = await f.place(CUSTOMER, { receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: ADDRESS }, KEY);
  expect(actual).toMatchObject({ status: 'PLACED', paid: false, receiveMethod: 'DELIVERY',
    deliveryAddress: { areaCode: 'AREA-A', label: 'Địa chỉ tổng hợp' } });
  expect(f.state().product).toMatchObject({ stockOnHand: 10, quantityHeld: 2 });
  // Không xác nhận phí demo 25000 là đúng phí cấu hình khu vực theo SRS.
});

// SRS: UC-62 Preconditions / Normal 2–8 / Alternatives 2.1/4.1/7.1; GBR-10/35/36.
test("SHOP-ORDER-01-UTCID03 [A] Giỏ rỗng không tạo đơn", async () => {
  const f = fixture({ emptyCart: true });
  await expect(f.place(CUSTOMER, { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, KEY))
    .rejects.toMatchObject({ code: 'CART_EMPTY' });
  expect(f.state().orders).toHaveLength(0);
  expect(f.state().product.quantityHeld).toBe(0);
});

// SRS: UC-62 Preconditions / Normal 2–8 / Alternatives 2.1/4.1/7.1; GBR-10/35/36.
test("SHOP-ORDER-01-UTCID04 [B] Đặt vừa bằng tồn có thể bán", async () => {
  const f = fixture({ stock: 5, held: 2, quantity: 3 });
  await f.place(CUSTOMER, { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, KEY);
  expect(f.state().product).toMatchObject({ stockOnHand: 5, quantityHeld: 5 });
  expect(f.state().orders[0].lines[0].quantity).toBe(3);
});

// SRS: UC-62 Preconditions / Normal 2–8 / Alternatives 2.1/4.1/7.1; GBR-10/35/36.
test("SHOP-ORDER-01-UTCID05 [B] Vượt tồn có thể bán một đơn vị thì không đặt đơn", async () => {
  const f = fixture({ stock: 5, held: 2, quantity: 4 });
  await expect(f.place(CUSTOMER, { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, KEY))
    .rejects.toMatchObject({ code: 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE' });
  expect(f.state().orders).toHaveLength(0);
  expect(f.state().product.quantityHeld).toBe(2);
});

// SRS: UC-62 Preconditions / Normal 2–8 / Alternatives 2.1/4.1/7.1; GBR-10/35/36.
test("SHOP-ORDER-01-UTCID06 [B] Không đặt được khi toàn bộ tồn đang giữ", async () => {
  const f = fixture({ stock: 2, held: 2 });
  await expect(f.place(CUSTOMER, { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, KEY))
    .rejects.toMatchObject({ code: 'PRODUCT_OUT_OF_STOCK' });
  expect(f.state().orders).toHaveLength(0);
});

// SRS: UC-62 Preconditions / Normal 2–8 / Alternatives 2.1/4.1/7.1; GBR-10/35/36.
test("SHOP-ORDER-01-UTCID07 [A] Không giao tới địa chỉ ngoài khu vực phục vụ", async () => {
  const f = fixture({ areaCode: 'AREA-B' });
  await expect(f.place(CUSTOMER, { receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: ADDRESS }, KEY))
    .rejects.toMatchObject({ code: 'ADDRESS_OUT_OF_SERVICE_AREA' });
  expect(f.state().orders).toHaveLength(0);
  expect(f.state().product.quantityHeld).toBe(0);
});

// SRS: UC-62 Preconditions / Normal 2–8 / Alternatives 2.1/4.1/7.1; GBR-10/35/36.
test("SHOP-ORDER-01-UTCID08 [A] Delivery phải chọn địa chỉ nhận", async () => {
  const f = fixture();
  await expect(f.place(CUSTOMER, { receiveMethod: 'DELIVERY', paymentMethod: 'COD' }, KEY))
    .rejects.toMatchObject({ code: 'ADDRESS_REQUIRED' });
  expect(f.state().orders).toHaveLength(0);
});

// SRS: UC-62 Preconditions / Normal 2–8 / Alternatives 2.1/4.1/7.1; GBR-10/35/36.
// DEF_SHOP_PREPAID_DELIVERY: giữ kỳ vọng SRS, chạy test bình thường.
test("SHOP-ORDER-01-UTCID09 [N] Cho phép chọn trả trước qua payOS cho delivery", async () => {
  const f = fixture();
  const actual = await f.place(CUSTOMER, { receiveMethod: 'DELIVERY', paymentMethod: 'PREPAID', addressId: ADDRESS }, KEY);
  expect(actual).toMatchObject({ paymentMethod: 'PREPAID', status: 'PLACED' });
  expect(f.state().product.quantityHeld).toBe(2);
});

// SRS: UC-62 Preconditions / Normal 2–8 / Alternatives 2.1/4.1/7.1; GBR-10/35/36.
// DEF_SHOP_PREPAID_PICKUP: giữ kỳ vọng SRS, chạy test bình thường.
test("SHOP-ORDER-01-UTCID10 [N] Cho phép chọn trả trước qua payOS cho pickup", async () => {
  const f = fixture();
  const actual = await f.place(CUSTOMER, { receiveMethod: 'PICKUP', paymentMethod: 'PREPAID' }, KEY);
  expect(actual).toMatchObject({ paymentMethod: 'PREPAID', status: 'PLACED' });
  expect(f.state().product.quantityHeld).toBe(2);
});
