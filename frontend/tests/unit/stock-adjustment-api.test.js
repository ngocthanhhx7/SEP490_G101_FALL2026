import { createStockAdjustmentApi } from '../../src/services/stock-adjustment-api.js';
const product = { id:'p1', code:'SP-0001', name:'Synthetic', visible:false, stockOnHand:9, quantityHeld:1, available:8 };
const adjustment = { id:'a1', code:'DC-0001', productId:'p1', productCode:'SP-0001', productName:'Synthetic', type:'DECREASE', quantity:2,
  quantityChange:-2, reason:'DAMAGED', recorderId:'u1', recorderName:'Synthetic Admin', recordedAt:'2026-11-08T03:00:00.000Z' };
const reply = data => ({ ok:true, status:200, json:async () => ({ data, meta:{ schemaVersion:1 } }) });
const page = items => ({ items,page:1,limit:20,total:21 });
test('transports picker/read/list and saves only the adjustment command with CSRF and replay key', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(page([product])));
  const api = createStockAdjustmentApi({ fetchImpl, getCsrfToken:()=>'synthetic-csrf' });
  const listed = await api.listProducts({ search:'Hạt & cá',page:2,limit:10 });
  expect(listed.data).toEqual([product]); expect(listed.meta.page.total).toBe(21);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/admin/stock-adjustments/products?search=H%E1%BA%A1t+%26+c%C3%A1&page=2&limit=10');
  await api.listProducts(); expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/admin/stock-adjustments/products');
  fetchImpl.mockResolvedValue(reply(product)); expect(await api.readProduct('p1')).toEqual(product);
  fetchImpl.mockResolvedValue(reply(page([adjustment]))); expect((await api.listAdjustments({ page:2,limit:20 })).data).toEqual([adjustment]);
  await api.listAdjustments();
  fetchImpl.mockResolvedValue(reply(adjustment));
  const body={productId:'p1',type:'DECREASE',quantity:2,reason:'DAMAGED'};
  expect(await api.createAdjustment(body,'synthetic-command')).toEqual(adjustment);
  const [url,options]=fetchImpl.mock.calls.at(-1);
  expect(url).toBe('/api/v1/admin/stock-adjustments'); expect(options.method).toBe('POST');
  expect(options.headers.get('X-CSRF-Token')).toBe('synthetic-csrf');
  expect(options.headers.get('Idempotency-Key')).toBe('synthetic-command'); expect(JSON.parse(options.body)).toEqual(body);
});
test('rejects malformed DTOs and cannot escape the product path', async () => {
  for(const data of [null,{...page([]),page:0},{...page([]),items:null},page([{...adjustment,type:'OTHER'}]),page([{...adjustment,quantity:0}]),page([{...adjustment,reason:'OTHER'}])]) {
    await expect(createStockAdjustmentApi({fetchImpl:jest.fn().mockResolvedValue(reply(data))}).listAdjustments()).rejects.toMatchObject({code:'INVALID_RESPONSE'});
  }
  for(const data of [null,{...product,available:'8'},{...product,stockOnHand:-1}]) {
    await expect(createStockAdjustmentApi({fetchImpl:jest.fn().mockResolvedValue(reply(data))}).readProduct('p1')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
  }
  const fetchImpl=jest.fn(); await expect(createStockAdjustmentApi({fetchImpl}).readProduct('a/b')).rejects.toMatchObject({code:'INVALID_API_PATH'});
  expect(fetchImpl).not.toHaveBeenCalled();
});
