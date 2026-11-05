const STATUS_MESSAGES = Object.freeze({
  400: 'Yêu cầu không hợp lệ. Kiểm tra thông tin và tải lại trang nếu cần.',
  401: 'Phiên đăng nhập đã hết hạn hoặc chưa đăng nhập. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện yêu cầu này.',
  404: 'Không tìm thấy thông tin được yêu cầu.',
  405: 'Thao tác này không được hỗ trợ tại địa chỉ hiện tại.',
  408: 'Máy chủ chưa nhận đủ yêu cầu trong thời gian cho phép. Kiểm tra lại trạng thái trước khi gửi lại.',
  409: 'Dữ liệu hoặc trạng thái đã thay đổi. Tải lại thông tin trước khi tiếp tục.',
  413: 'Dữ liệu gửi lên vượt kích thước cho phép. Giảm dung lượng rồi thử lại.',
  415: 'Định dạng dữ liệu gửi lên không được hỗ trợ.',
  422: 'Một số thông tin chưa hợp lệ. Kiểm tra các trường đã nhập.',
  429: 'Bạn thao tác quá nhanh. Vui lòng chờ trước khi thử lại.',
  500: 'Máy chủ gặp lỗi xử lý. Kiểm tra lại trạng thái trước khi gửi lại yêu cầu.',
  502: 'Hệ thống chưa nhận được phản hồi hợp lệ từ dịch vụ liên kết. Kiểm tra lại trạng thái trước khi thử lại.',
  503: 'Dịch vụ tạm thời chưa sẵn sàng. Vui lòng quay lại sau.',
  504: 'Dịch vụ liên kết phản hồi quá chậm. Kiểm tra lại trạng thái trước khi gửi lại.',
  505: 'Máy chủ không hỗ trợ phiên bản HTTP của kết nối. Vui lòng cập nhật trình duyệt hoặc liên hệ hỗ trợ.'
});

export function apiErrorFeedback(error, fallback = 'Chưa thể hoàn tất yêu cầu. Vui lòng thử lại sau.') {
  if (error?.code === 'ACCOUNT_LOCKED') return 'Tài khoản đã bị khóa. Vui lòng liên hệ Paw World Care để được hỗ trợ.';
  if (error?.code === 'VISIT_SCHEDULE_OVERLAP') return 'Thú cưng đã có buổi chăm trùng giờ. Chọn thời gian khác hoặc xem lại lịch đã đặt.';
  if (error?.code === 'NETWORK_ERROR') return 'Không thể kết nối máy chủ. Kiểm tra kết nối và trạng thái yêu cầu trước khi gửi lại.';
  if (error?.code === 'TIMEOUT') return 'Chưa nhận được xác nhận trong thời gian chờ. Kiểm tra lại trạng thái trước khi gửi lại yêu cầu.';
  const message = STATUS_MESSAGES[error?.status];
  if (!message) return fallback;
  return error.status === 429 && Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0
    ? `${message} Thử lại sau ${error.retryAfterSeconds} giây.` : message;
}
