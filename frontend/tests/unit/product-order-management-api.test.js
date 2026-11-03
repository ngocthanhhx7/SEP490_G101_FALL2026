import { createProductOrderManagementApi } from '../../src/services/product-order-management-api.js';

const envelope = (data) => ({ data, meta: { schemaVersion: 1 } });
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
const order = { id: 'o1', code: 'DH-0032', receiveMethod: 'DELIVERY', paymentMethod: 'COD', paid: false, status: 'PLACED', lines: [],
  subtotal: 420000, shippingFee: 25000, total: 445000, customer: { id: 'u1', displayName: 'Hoàng Thị Mai' } };
const counts = { PREPARE: 3, AWAITING_PICKUP: 1, IN_TRANSIT: 2, RETURNING: 1 };

const api = (fetchImpl, getCsrfToken = () => 'csrf-token') => createProductOrderManagementApi({ fetchImpl, getCsrfToken });

test('lists orders with only the filters that are set and keeps the tab counts in meta', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope({ items: [order], counts })));
  const result = await api(fetchImpl).listOrders({ tab: 'PREPARE', search: 'mai' });
  expect(result.data).toEqual([order]);
  expect(result.meta.counts).toEqual(counts);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/admin/product-orders?tab=PREPARE&search=mai');
  await api(fetchImpl).listOrders({ tab: 'ALL', search: '' });
  expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/admin/product-orders');
});

test('rejects a list that does not match the contract', async () => {
  const noCustomer = jest.fn().mockResolvedValue(reply(200, envelope({ items: [{ ...order, customer: undefined }], counts })));
  await expect(api(noCustomer).listOrders()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const noCounts = jest.fn().mockResolvedValue(reply(200, envelope({ items: [order], counts: { PREPARE: 1 } })));
  await expect(api(noCounts).listOrders()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('hands an order to the carrier with CSRF and the tracking code, and validates the returned order', async () => {
  const handed = { ...order, status: 'HANDED_TO_CARRIER', trackingCode: 'VN7290018342' };
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope(handed)));
  expect(await api(fetchImpl).handToCarrier('o1', 'VN7290018342')).toEqual(handed);
  const [path, init] = fetchImpl.mock.calls[0];
  expect(path).toBe('/api/v1/admin/product-orders/o1/hand-to-carrier');
  expect(init.method).toBe('POST');
  expect(init.headers.get('X-CSRF-Token')).toBe('csrf-token');
  expect(JSON.parse(init.body)).toEqual({ trackingCode: 'VN7290018342' });
});

test.each([['markReady', 'mark-ready'], ['recordPayment', 'record-payment'], ['handToCustomer', 'hand-to-customer']])(
  '%s posts an empty body to %s', async (method, action) => {
    const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope(order)));
    await api(fetchImpl)[method]('o1');
    expect(fetchImpl.mock.calls[0][0]).toBe(`/api/v1/admin/product-orders/o1/${action}`);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({});
  });

test('refuses writes until CSRF is ready and surfaces backend error codes', async () => {
  const fetchImpl = jest.fn();
  await expect(api(fetchImpl, () => null).markReady('o1')).rejects.toMatchObject({ code: 'CSRF_NOT_READY' });
  expect(fetchImpl).not.toHaveBeenCalled();
  const conflict = jest.fn().mockResolvedValue(reply(409, { error: { code: 'ORDER_NOT_PAID' }, meta: { schemaVersion: 1 } }));
  await expect(api(conflict).handToCustomer('o1')).rejects.toMatchObject({ code: 'ORDER_NOT_PAID', status: 409 });
});

test('treats an accepted-but-pending answer as an uncertain outcome', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(202, envelope(order)));
  await expect(api(fetchImpl).markReady('o1')).rejects.toMatchObject({ code: 'COMMAND_PENDING' });
});
