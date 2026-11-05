import { createGoodsReceiptApi } from '../../src/services/goods-receipt-api.js';

const envelope = (data) => ({ data, meta: { schemaVersion: 1 } });
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
const line = { productId: 'p12', productCode: 'SP-0012', productName: 'Thức ăn hạt cho chó', quantityReceived: 12, quantityAccepted: 10, quantityRejected: 2, rejectReason: 'Bao bì rách' };
const summary = { id: 'r1', code: 'PN-0001', supplierName: 'Công ty Minh An', receivedOn: '2026-11-04', recordedAt: '2026-11-04T03:00:00.000Z',
  totalReceived: 12, totalAccepted: 10, totalRejected: 2 };
const receipt = { ...summary, supplierId: 's1', recorderName: 'Ngô Thu Hằng', lines: [line] };

const api = (fetchImpl, getCsrfToken = () => 'csrf-token') => createGoodsReceiptApi({ fetchImpl, getCsrfToken });
const rejectsInvalid = async (body, call) => {
  await expect(call(api(jest.fn().mockResolvedValue(reply(200, body))))).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
};

test('lists the suppliers that can be chosen, and the recent receipts', async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce(reply(200, envelope({ items: [{ id: 's1', name: 'Công ty Minh An' }] })))
    .mockResolvedValueOnce(reply(200, envelope({ items: [summary] })));
  expect((await api(fetchImpl).listSuppliers()).data).toEqual([{ id: 's1', name: 'Công ty Minh An' }]);
  expect((await api(fetchImpl).listRecent()).data).toEqual([summary]);
  expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual(['/api/v1/admin/goods-receipts/suppliers', '/api/v1/admin/goods-receipts']);
});

test('searches products with only the set filters, in the call shape of the Admin product list', async () => {
  const product = { id: 'p12', code: 'SP-0012', name: 'Thức ăn hạt cho chó', visible: true };
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope({ items: [product], page: 1, limit: 10, total: 1 })));
  expect((await api(fetchImpl).listProducts({ search: 'thức ăn', page: 2, limit: 10 })).data).toEqual([product]);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/admin/goods-receipts/products?search=th%E1%BB%A9c+%C4%83n&page=2&limit=10');
  await api(fetchImpl).listProducts();
  expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/admin/goods-receipts/products');
});

test('reads one receipt by its code, and a code that tries to leave the path never reaches the network', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope(receipt)));
  expect(await api(fetchImpl).readReceipt('PN-0001')).toEqual(receipt);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/admin/goods-receipts/PN-0001');
  await expect(api(fetchImpl).readReceipt('a/b')).rejects.toMatchObject({ code: 'INVALID_API_PATH' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('saves a receipt with the CSRF token and the Idempotency-Key, and returns the saved receipt', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(201, envelope(receipt)));
  const body = { supplierId: 's1', lines: [{ productId: 'p12', quantityReceived: 12, quantityAccepted: 10, rejectReason: 'Bao bì rách' }] };
  expect(await api(fetchImpl).createReceipt(body, 'goods-receipt:key-1234')).toEqual(receipt);
  const [path, init] = fetchImpl.mock.calls[0];
  expect(path).toBe('/api/v1/admin/goods-receipts');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual(body);
  expect(init.headers['X-CSRF-Token'] ?? init.headers.get?.('X-CSRF-Token')).toBe('csrf-token');
  expect(init.headers['Idempotency-Key'] ?? init.headers.get?.('Idempotency-Key')).toBe('goods-receipt:key-1234');
});

test('a 422 keeps the reasons by field and by line number', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(422, { error: { code: 'VALIDATION_FAILED', fields: { supplierId: 'REQUIRED' },
    lineFields: { 0: { quantityReceived: 'INVALID' } } }, meta: { schemaVersion: 1 } }));
  await expect(api(fetchImpl).createReceipt({ lines: [] })).rejects.toMatchObject({
    code: 'VALIDATION_FAILED', status: 422, fields: { supplierId: 'REQUIRED' }, lineFields: { 0: { quantityReceived: 'INVALID' } } });
});

test('rejects answers that do not match the contract', async () => {
  const items = (list) => envelope({ items: list });
  await rejectsInvalid(envelope({ items: 'x' }), (a) => a.listSuppliers());
  await rejectsInvalid(items([{ id: 's1' }]), (a) => a.listSuppliers());
  await rejectsInvalid(items([{ id: '', name: 'x' }]), (a) => a.listSuppliers());
  await rejectsInvalid(envelope({ items: 'x' }), (a) => a.listProducts());
  await rejectsInvalid(items([{ id: 'p', code: 'SP-1', name: 'x', visible: 'yes' }]), (a) => a.listProducts());
  await rejectsInvalid(envelope({ items: 'x' }), (a) => a.listRecent());
  for (const bad of [{ ...summary, code: 'PN-1' }, { ...summary, totalRejected: -1 }, { ...summary, supplierName: '' }, { ...summary, id: undefined }, null]) {
    await rejectsInvalid(items([bad]), (a) => a.listRecent());
  }
  for (const bad of [{ ...receipt, lines: 'x' }, { ...receipt, supplierId: '' }, { ...receipt, recorderName: 5 },
    { ...receipt, lines: [{ ...line, quantityAccepted: 1.5 }] }, { ...receipt, lines: [{ ...line, rejectReason: null }] }, { ...receipt, lines: [null] }]) {
    await rejectsInvalid(envelope(bad), (a) => a.readReceipt('PN-0001'));
    await rejectsInvalid(envelope(bad), (a) => a.createReceipt({}));
  }
});
