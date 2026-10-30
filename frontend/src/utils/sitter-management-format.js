export const sitterLabels = {
  ACTIVE: 'Hoạt động', SUSPENDED: 'Tạm ngưng', LOCKED: 'Đã khóa', MISSING: 'Chưa thiết lập', AMBIGUOUS: 'Hợp đồng chồng lấn',
  FULL_TIME: 'Toàn thời gian', PART_TIME: 'Bán thời gian', APPROVED: 'Đã duyệt', SUBMITTED: 'Chờ duyệt', REJECTED: 'Từ chối',
  COMPLETED: 'Hoàn thành', ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang chăm sóc', SCHEDULED: 'Chờ phân công',
  CANCELLED: 'Đã hủy', STAFF_CLOSED: 'Đã đóng', DOG: 'Chó', CAT: 'Mèo',
  SITTER_SUSPENDED: 'Tạm ngưng hoạt động', SITTER_REINSTATED: 'Khôi phục hoạt động', APPLICATION_DECIDED: 'Quyết định hồ sơ',
  'home-care': 'Chăm sóc tại nhà', 'dog-walking': 'Dắt chó đi dạo'
};
export const sitterLabel = value => sitterLabels[value] ?? value ?? 'Chưa có';
export const managementDate = value => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Chưa có';
export const weekdayLabel = value => Number(value) === 7 || Number(value) === 0 ? 'Chủ nhật' : 'Thứ ' + (Number(value) + 1);
