const states = {
  PENDING: ['Chờ xác nhận', 'PawWorld đang tiếp nhận yêu cầu của bạn.'],
  CONFIRMED: ['Đã xác nhận', 'Lịch chăm sóc đã được xác nhận.'],
  DISPATCH_PENDING: ['Chờ người chăm sóc', 'PawWorld đang gửi lời mời. Bạn sẽ được thông báo khi sitter nhận ca.'],
  CARE_PLAN_PENDING: ['Chờ kế hoạch chăm sóc', 'Nhân viên đang chuẩn bị các ca chăm sóc cho lịch của bạn.'],
  ASSIGNED: ['Đã có người chăm sóc', 'Sitter đã nhận ca. Xem chi tiết để kiểm tra lịch chăm sóc.'],
  IN_PROGRESS: ['Đang chăm sóc', 'Buổi chăm sóc đang diễn ra. Bạn có thể theo dõi trong chi tiết đơn.'],
  COMPLETED: ['Đã hoàn tất', 'Dịch vụ đã hoàn tất. Bạn có thể xem lại các buổi và gửi đánh giá.'],
  CANCELLED: ['Đã hủy', 'Đơn này đã được hủy.'],
  AWAITING_PAYMENT: ['Chờ thanh toán trước', 'Thanh toán đúng hạn để PawWorld bắt đầu gửi lời mời chăm sóc.'],
  PAYMENT_EXPIRED: ['Hết hạn thanh toán', 'Đơn đã quá hạn thanh toán. Mở chi tiết để kiểm tra trạng thái mới nhất.'],
  UNPAID: ['Chờ thanh toán', 'Đơn đang chờ thanh toán.'], PAID: ['Đã thanh toán', 'Thanh toán đã được ghi nhận.']
};
export const bookingStatus = state => states[state] ?? ['Đang cập nhật', 'Mở chi tiết hoặc tải lại để kiểm tra trạng thái đơn.'];
export function bookingDate(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Chưa có lịch';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}
export const bookingMoney = value => Number.isSafeInteger(value) && value >= 0
  ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value) : 'Xem trong chi tiết';
