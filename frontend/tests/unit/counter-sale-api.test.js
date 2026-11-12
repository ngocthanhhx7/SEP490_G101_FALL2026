import { createCounterSaleApi } from '../../src/services/counter-sale-api.js';
const line = { productId: 'p1', productCode: 'SP-0001', productName: 'Synthetic', quantity: 1, unitPrice: 120000, lineTotal: 120000 };
const order = { id: 'o1', code: 'DH-0001', channel: 'COUNTER', status: 'AWAITING_PAYMENT', paid: false, customer: null,
  receiveMethod: 'COUNTER', paymentMethod: 'COUNTER_CASH', lines: [line], subtotal: 120000, total: 120000, tierDiscount: 0 };
const response = data => ({ ok: true, status: 200, json: async () => ({ data, meta: { schemaVersion: 1 } }) });
test('customer lookup is a CSRF protected POST body and never places contact in the URL', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response({ customer: { id: 'c1', displayName: 'Synthetic' } }));
  const api = createCounterSaleApi({ fetchImpl, getCsrfToken: () => 'synthetic-token' });
  await api.lookup('synthetic@example.test');
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toBe('/api/v1/admin/counter-orders/customer-lookups');
  expect(options.method).toBe('POST'); expect(JSON.parse(options.body)).toEqual({ contact: 'synthetic@example.test' });
  expect(options.headers.get('X-CSRF-Token')).toBe('synthetic-token');
});
test('creation sends the stable command key and only product quantities plus optional customer', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(order));
  const api = createCounterSaleApi({ fetchImpl, getCsrfToken: () => 'synthetic-token' });
  const body = { lines: [{ productId: 'p1', quantity: 1 }], customerId: 'c1' };
  expect(await api.create(body, 'synthetic-command')).toEqual(order);
  const options = fetchImpl.mock.calls[0][1]; expect(options.headers.get('Idempotency-Key')).toBe('synthetic-command');
  expect(JSON.parse(options.body)).toEqual(body);
});
test.each([
  { ...order, status: 'PLACED' }, { ...order, channel: 'ONLINE' }, { ...order, total: 1.5 },
  { ...order, tierDiscount: 100 }, { ...order, paid: true, cashPayment: null },
  { ...order, paid: true, cashPayment: { amount: 119000, receivedAt: '2026-11-08T03:20:00Z', receivedBy: 'a1' } },
  { ...order, lines: [{ ...line, quantity: 0 }] }, { ...order, customer: {} }
])('rejects incompatible or unsafe order data %j', async data => {
  const api = createCounterSaleApi({ fetchImpl: async () => response(data) });
  await expect(api.read('o1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
test('open order and product paging retain backend totals even on an empty page', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response({ items: [], page: 2, limit: 20, total: 21 }));
  const api = createCounterSaleApi({ fetchImpl });
  expect(await api.openOrders({ page: 2 })).toEqual({ data: [], meta: { page: { page: 2, limit: 20, total: 21 } } });
  await api.products({ search: 'hạt & dây', page: 2 }); expect(fetchImpl.mock.calls[1][0]).toContain('search=h%E1%BA%A1t+%26+d%C3%A2y');
});
test('cash, complete and cancel use separate commands and send no amount or stock', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(order));
  const api = createCounterSaleApi({ fetchImpl, getCsrfToken: () => 'synthetic-token' });
  await api.recordCash('o1'); await api.complete('o1'); await api.cancel('o1');
  expect(fetchImpl.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['record-cash', 'complete', 'cancel']);
  expect(fetchImpl.mock.calls.every(([, options]) => options.body === '{}' && options.method === 'POST')).toBe(true);
});
