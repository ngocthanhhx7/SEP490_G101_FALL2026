import { createSupplierManagementApi } from '../../src/services/supplier-management-api.js';

const envelope = (data) => ({ data, meta: { schemaVersion: 1 } });
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
const supplier = { id: 's1', name: 'Công ty TNHH Thức ăn thú cưng Minh An', contactName: 'Đỗ Văn Toàn', phone: '0936452118', email: 'a@example.test',
  status: 'ACTIVE', productCount: 1, version: 0 };
const detail = { ...supplier, products: [{ id: 'p12', code: 'SP-0012', name: 'Thức ăn hạt cho chó', visible: true }] };
const counts = { ACTIVE: 3, STOPPED: 1, ALL: 4 };
const page = (items, over = {}) => envelope({ items, page: 1, limit: 20, total: items.length, counts, ...over });

const api = (fetchImpl, getCsrfToken = () => 'csrf-token') => createSupplierManagementApi({ fetchImpl, getCsrfToken });

test('lists suppliers with only the filters that are set and keeps the page and the tab counts in meta', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, page([supplier], { total: 4 })));
  const result = await api(fetchImpl).listSuppliers({ status: 'STOPPED', page: 2, limit: 20 });
  expect(result.data).toEqual([supplier]);
  expect(result.meta.page).toEqual({ page: 1, limit: 20, total: 4 });
  expect(result.meta.counts).toEqual(counts);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/admin/suppliers?status=STOPPED&page=2&limit=20');
  await api(fetchImpl).listSuppliers();
  expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/admin/suppliers');
  await api(fetchImpl).listSuppliers({ status: 'ALL', page: 1 });
  expect(fetchImpl.mock.calls[2][0]).toBe('/api/v1/admin/suppliers');
});

test('rejects a list that does not match the contract', async () => {
  for (const bad of [
    envelope({ items: 'x', page: 1, limit: 20, total: 0, counts }),
    page([{ ...supplier, status: 'OLD' }]), page([{ ...supplier, version: -1 }]), page([{ ...supplier, phone: 936452118 }]),
    page([{ ...supplier, productCount: 1.5 }]), page([{ ...supplier, name: '' }]),
    envelope({ items: [], page: 0, limit: 20, total: 0, counts }), envelope({ items: [], page: 1, limit: 20, total: 0, counts: { ACTIVE: 0 } }),
    envelope({ items: [], page: 1, limit: 20, total: 0 })
  ]) {
    await expect(api(jest.fn().mockResolvedValue(reply(200, bad))).listSuppliers()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  }
});

test('reads one supplier with its products, and an id that tries to leave the path never reaches the network', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope(detail)));
  expect(await api(fetchImpl).readSupplier('665f1c0e2b7d4a0012345678')).toEqual(detail);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/admin/suppliers/665f1c0e2b7d4a0012345678');
  await expect(api(fetchImpl).readSupplier('a/b')).rejects.toMatchObject({ code: 'INVALID_API_PATH' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  for (const bad of [{ ...detail, products: undefined }, { ...detail, products: [] }, { ...detail, products: [{ ...detail.products[0], visible: 'yes' }] }]) {
    await expect(api(jest.fn().mockResolvedValue(reply(200, envelope(bad)))).readSupplier('s1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  }
});

test('creates with a POST, edits with a PATCH carrying the version, stops and resumes with the version only', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope(detail)));
  const values = { name: 'A', contactName: '', phone: '0936452118', email: '', productIds: ['p12'] };
  await api(fetchImpl).createSupplier(values);
  const [createUrl, create] = fetchImpl.mock.calls[0];
  expect([createUrl, create.method, create.headers.get('X-CSRF-Token'), JSON.parse(create.body)]).toEqual(['/api/v1/admin/suppliers', 'POST', 'csrf-token', values]);
  await api(fetchImpl).updateSupplier('s1', { version: 3, phone: '' });
  const [updateUrl, update] = fetchImpl.mock.calls[1];
  expect([updateUrl, update.method, JSON.parse(update.body)]).toEqual(['/api/v1/admin/suppliers/s1', 'PATCH', { version: 3, phone: '' }]);
  await api(fetchImpl).stopSupplier('s1', 4);
  await api(fetchImpl).resumeSupplier('s1', 5);
  const [stopUrl, stop] = fetchImpl.mock.calls[2];
  const [resumeUrl, resume] = fetchImpl.mock.calls[3];
  expect([stopUrl, stop.method, JSON.parse(stop.body)]).toEqual(['/api/v1/admin/suppliers/s1/stop', 'POST', { version: 4 }]);
  expect([resumeUrl, resume.method, JSON.parse(resume.body)]).toEqual(['/api/v1/admin/suppliers/s1/resume', 'POST', { version: 5 }]);
  expect(stop.headers.get('Idempotency-Key')).toBeNull();
});

test('keeps the field reasons of a 422 so the form can show MSG01, MSG02, MSG03 or MSG125', async () => {
  const body = { error: { code: 'VALIDATION_FAILED', message: 'x', fields: { name: 'REQUIRED', phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' } }, meta: { schemaVersion: 1 } };
  await expect(api(jest.fn().mockResolvedValue(reply(422, body))).createSupplier({})).rejects
    .toMatchObject({ code: 'VALIDATION_FAILED', status: 422, fields: { name: 'REQUIRED', phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' } });
});

test('surfaces a taken name, a conflict, a refused session and a lost connection by code', async () => {
  const failure = (status, code) => jest.fn().mockResolvedValue(reply(status, { error: { code }, meta: { schemaVersion: 1 } }));
  await expect(api(failure(409, 'SUPPLIER_NAME_TAKEN')).createSupplier({})).rejects.toMatchObject({ code: 'SUPPLIER_NAME_TAKEN', status: 409 });
  await expect(api(failure(409, 'VERSION_CONFLICT')).updateSupplier('s1', { version: 0, name: 'A' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  await expect(api(failure(409, 'SUPPLIER_STATE_CONFLICT')).stopSupplier('s1', 0)).rejects.toMatchObject({ code: 'SUPPLIER_STATE_CONFLICT' });
  await expect(api(failure(403, 'FORBIDDEN')).listSuppliers()).rejects.toMatchObject({ status: 403 });
  await expect(api(jest.fn().mockRejectedValue(new Error('offline'))).listSuppliers()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  await expect(api(jest.fn(), () => null).createSupplier({})).rejects.toMatchObject({ code: 'CSRF_NOT_READY' });
});
