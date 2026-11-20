const formatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
export function notificationDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? formatter.format(date) : '';
}
export function notificationTarget(item, fallback = '/account/notifications') {
  const path = item?.deepLink;
  if (typeof path !== 'string' || !/^\/(?!\/)/.test(path) || /[\\\u0000-\u0020]/.test(path)) return fallback;
  if (/^(?:\/account\/bookings\/[a-f0-9]{24}(?:\/visits\/[a-f0-9]{24})?|\/sitter\/(?:visits\/|invitations\?offerId=)[a-f0-9]{24})$/.test(path)
    && typeof item.id === 'string' && /^[a-f0-9]{64}$/.test(item.id)) return '/account/notifications?open=' + item.id;
  return path;
}
