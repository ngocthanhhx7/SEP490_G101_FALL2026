import { createProductManagementApi } from '../../src/services/product-management-api.js';

const envelope = (data) => ({ data, meta: { schemaVersion: 1 } });
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
const product = { id: 'p1', code: 'SP-0012', name: 'Dây dắt chó', category: 'ACCESSORY', petType: 'DOG', description: '', photos: [],
  sellingPrice: 250000, visible: true, version: 0 };
const page = (items, over = {}) => envelope({ items, page: 1, limit: 20, total: items.length, ...over });

const api = (fetchImpl, getCsrfToken = () => 'csrf-token') => createProductManagementApi({ fetchImpl, getCsrfToken });

test('uploads binary images with CSRF/version and uses the same version on replacement/removal', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope(product)));
  const file = new globalThis.File(['synthetic'], 'photo.webp', { type: 'image/webp' });
  const client = api(fetchImpl);
  await client.uploadPhoto(product.id, file, { version: 2 });
  const [url, request] = fetchImpl.mock.calls[0];
  expect(url).toBe('/api/v1/admin/products/p1/photos');
  expect(request.body).toBe(file); expect(request.credentials).toBe('same-origin');
  expect(request.headers.get('Content-Type')).toBe('image/webp');
  expect(request.headers.get('X-CSRF-Token')).toBe('csrf-token');
  expect(request.headers.get('X-Product-Version')).toBe('2');
  await client.uploadPhoto(product.id, file, { version: 3, index: 0 });
  expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/admin/products/p1/photos/0');
  expect(fetchImpl.mock.calls[1][1].method).toBe('PUT');
  await client.removePhoto(product.id, 0, 4);
  expect(fetchImpl.mock.calls[2][1].method).toBe('DELETE');
  expect(fetchImpl.mock.calls[2][1].headers.get('X-Product-Version')).toBe('4');
  await expect(api(fetchImpl, () => null).uploadPhoto(product.id, file, { version: 4 })).rejects.toMatchObject({ code: 'CSRF_NOT_READY' });
  await expect(client.uploadPhoto(product.id, new globalThis.File(['x'], 'bad.svg', { type: 'image/svg+xml' }), { version: 4 })).rejects.toMatchObject({ code: 'INVALID_PRODUCT_PHOTO' });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

test('lists products with only the filters that are set and keeps the page in meta', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, page([product], { total: 9 })));
  const result = await api(fetchImpl).listProducts({ search: 'dây', category: 'ACCESSORY', petType: 'DOG', page: 2, limit: 20 });
  expect(result.data).toEqual([product]);
  expect(result.meta.page).toEqual({ page: 1, limit: 20, total: 9 });
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/admin/products?search=d%C3%A2y&category=ACCESSORY&petType=DOG&page=2&limit=20');
  await api(fetchImpl).listProducts();
  expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/admin/products');
  await api(fetchImpl).listProducts({ page: 1 });
  expect(fetchImpl.mock.calls[2][0]).toBe('/api/v1/admin/products');
});

test('rejects a list that does not match the contract', async () => {
  for (const bad of [
    envelope({ items: 'x', page: 1, limit: 20, total: 0 }),
    page([{ ...product, code: 'X-1' }]), page([{ ...product, sellingPrice: 1.5 }]), page([{ ...product, sellingPrice: 0 }]),
    page([{ ...product, visible: 'yes' }]), page([{ ...product, category: 'TOYS' }]), page([{ ...product, version: -1 }]),
    page([{ ...product, photos: undefined }]), envelope({ items: [], page: 0, limit: 20, total: 0 }), envelope({ items: [], page: 1, limit: 20 })
  ]) {
    await expect(api(jest.fn().mockResolvedValue(reply(200, bad))).listProducts()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  }
});

test('reads one product by id, and an id that tries to leave the path never reaches the network', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope(product)));
  expect(await api(fetchImpl).readProduct('665f1c0e2b7d4a0012345678')).toEqual(product);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/admin/products/665f1c0e2b7d4a0012345678');
  await expect(api(fetchImpl).readProduct('a/b')).rejects.toMatchObject({ code: 'INVALID_API_PATH' });
  await expect(api(fetchImpl).updateProduct('../x', { version: 0, name: 'A' })).rejects.toMatchObject({ code: 'INVALID_API_PATH' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('creates a product with a POST and the CSRF token, and edits with a PATCH carrying the version', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(200, envelope(product)));
  const values = { name: 'Dây dắt chó', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 250000, description: '' };
  await api(fetchImpl).createProduct(values);
  const [createUrl, create] = fetchImpl.mock.calls[0];
  expect([createUrl, create.method, create.headers.get('X-CSRF-Token'), JSON.parse(create.body)]).toEqual(['/api/v1/admin/products', 'POST', 'csrf-token', values]);
  await api(fetchImpl).updateProduct('p1', { version: 3, visible: false });
  const [updateUrl, update] = fetchImpl.mock.calls[1];
  expect([updateUrl, update.method, JSON.parse(update.body)]).toEqual(['/api/v1/admin/products/p1', 'PATCH', { version: 3, visible: false }]);
  expect(update.headers.get('Idempotency-Key')).toBeNull();
});

test('keeps the field reasons of a 422 so the form can show MSG01 or MSG113', async () => {
  const body = { error: { code: 'VALIDATION_FAILED', message: 'x', fields: { name: 'REQUIRED', sellingPrice: 'WHOLE_NUMBER' } }, meta: { schemaVersion: 1 } };
  await expect(api(jest.fn().mockResolvedValue(reply(422, body))).createProduct({})).rejects
    .toMatchObject({ code: 'VALIDATION_FAILED', status: 422, fields: { name: 'REQUIRED', sellingPrice: 'WHOLE_NUMBER' } });
});

test('surfaces a version conflict, a refused session and a lost connection by code', async () => {
  const failure = (status, code) => jest.fn().mockResolvedValue(reply(status, { error: { code }, meta: { schemaVersion: 1 } }));
  await expect(api(failure(409, 'VERSION_CONFLICT')).updateProduct('p1', { version: 0, name: 'A' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
  await expect(api(failure(403, 'FORBIDDEN')).listProducts()).rejects.toMatchObject({ status: 403 });
  await expect(api(jest.fn().mockRejectedValue(new Error('offline'))).listProducts()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  await expect(api(jest.fn(), () => null).createProduct({})).rejects.toMatchObject({ code: 'CSRF_NOT_READY' });
});
