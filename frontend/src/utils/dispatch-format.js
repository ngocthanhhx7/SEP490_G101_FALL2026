const labels = {
  SITTER_NOT_ELIGIBLE: 'Tài khoản hoặc trạng thái nhân viên chưa hoạt động',
  SERVICE_CAPABILITY_REQUIRED: 'Chưa có năng lực dịch vụ đã xác minh',
  PET_CAPABILITY_MISMATCH: 'Năng lực chưa đáp ứng thú cưng',
  CONTRACT_REQUIRED: 'Hợp đồng chưa bao phủ ca',
  OUTSIDE_WORKING_HOURS: 'Ngoài lịch làm việc đã đăng ký',
  WORK_AREA_MISMATCH: 'Ngoài khu vực đã đăng ký',
  DAY_ORIGIN_MISSING: 'Chưa khai báo điểm xuất phát trong ngày',
  TRAVEL_REVIEW_REQUIRED: 'Chưa xác minh được tuyến đường',
  TRAVEL_TIME_CONFLICT: 'Không đủ thời gian di chuyển',
  DAY_OFF: 'Đã đăng ký nghỉ', SLOT_UNAVAILABLE: 'Trùng lịch đã nhận',
  CONTRACT_HOURS_EXCEEDED: 'Vượt giờ làm việc cho phép',
  SHIFT_REVIEW_REQUIRED: 'Lịch đã qua hoặc ca vượt 8 giờ'
};
export const dispatchReason = code => labels[code] ?? 'Cần kiểm tra điều kiện nhận ca';
