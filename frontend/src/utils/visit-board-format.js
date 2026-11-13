// Reasons of the Needs action list (R3 10.1.1). The API sends the code; the words live here.
export const REASON_LABELS = {
  NO_SITTER_TO_OFFER: 'Hết người để mời',
  NO_SITTER_24H: 'Chưa có người 24 giờ trước',
  NOT_CHECKED_IN_30M: 'Chưa check-in sau 30 phút',
  WITHDRAWAL_UNDER_12H: 'Rút buổi dưới 12 giờ',
  NOT_CHECKED_OUT_2H: 'Chưa check-out sau 2 giờ'
};
export const VISIT_STATE_LABELS = {
  SCHEDULED: 'Chờ phân công', ASSIGNED: 'Đã nhận', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Đã xong', CANCELLED: 'Đã hủy', STAFF_CLOSED: 'Đã đóng'
};
export const BOARD_ERROR_MESSAGES = {
  RESOURCE_NOT_FOUND: 'Buổi này chưa có người chăm sóc để gọi.',
  FORBIDDEN: 'Chỉ nhân viên hoặc quản trị mới xem được số điện thoại.',
  CONTACT_LOOKUP_UNAVAILABLE: 'Chưa tra được số điện thoại trên hệ thống này.',
  RATE_LIMITED: 'Bạn xem số điện thoại quá nhanh. Thử lại sau ít phút.'
};

// "Trễ 35 phút", "Còn 5 giờ", "Trễ 2 giờ 10 phút", "Còn 2 ngày".
export function formatDuration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
  return `${Math.floor(hours / 24)} ngày`;
}
export const formatReasonTime = reason => `${reason.late ? 'Trễ' : 'Còn'} ${formatDuration(reason.ms)}`;

// 0912345678 -> "0912 345 678"; any other shape is shown as stored.
export const formatPhone = phone => (/^\d{10}$/u.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone);

// What the action cell offers for the most urgent reason of a row.
export function actionFor(row) {
  const code = row.reasons?.[0]?.code;
  if (code === 'NO_SITTER_TO_OFFER' || code === 'NO_SITTER_24H') {
    return row.reviewCode === 'SHIFT_START_REACHED' ? { kind: 'dispatch', label: 'Đổi lịch với khách' } : { kind: 'dispatch', label: 'Giao người' };
  }
  if (code === 'NOT_CHECKED_IN_30M') return { kind: 'call', label: 'Gọi người chăm sóc', party: 'sitter' };
  if (code === 'WITHDRAWAL_UNDER_12H') return { kind: 'withdrawal', label: 'Xem yêu cầu rút' };
  if (code === 'NOT_CHECKED_OUT_2H') return { kind: 'close', label: 'Đóng buổi' };
  return null;
}
