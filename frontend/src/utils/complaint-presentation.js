export const bookingPath = bookingId => '/account/bookings/' + encodeURIComponent(bookingId);
export const complaintSubmitPath = (bookingId, visitId) => bookingPath(bookingId) + '/complaints/new' +
  (visitId ? '?visit=' + encodeURIComponent(visitId) : '');

const visitLabels = {
  SCHEDULED: 'Chờ phân công', ASSIGNED: 'Đã có người chăm sóc', IN_PROGRESS: 'Đang chăm sóc',
  COMPLETED: 'Đã hoàn tất', STAFF_CLOSED: 'Đã đóng', CANCELLED: 'Đã hủy'
};

export const visitLabel = state => visitLabels[state] ?? 'Đang cập nhật';

const complaintDateTime = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh'
});

function complaintDateParts(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const { weekday, day, month, year, hour, minute } = Object.fromEntries(
    complaintDateTime.formatToParts(timestamp).map(({ type, value: part }) => [type, part])
  );
  const shortDate = day + '/' + month;
  return { weekday, shortDate, date: shortDate + '/' + year, time: hour + ':' + minute };
}

export function complaintDeadline(value) {
  const parts = complaintDateParts(value);
  return parts ? parts.time + ', ' + parts.date : null;
}

export function complaintVisitStart(value) {
  const parts = complaintDateParts(value);
  return parts ? parts.shortDate + ', ' + parts.time : null;
}

export function complaintVisitTime(period) {
  const start = complaintDateParts(period?.startAt);
  if (!start) return null;
  const context = start.weekday + ', ' + start.date + ' · ' + start.time;
  const end = complaintDateParts(period.endAt);
  if (!end || Date.parse(period.endAt) <= Date.parse(period.startAt)) return context;
  const endText = end.date === start.date ? end.time : end.weekday + ', ' + end.date + ' · ' + end.time;
  return context + ' – ' + endText;
}

export function complaintSubject(item) {
  if (item.scope === 'BOOKING') return 'Lịch đặt ' + (item.booking?.code ?? item.bookingId);
  const start = complaintDateParts(item.visit?.startAt);
  return start ? 'Buổi ' + start.date + ', ' + start.time : 'Buổi chăm sóc';
}

const messages = {
  COMPLAINT_WINDOW_EXPIRED: 'Chỉ có thể gửi khiếu nại trong 7 ngày sau khi buổi hoặc lịch đặt kết thúc.',
  COMPLAINT_ALREADY_OPEN: 'Bạn đã có khiếu nại đang mở về buổi hoặc lịch đặt này.',
  VERSION_CONFLICT: 'Thông tin đã thay đổi. Hãy tải lại và thử lại.',
  OBJECTION_ALREADY_USED: 'Bạn đã dùng lượt không đồng ý cho khiếu nại này.',
  OBJECTION_WINDOW_EXPIRED: 'Đã hết hạn không đồng ý với kết quả.',
  BILLING_SOURCE_UNAVAILABLE: 'Chưa xác nhận được hóa đơn của lịch đặt.',
  INVALID_PRIVATE_IMAGE: 'Chọn ảnh PNG hoặc JPEG không quá 5 MB.',
  MEDIA_QUOTA_EXCEEDED: 'Tài khoản đã đạt giới hạn tải ảnh.',
  EVIDENCE_NOT_READY: 'Ảnh chưa sẵn sàng. Hãy thử lại.'
};

export const complaintError = (error, fallback) => messages[error?.code] ?? fallback;

export function retryKey(ref, payload) {
  const fingerprint = JSON.stringify(payload);
  if (ref.current?.fingerprint !== fingerprint) {
    ref.current = { fingerprint, key: globalThis.crypto.randomUUID() };
  }
  return ref.current.key;
}
