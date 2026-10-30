const formatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
export function notificationDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? formatter.format(date) : '';
}
export function notificationTarget(item, fallback = '/account/notifications') {
  const path = item?.deepLink;
  return typeof path === 'string' && /^\/(?!\/)/.test(path) && !/[\\\u0000-\u0020]/.test(path) ? path : fallback;
}
