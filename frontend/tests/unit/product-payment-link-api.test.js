import { createProductSalesApi } from '../../src/services/product-sales-api.js';

// UC-62 step 7: the shop asks for the payOS page of a prepaid order (GBR-36).
const envelope = (data) => ({ data, meta: { schemaVersion: 1 } });
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
const api = (fetchImpl) => createProductSalesApi({ fetchImpl, getCsrfToken: () => 'csrf-token' });
const order = { id: 'o1', code: 'DH-0001', receiveMethod: 'PICKUP', paymentMethod: 'PREPAID', paid: false, status: 'PLACED',
  paymentDeadlineAt: '2026-11-24T04:00:00.000Z', lines: [], subtotal: 250000, shippingFee: 0, total: 250000 };

test('asks for the payOS page of an order and follows only a payOS checkout address', async () => {
  const good = { checkoutUrl: 'https://pay.payos.vn/web/abc', expiresAt: '2026-11-24T04:00:00.000Z' };
  const fetchImpl = jest.fn().mockResolvedValueOnce(reply(200, envelope(good)))
    .mockResolvedValueOnce(reply(200, envelope({ checkoutUrl: 'https://evil.example/web/abc' })));
  const client = api(fetchImpl);
  expect(await client.createPaymentLink('o 1')).toEqual(good);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/product-orders/o%201/payment-link');
  expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
  expect(fetchImpl.mock.calls[0][1].headers.get('X-CSRF-Token')).toBe('csrf-token');
  await expect(client.createPaymentLink('o1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('passes the server refusal through so the page can show MSG33', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(503, { error: { code: 'PAYMENT_PROVIDER_UNAVAILABLE', message: 'x' } }));
  await expect(api(fetchImpl).createPaymentLink('o1')).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
});

test('accepts a prepaid order with its payment deadline', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(201, envelope(order)));
  const result = await api(fetchImpl).placeOrder({ receiveMethod: 'PICKUP', paymentMethod: 'PREPAID' }, 'product-order:key-0002');
  expect(result).toEqual(order);
});
