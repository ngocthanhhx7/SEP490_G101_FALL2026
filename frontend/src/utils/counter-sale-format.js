export function formatCashTime(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(time);
}
