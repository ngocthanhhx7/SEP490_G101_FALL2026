const timeZone = 'Asia/Ho_Chi_Minh';
const day = { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' };
const dateFormat = new Intl.DateTimeFormat('vi-VN', day);
const weekdayFormat = new Intl.DateTimeFormat('vi-VN', { ...day, weekday: 'long' });
const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const amountFormat = new Intl.NumberFormat('vi-VN');
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export const bookingChangeSent = 'Đã gửi yêu cầu đổi giờ. Bạn sẽ được báo khi nhân viên trả lời.';
export const bookingChangeLeadTime = 'Gửi yêu cầu trước giờ cũ ít nhất 12 giờ, cho giờ mới cách bây giờ ít nhất 24 giờ.';

export function bookingChangeInputDate(value) {
  const parts = Object.fromEntries(dateFormat.formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return [parts.year, parts.month, parts.day].join('-');
}

export function bookingChangeDateLabel(date) {
  return date ? weekdayFormat.format(new Date(date + 'T00:00:00+07:00')) : 'Chọn ngày';
}

export function bookingChangeVisitLabel(visit) {
  return [
    weekdayFormat.format(new Date(visit.startAt)),
    timeFormat.format(new Date(visit.startAt)) + ' – ' + timeFormat.format(new Date(visit.endAt)),
    visit.sitterName
  ].filter(Boolean).join(' · ');
}

export function bookingChangeTimeLabel(date, time, visit) {
  if (!time) return 'Chọn giờ';
  if (!date || !visit) return time;
  const duration = Date.parse(visit.endAt) - Date.parse(visit.startAt);
  const start = Date.parse(date + 'T' + time + ':00+07:00');
  return time + ' – ' + timeFormat.format(new Date(start + duration));
}

export function bookingChangeSummary(booking, options) {
  const terms = booking.details?.terms?.length ? booking.details.terms : booking.visits;
  const names = [...new Set((terms ?? []).map(visit => visit.serviceName).filter(Boolean))];
  const dates = (terms ?? []).map(visit => visit.startAt).filter(validDate).map(Date.parse).sort((a, b) => a - b);
  const first = dates.length ? dateFormat.format(dates[0]) : null;
  const last = dates.length ? dateFormat.format(dates.at(-1)) : null;
  return ['Lịch đặt ' + (options.bookingCode || options.bookingId), names.join(', '),
    first === last ? first : first + ' – ' + last].filter(Boolean).join(' · ');
}

export function bookingChangePrice(visits) {
  const amounts = [...new Set(visits.map(visit => visit.priceVnd))];
  if (amounts.length === 1 && Number.isSafeInteger(amounts[0]) && amounts[0] >= 0)
    return 'Giá không đổi: ' + amountFormat.format(amounts[0]) + ' đ mỗi buổi.';
  return 'Giá không đổi. Giá từng buổi giữ nguyên theo lịch đặt.';
}

const messages = {
  MSG20: 'Một lịch đặt kéo dài tối đa 30 ngày.',
  MSG54: bookingChangeLeadTime,
  MSG55: 'Buổi này đã được đổi giờ một lần và không thể đổi lại.',
  MSG67: 'Trước khi thanh toán hoá đơn đầu tiên, bạn chỉ có thể đặt lịch tối đa 7 ngày và có một lịch chưa thanh toán tại một thời điểm.',
  MSG149: 'Buổi này đã có yêu cầu đổi giờ đang chờ nhân viên duyệt.',
  MSG150: 'Mỗi ngày có tối đa hai buổi thuộc lịch đặt này.',
  BOOKING_CHANGE_STAFF_PROPOSAL_PENDING: 'Buổi này đang có đề xuất đổi giờ của nhân viên chờ bạn xác nhận.',
  BOOKING_CHANGE_UNAVAILABLE: 'Lịch đặt này chưa thể gửi yêu cầu đổi giờ.',
  CSRF_NOT_READY: 'Phiên chưa sẵn sàng. Hãy tải lại trang rồi thử lại.'
};

export function bookingChangeError(error) {
  if (error.code === 'MSG148') return validDate(error.time)
    ? 'Buổi 2 phải bắt đầu từ ' + timeFormat.format(new Date(error.time)) + ', khi buổi 1 kết thúc.'
    : 'Buổi 2 phải bắt đầu khi buổi 1 kết thúc hoặc muộn hơn.';
  if (error.code === 'MSG68') return (error.pet || 'Thú cưng') + ' đã có lịch đặt khác vào giờ này.';
  return messages[error.code] ?? 'Chưa thể gửi yêu cầu. Hãy kiểm tra ngày giờ và thử lại.';
}
