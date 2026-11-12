import { createStockListApi } from '../../src/services/stock-list-api.js';

const product = { id: 'p1', code: 'SP-0001', name: 'Synthetic', stockOnHand: 12, quantityHeld: 2, available: 10, status: 'LOW_STOCK' };
const data = { items: [product], page: 1, limit: 20, total: 1, counts: { ALL: 1, LOW_STOCK: 1 } };
const history = { product, items: [{ id: 'r1', kind: 'GOODS_RECEIPT', referenceCode: 'PN-0001', occurredAt: '2026-11-08T00:00:00Z',
  receivedOn: '2026-11-01', supplierName: 'Synthetic supplier', quantityChange: 0 }], nextCursor: null };
const response = value => ({ ok: true, status: 200, json: async () => ({ data: value, meta: { schemaVersion: 1 } }) });

test('transports stock filters, paging, history cursor and AbortSignal; keeps server status without inferring a threshold', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(data));
  const api = createStockListApi({ fetchImpl });
  const signal = new AbortController().signal;
  const result = await api.listStock({ tab: 'LOW_STOCK', search: 'Hạt & cá', page: 2, limit: 20 }, { signal });
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/admin/stock-levels?tab=LOW_STOCK&search=H%E1%BA%A1t+%26+c%C3%A1&page=2&limit=20');
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(false);
  expect(result.data).toEqual([product]);
  expect(result.meta).toMatchObject({ page: { page: 1, limit: 20, total: 1 }, counts: data.counts });
  await api.listStock(); expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/admin/stock-levels');
  fetchImpl.mockResolvedValue(response(history));
  expect(await api.readHistory('p1', { limit: 20, cursor: 'abc_-', signal })).toEqual(history);
  expect(fetchImpl.mock.calls[2][0]).toBe('/api/v1/admin/stock-levels/p1/history?limit=20&cursor=abc_-');
  await api.readHistory('p1'); expect(fetchImpl.mock.calls[3][0]).toBe('/api/v1/admin/stock-levels/p1/history');
});

test('propagates cancellation to an in-flight fetch', async () => {
  const controller = new AbortController();
  let forwardedSignal;
  const fetchImpl = jest.fn((_url, options) => new Promise((_resolve, reject) => {
    forwardedSignal = options.signal;
    options.signal.addEventListener('abort', () => reject(new Error('cancelled')));
  }));
  const pending = createStockListApi({ fetchImpl }).readHistory('p1', { signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  expect(forwardedSignal.aborted).toBe(true);
});

test('rejects malformed stock and history DTOs and an id that tries to leave the path', async () => {
  const invalid = 'INVALID_RESPONSE';
  for (const value of [null, { ...data, items: null }, { ...data, page: 0 }, { ...data, total: -1 }, { ...data, counts: {} },
    ...[{ ...product, status: 'UNKNOWN' }, { ...product, available: '10' }, { ...product, stockOnHand: -1 }, { ...product, name: '' }].map(p => ({ ...data, items: [p] }))]) {
    const api = createStockListApi({ fetchImpl: jest.fn().mockResolvedValue(response(value)) });
    await expect(api.listStock()).rejects.toMatchObject({ code: invalid });
  }
  for (const value of [null, { ...history, nextCursor: 12 }, { ...history, product: null }, { ...history, items: null },
    ...[{ ...history.items[0], kind: 'ORDER' }, { ...history.items[0], quantityChange: 1.2 },
      { ...history.items[0], receivedOn: 'bad' }, { ...history.items[0], occurredAt: 'bad' }].map(item => ({ ...history, items: [item] }))]) {
    const api = createStockListApi({ fetchImpl: jest.fn().mockResolvedValue(response(value)) });
    await expect(api.readHistory('p1')).rejects.toMatchObject({ code: invalid });
  }
  const fetchImpl = jest.fn();
  await expect(createStockListApi({ fetchImpl }).readHistory('a/b')).rejects.toMatchObject({ code: 'INVALID_API_PATH' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
