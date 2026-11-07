import { apiErrorFeedback } from '../../src/utils/api-error-feedback.js';

test.each([
  [400, 'Yêu cầu không hợp lệ'], [401, 'đăng nhập'], [403, 'quyền'], [404, 'Không tìm thấy'],
  [409, 'trạng thái đã thay đổi'], [413, 'kích thước'], [415, 'Định dạng'], [422, 'các trường'],
  [429, 'quá nhanh'], [500, 'lỗi xử lý'], [502, 'phản hồi hợp lệ'], [503, 'chưa sẵn sàng'],
  [504, 'quá chậm'], [505, 'phiên bản HTTP']
])('safe localized HTTP %s feedback survives an HTML gateway failure', (status, message) => {
  const feedback = apiErrorFeedback({ status, code: 'HTTP_ERROR', message: '<script>private upstream detail</script>' });
  expect(feedback).toContain(message);
  expect(feedback).not.toContain('private upstream');
});

test('specific domain errors, bounded wait and unknown fallbacks remain distinct', () => {
  expect(apiErrorFeedback({ code: 'ACCOUNT_LOCKED', status: 403 })).toContain('đã bị khóa');
  expect(apiErrorFeedback({ code: 'VISIT_SCHEDULE_OVERLAP', status: 409 })).toContain('trùng giờ');
  expect(apiErrorFeedback({ status: 429, retryAfterSeconds: 60 })).toContain('60 giây');
  expect(apiErrorFeedback({ status: 429, retryAfterSeconds: -4 })).not.toContain('-4');
  expect(apiErrorFeedback({ status: 599 }, 'Thông báo của chức năng')).toBe('Thông báo của chức năng');
});
