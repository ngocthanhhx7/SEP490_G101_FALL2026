const zone = 'Asia/Ho_Chi_Minh';

export const CLOSURE_REASON_LABEL = 'Chưa check-out sau 2 giờ';
export const CLOSURE_REASON_MAX_LENGTH = 1000;
export const CLOSURE_SUCCESS_MESSAGE = 'Đã đóng buổi.';
export const CLOSURE_ERROR_MESSAGES = {
  VALIDATION_FAILED: 'Nhập lý do đóng buổi (tối đa 1.000 ký tự).',
  INVALID_STATE: 'Buổi không còn ở trạng thái chưa check-out. Tải lại danh sách.',
  VERSION_CONFLICT: 'Buổi vừa được cập nhật. Tải lại rồi kiểm tra trước khi đóng.',
  CLOSE_NOT_ALLOWED_YET: 'Chưa đủ 2 giờ sau giờ kết thúc để đóng buổi.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu trước đã được ghi nhận với nội dung khác. Tải lại danh sách.',
  FORBIDDEN: 'Chỉ nhân viên hoặc quản trị mới đóng được buổi.',
  RESOURCE_NOT_FOUND: 'Không tìm thấy buổi. Tải lại danh sách.'
};

// Real bookings have no booking code yet, so show the end of the booking id: "…a1b2c3".
export const formatBookingRef = row => row?.bookingCode ?? (row?.bookingId ? `…${String(row.bookingId).slice(-6)}` : 'Lịch đặt');

const parts = (value, options) => Object.fromEntries(new Intl.DateTimeFormat('vi-VN', { timeZone: zone, ...options })
  .formatToParts(new Date(value)).map(part => [part.type, part.value]));
// Assembled from parts so the separators do not depend on the browser locale data.
export const formatClosureTime = value => {
  const { hour, minute } = parts(value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${hour}:${minute}`;
};
export const formatClosureDay = value => {
  const { day, month } = parts(value, { day: '2-digit', month: '2-digit' });
  return `${day}/${month}`;
};
export const formatClosureSlot = (startAt, endAt) =>
  `${formatClosureDay(startAt)} · ${formatClosureTime(startAt)} – ${formatClosureTime(endAt)}`;

// "Trễ 2 giờ 10 phút": time since the visit ended.
export function formatOverdue(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (!hours) return `Trễ ${rest} phút`;
  return `Trễ ${hours} giờ${rest ? ` ${rest} phút` : ''}`;
}
