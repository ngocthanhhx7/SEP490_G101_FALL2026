import { ApiError, createApiClient } from './api-client.js';

const STATUSES = ['ACTIVE', 'STOPPED'];
const text = (value) => typeof value === 'string' && value.length > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const invalid = () => { throw new ApiError('INVALID_RESPONSE', 200); };

function checkSupplier(supplier) {
  if (!supplier || !text(supplier.id) || !text(supplier.name) || typeof supplier.contactName !== 'string'
    || typeof supplier.phone !== 'string' || typeof supplier.email !== 'string' || !STATUSES.includes(supplier.status)
    || !count(supplier.productCount) || !count(supplier.version)) invalid();
  return supplier;
}
function checkDetail(supplier) {
  checkSupplier(supplier);
  if (!Array.isArray(supplier.products) || supplier.products.length !== supplier.productCount
    || supplier.products.some((product) => !text(product?.id) || !text(product.code) || !text(product.name) || typeof product.visible !== 'boolean')) invalid();
  return supplier;
}
function checkPage(data) {
  if (!Number.isSafeInteger(data.page) || data.page < 1 || !Number.isSafeInteger(data.limit) || data.limit < 1 || !count(data.total)) invalid();
  return { page: data.page, limit: data.limit, total: data.total };
}
function checkCounts(counts) {
  if (!counts || ['ACTIVE', 'STOPPED', 'ALL'].some((tab) => !count(counts[tab]))) invalid();
  return counts;
}

// Transport and DTO validation for Supplier Management. The rules, the name check and the status are the backend's.
export function createSupplierManagementApi(options) {
  const request = createApiClient(options);
  const id = encodeURIComponent;
  const post = async (path, body) => checkDetail((await request(path, { method: 'POST', body })).data);
  return {
    // The page and the size of every tab ride in meta, so an empty tab still shows its counts.
    async listSuppliers({ status = 'ALL', page = 1, limit } = {}, { signal } = {}) {
      const params = new globalThis.URLSearchParams();
      if (status !== 'ALL') params.set('status', status);
      if (page > 1) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const query = params.toString();
      const response = await request(`/admin/suppliers${query ? `?${query}` : ''}`, { signal });
      if (!Array.isArray(response.data?.items)) invalid();
      return { ...response, data: response.data.items.map(checkSupplier),
        meta: { ...response.meta, page: checkPage(response.data), counts: checkCounts(response.data.counts) } };
    },
    async readSupplier(supplierId, { signal } = {}) {
      return checkDetail((await request(`/admin/suppliers/${id(supplierId)}`, { signal })).data);
    },
    // values: { name, contactName, phone, email, productIds }. A new supplier is Đang hợp tác.
    createSupplier: (values) => post('/admin/suppliers', values),
    // changes: any of the editable fields, plus `version`, the one the Admin was looking at.
    async updateSupplier(supplierId, changes) {
      return checkDetail((await request(`/admin/suppliers/${id(supplierId)}`, { method: 'PATCH', body: changes })).data);
    },
    stopSupplier: (supplierId, version) => post(`/admin/suppliers/${id(supplierId)}/stop`, { version }),
    resumeSupplier: (supplierId, version) => post(`/admin/suppliers/${id(supplierId)}/resume`, { version })
  };
}
