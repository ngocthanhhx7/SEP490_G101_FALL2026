import { bookingActions, groomingPath, homeLocations, isShopGrooming, isShopOnly } from '../../src/utils/shop-grooming.js';

const shopOnly = { id: 'bath-1', details: { category: 'Vệ sinh', locations: ['FACILITY'] } };
const shopAndHome = { id: 'nail 2', details: { category: 'Vệ sinh', locations: ['HOME', 'FACILITY'] } };
const beauty = { id: 'trim-3', details: { category: 'Làm đẹp', locations: ['FACILITY'] } };
const homeCare = { id: 'home-4', details: { category: 'Chăm sóc', locations: ['HOME'] } };
const facilityOtherGroup = { id: 'train-5', details: { category: 'Huấn luyện', locations: ['FACILITY'] } };

describe('bookingActions: one button per way to book, never two with the same destination', () => {
  test('a service offered only at the shop has the shop button alone', () => {
    expect(bookingActions(shopOnly)).toEqual([{ kind: 'SHOP', to: '/grooming-booking?serviceId=bath-1', label: 'Đặt lịch tại cửa hàng' }]);
    expect(bookingActions(beauty).map(action => action.kind)).toEqual(['SHOP']);
  });

  test('a service at the shop and at home has the shop button first and the home button second', () => {
    const actions = bookingActions(shopAndHome);
    expect(actions).toEqual([
      { kind: 'SHOP', to: '/grooming-booking?serviceId=nail%202', label: 'Đặt lịch tại cửa hàng' },
      { kind: 'HOME', to: '/booking/nail%202', label: 'Đặt tại nhà' }
    ]);
    expect(new Set(actions.map(action => action.to)).size).toBe(actions.length);
  });

  test.each([
    ['a home service', homeCare], ['a facility service of another group', facilityOtherGroup],
    ['a service without details', { id: 'old-6' }], ['a service with no locations', { id: 'x-7', details: { category: 'Vệ sinh' } }]
  ])('%s keeps the general booking button and its label', (_name, service) => {
    expect(bookingActions(service)).toEqual([{ kind: 'HOME', to: `/booking/${encodeURIComponent(service.id)}`, label: 'Đặt dịch vụ này' }]);
  });

  test('the home label is the one the caller passes, so cards keep their own wording', () => {
    expect(bookingActions(homeCare, 'Đặt ngay')).toEqual([{ kind: 'HOME', to: '/booking/home-4', label: 'Đặt ngay' }]);
    expect(bookingActions(shopAndHome, 'Đặt ngay')[1].label).toBe('Đặt tại nhà');
  });
});

describe('shop grooming recognition (by the category name Vệ sinh or Làm đẹp)', () => {
  test('needs both the shop location and a grooming category', () => {
    expect([shopOnly, shopAndHome, beauty].map(isShopGrooming)).toEqual([true, true, true]);
    expect([homeCare, facilityOtherGroup, { id: 'a' }, undefined, null].map(isShopGrooming)).toEqual([false, false, false, false, false]);
  });

  test('home locations leave the shop to the grooming page only for shop grooming services', () => {
    expect(homeLocations(shopAndHome)).toEqual(['HOME']);
    expect(homeLocations(shopOnly)).toEqual([]);
    expect(homeLocations(facilityOtherGroup)).toEqual(['FACILITY']);
    expect(homeLocations({ id: 'a' })).toEqual(['HOME']);
    expect(homeLocations({ id: 'b', details: { locations: ['HOME', 'OUTDOOR'] } })).toEqual(['HOME', 'OUTDOOR']);
  });

  test('only a service offered nowhere but the shop is shop-only', () => {
    expect([shopOnly, beauty].map(isShopOnly)).toEqual([true, true]);
    expect([shopAndHome, homeCare, facilityOtherGroup].map(isShopOnly)).toEqual([false, false, false]);
  });

  test('the grooming path carries the service id, encoded', () => {
    expect(groomingPath({ id: 'a b&c' })).toBe('/grooming-booking?serviceId=a%20b%26c');
  });
});
