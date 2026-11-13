import { apiErrorFeedback } from './api-error-feedback.js';

const zone = { timeZone: 'Asia/Ho_Chi_Minh' };
const day = new Intl.DateTimeFormat('vi-VN', { ...zone, day: '2-digit', month: '2-digit', year: 'numeric' });
const weekday = new Intl.DateTimeFormat('vi-VN', { ...zone, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const time = new Intl.DateTimeFormat('vi-VN', { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const amount = new Intl.NumberFormat('vi-VN');

export const staffBookingChangeMessages = {
  MSG126: 'Đã lưu giờ mới. Khách hàng và người chăm sóc đã được thông báo.',
  MSG127: 'Đã từ chối yêu cầu. Buổi giữ giờ cũ.'
};

export const staffBookingChangeStates = {
  PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối', EXPIRED: 'Đã hết hạn', CLOSED: 'Đã đóng'
};

export const staffBookingChangeAvailability = {
  AVAILABLE: 'Rảnh giờ mới', BUSY: 'Bận giờ mới', UNASSIGNED: 'Chưa phân công', CHANGED: 'Buổi đã thay đổi'
};

const reasons = {
  PET_OVERLAP: 'thú cưng đã có lịch khác vào giờ đó',
  VISIT_BEFORE_PREVIOUS_END: 'buổi 2 bắt đầu trước khi buổi 1 kết thúc',
  TOO_MANY_VISITS: 'một ngày có quá hai buổi',
  BOOKING_TOO_LONG: 'lịch đặt kéo dài quá 30 ngày'
};

export const staffChangeMoment = value => time.format(new Date(value)) + ', ' + day.format(new Date(value));
export const staffChangeScope = value => value === 'BOOKING' ? 'Cả lịch đặt' : 'Một buổi';

export function staffChangeRange(start, end) {
  const first = new Date(start), last = new Date(end);
  return weekday.format(first) + ' · ' + time.format(first) + ' – '
    + (day.format(first) === day.format(last) ? '' : weekday.format(last) + ' · ') + time.format(last);
}

export function staffChangePrice(items) {
  const prices = [...new Set(items.map(item => item.priceVnd))];
  if (!prices.length || prices.some(value => !Number.isSafeInteger(value) || value < 0)) return 'Không đổi';
  const amounts = prices.map(value => amount.format(value) + ' đ');
  return amounts.length === 1 ? 'Không đổi (' + amounts[0] + ' mỗi buổi)' : 'Không đổi (' + amounts.join(' / ') + ' theo buổi)';
}

export function staffChangeDecisionError(error) {
  if (error.code === 'MSG151') return 'Không thể duyệt thay đổi này vì '
    + (Object.hasOwn(reasons, error.reasonCode) ? reasons[error.reasonCode] : 'giờ mới không còn phù hợp với quy tắc đặt lịch')
    + '. Vui lòng từ chối yêu cầu.';
  if (error.code === 'BOOKING_CHANGE_VISIT_CHANGED')
    return 'Buổi đã thay đổi sau khi khách gửi yêu cầu. Vui lòng từ chối yêu cầu.';
  if (error.code === 'BOOKING_CHANGE_NOT_PENDING')
    return error.state === 'EXPIRED' ? 'Yêu cầu đã hết hạn. Buổi giữ giờ cũ.' : 'Yêu cầu đã được xử lý.';
  if (error.code === 'VERSION_CONFLICT') return 'Yêu cầu đã thay đổi. Vui lòng tải lại.';
  return apiErrorFeedback(error);
}
