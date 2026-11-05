import { ApiError, createApiClient } from './api-client.js';

const CATEGORIES = ['FOOD', 'ACCESSORY'];
const PET_TYPES = ['DOG', 'CAT'];
const text = (value) => typeof value === 'string' && value.length > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const invalid = () => { throw new ApiError('INVALID_RESPONSE', 200); };

function checkProduct(product) {
  if (!product || !text(product.id) || !/^SP-\d{4}$/u.test(product.code ?? '') || !text(product.name)
    || !CATEGORIES.includes(product.category) || !PET_TYPES.includes(product.petType)
    || typeof product.description !== 'string' || !Array.isArray(product.photos)
    || !Number.isSafeInteger(product.sellingPrice) || product.sellingPrice <= 0
    || typeof product.visible !== 'boolean' || !count(product.version)) invalid();
  return product;
}
function checkSummary(summary) {
  if (!summary || !['total', 'visible', 'hidden', 'outOfStock'].every(key => count(summary[key]))
    || summary.visible + summary.hidden !== summary.total || summary.outOfStock > summary.total) invalid();
  return summary;
}
function checkPage(meta) {
  if (!meta || !Number.isSafeInteger(meta.page) || meta.page < 1 || !Number.isSafeInteger(meta.limit) || meta.limit < 1
    || !count(meta.total)) invalid();
  return { page: meta.page, limit: meta.limit, total: meta.total };
}

// Transport and DTO validation for Product Management. The code, stock and visibility rules are the backend's.
export function createProductManagementApi(options) {
  const request = createApiClient(options);
  const id = encodeURIComponent;
  return {
    // The page of products rides in meta, so an empty page still knows how many products match.
    async listProducts({ search = '', category = '', petType = '', page = 1, limit } = {}, { signal } = {}) {
      const params = new globalThis.URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (petType) params.set('petType', petType);
      if (page > 1) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const query = params.toString();
      const response = await request(`/admin/products${query ? `?${query}` : ''}`, { signal });
      if (!Array.isArray(response.data?.items)) invalid();
      return { ...response, data: response.data.items.map(checkProduct), meta: { ...response.meta, page: checkPage(response.data), summary: checkSummary(response.data.summary) } };
    },
    async deleteProduct(productId, values) {
      const response = await request(`/admin/products/${id(productId)}`, { method: 'DELETE', body: values });
      if (response.data?.id !== productId || response.data?.deleted !== true) invalid();
      return response.data;
    },
    async readProduct(productId, { signal } = {}) {
      return checkProduct((await request(`/admin/products/${id(productId)}`, { signal })).data);
    },
    // values: { name, category, petType, sellingPrice, description }. The new product is saved hidden.
    async createProduct(values) {
      return checkProduct((await request('/admin/products', { method: 'POST', body: values })).data);
    },
    // changes: any of the editable fields, plus `version`, the one the Admin was looking at.
    async updateProduct(productId, changes) {
      return checkProduct((await request(`/admin/products/${id(productId)}`, { method: 'PATCH', body: changes })).data);
    },
    async uploadPhoto(productId, file, { version, index } = {}) {
      const suffix = index === undefined ? '' : `/${index}`;
      return checkProduct((await request(`/admin/products/${id(productId)}/photos${suffix}`, {
        method: index === undefined ? 'POST' : 'PUT', binaryBody: file, productVersion: version
      })).data);
    },
    async removePhoto(productId, index, version) {
      return checkProduct((await request(`/admin/products/${id(productId)}/photos/${index}`, { method: 'DELETE', productVersion: version })).data);
    }
  };
}
