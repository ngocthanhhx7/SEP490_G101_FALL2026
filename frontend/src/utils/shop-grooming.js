// The same rule as the backend (`grooming-shop-services.service.js`): a shop grooming service offers FACILITY and sits in
// a grooming category. It is booked on the grooming page; only its home-visit part uses the general booking flow.
const SHOP_CATEGORIES = ['Vệ sinh', 'Làm đẹp'];
const SHOP_LABEL = 'Đặt lịch tại cửa hàng';

export const isShopGrooming = service => service?.details?.locations?.includes('FACILITY') === true && SHOP_CATEGORIES.includes(service.details.category);

// Places the general booking flow still offers: the shop is left to the grooming page for shop grooming services.
export const homeLocations = service => (service.details?.locations ?? ['HOME']).filter(value => value !== 'FACILITY' || !isShopGrooming(service));

export const isShopOnly = service => isShopGrooming(service) && homeLocations(service).length === 0;

export const groomingPath = service => '/grooming-booking?serviceId=' + encodeURIComponent(service.id);

// One button per way to book, never two with the same destination:
//   shop only            -> [shop]
//   shop and home visit  -> [shop, home]
//   any other service    -> [home]   (unchanged: the general booking page)
export function bookingActions(service, homeLabel = 'Đặt dịch vụ này') {
  const home = { kind: 'HOME', to: '/booking/' + encodeURIComponent(service.id), label: homeLabel };
  if (!isShopGrooming(service)) return [home];
  const shop = { kind: 'SHOP', to: groomingPath(service), label: SHOP_LABEL };
  return homeLocations(service).length ? [shop, { ...home, label: 'Đặt tại nhà' }] : [shop];
}
