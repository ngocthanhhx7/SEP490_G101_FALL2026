import { createProductSalesApi } from '../../src/services/product-sales-api.js';

const envelope = (data) => ({ data, meta: { schemaVersion: 1 } });
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
const product = { id: 'p1', code: 'SP-0012', name: 'Thức ăn', category: 'FOOD', petType: 'DOG', sellingPrice: 250000, available: 3, inStock: true, photos: [] };
const cart = { lines: [{ productId: 'p1', unitPrice: 250000, quantity: 2, lineTotal: 500000, available: 3, purchasable: true, exceedsAvailable: false }],
  lineCount: 1, subtotal: 500000, total: 500000, deliveryFee: 25000, hasUnavailable: false };
const order = { id: 'o1', code: 'DH-0001', receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP', paid: false, status: 'PLACED', lines: [],
  subtotal: 250000, shippingFee: 0, total: 250000 };

function api(fetchImpl, getCsrfToken = () => 'csrf-token') {
  return createProductSalesApi({ fetchImpl, getCsrfToken });
}

test('lists products with only the filters that are set', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope({ items: [product] })));
  const result = await api(fetchImpl).listProducts({ search: 'thức ăn', category: 'FOOD', petType: '' });
  expect(result.data).toEqual([product]);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/products?search=th%E1%BB%A9c+%C4%83n&category=FOOD');
});

test('rejects a product list that does not match the contract', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope({ items: [{ ...product, sellingPrice: 1000.5 }] })));
  await expect(api(fetchImpl).listProducts()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('adds to the cart with CSRF and validates the returned cart', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(201, envelope(cart)));
  expect(await api(fetchImpl).addToCart('p1', 2)).toEqual(cart);
  const [path, init] = fetchImpl.mock.calls[0];
  expect(path).toBe('/api/v1/product-cart/lines');
  expect(init.method).toBe('POST');
  expect(init.headers.get('X-CSRF-Token')).toBe('csrf-token');
  expect(JSON.parse(init.body)).toEqual({ productId: 'p1', quantity: 2 });
});

test('refuses cart writes until CSRF is ready', async () => {
  const fetchImpl = jest.fn();
  await expect(api(fetchImpl, () => null).addToCart('p1', 1)).rejects.toMatchObject({ code: 'CSRF_NOT_READY' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('places an order with the idempotency key and treats 202 as uncertain', async () => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(reply(201, envelope(order))).mockResolvedValueOnce(reply(202, envelope(order)));
  const client = api(fetchImpl);
  expect(await client.placeOrder({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, 'product-order:key-0001')).toEqual(order);
  expect(fetchImpl.mock.calls[0][1].headers.get('Idempotency-Key')).toBe('product-order:key-0001');
  await expect(client.placeOrder({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }, 'product-order:key-0001'))
    .rejects.toMatchObject({ code: 'COMMAND_PENDING' });
});

test('surfaces the backend error code for stock conflicts', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(409, { error: { code: 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE' } }));
  await expect(api(fetchImpl).addToCart('p1', 9)).rejects.toMatchObject({ code: 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE', status: 409 });
});

test('never lets an id escape the cart line path', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope(cart)));
  await expect(api(fetchImpl).removeCartLine('p/1')).rejects.toMatchObject({ code: 'INVALID_API_PATH' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
