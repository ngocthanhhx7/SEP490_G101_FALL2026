import { normalizePublicCatalog } from '../../src/services/public-catalog-api.js';
import { formatCatalogPrice } from '../../src/utils/catalog-format.js';

const validService = {
  id: 'service-abc',
  name: 'Chăm sóc tại nhà',
  description: 'Mô tả dịch vụ.',
  scope: 'Phạm vi dịch vụ.',
  species: ['DOG', 'CAT'],
  price: { amountVnd: 85000, currency: 'VND', unitLabel: 'mỗi lượt' },
  policy: {
    version: 2,
    title: 'Chính sách hiện hành',
    body: 'Nội dung đã được công bố.',
    effectiveAt: '2026-10-01T00:00:00.000Z'
  }
};

test('catalog adapter keeps only public service fields and formats server price with its unit', () => {
  const result = normalizePublicCatalog({
    available: true,
    services: [
      { ...validService, adminNote: 'must not be projected to the page' }
    ]
  });
  expect(result.services[0]).not.toHaveProperty('adminNote');
  expect(formatCatalogPrice(result.services[0].price)).toMatch(
    /85\.000.*mỗi lượt/
  );
});

test('catalog adapter rejects missing or invalid prices instead of inventing a price', () => {
  expect(() =>
    normalizePublicCatalog({
      available: true,
      services: [
        { ...validService, price: { amountVnd: 1000, currency: 'VND' } }
      ]
    })
  ).toThrow('INVALID_RESPONSE');
  expect(() =>
    normalizePublicCatalog({
      available: true,
      services: [
        { ...validService, price: { ...validService.price, currency: 'USD' } }
      ]
    })
  ).toThrow('INVALID_RESPONSE');
  expect(() =>
    normalizePublicCatalog({
      available: true,
      services: [{ ...validService, species: ['RABBIT'] }]
    })
  ).toThrow('INVALID_RESPONSE');
});

test('disabled catalog cannot contain publicly visible services', () => {
  expect(() =>
    normalizePublicCatalog({ available: false, services: [validService] })
  ).toThrow('INVALID_RESPONSE');
  expect(normalizePublicCatalog({ available: false, services: [] })).toEqual({
    available: false,
    services: []
  });
});
