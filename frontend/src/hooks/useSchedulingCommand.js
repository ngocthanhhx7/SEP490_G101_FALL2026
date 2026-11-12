import { useRef, useState } from 'react';

const errors = {
  IMAGE_DIMENSIONS_EXCEEDED: 'Ảnh vượt 4 megapixel. Giảm kích thước ảnh trước khi gửi.',
  IMAGE_PROCESSING_BUSY: 'Hệ thống đang xử lý ảnh. Vui lòng thử lại sau ít phút.',
  HANDOVER_REQUIRED: 'Cần xác nhận bàn giao ca trước khi check-in. Liên hệ điều phối.',
  PREPAYMENT_REQUIRED: 'Chưa có đủ thanh toán trả trước đã xác minh. Liên hệ điều phối.',
  INVALID_STATE: 'Trạng thái hoặc thời gian ca không còn phù hợp. Tải lại tiến độ để kiểm tra.',
  SOURCE_RECONCILIATION_REQUIRED: 'Dữ liệu ca cần được điều phối đối chiếu trước khi tiếp tục.',
  CHECK_IN_TOO_EARLY: 'Chưa đến giờ check-in. Có thể bắt đầu từ 30 phút trước ca.',
  CHECK_OUT_DEADLINE_PASSED: 'Đã quá hạn check-out. Cần liên hệ điều phối để đối chiếu ca.',
  CHECKLIST_REQUIRED: 'Cần lưu đủ nội dung chăm sóc trước khi check-out.',
  CHECKLIST_INVALID: 'Nội dung chăm sóc chưa đầy đủ; mục không thực hiện cần ghi rõ lý do.',
  EVIDENCE_NOT_READY: 'Ảnh bằng chứng chưa sẵn sàng. Kiểm tra ảnh đã tải lên.',
  EVIDENCE_ALREADY_USED: 'Ảnh đã được dùng làm bằng chứng. Chọn ảnh khác cho thao tác này.',
  INVALID_PRIVATE_IMAGE: 'Chọn ảnh JPG hoặc PNG, tối đa 5 MB.',
  SHIFT_START_REACHED: 'Ca đã đến giờ. Cần khách xác nhận lịch mới trước khi mời người nhận ca.',
  NO_ELIGIBLE_SITTER: 'Chưa có nhân viên phù hợp với khu vực và ca này.',
  DIRECTED_SCHEDULE_REVIEW_REQUIRED: 'Nhân viên khách chỉ định chưa có ca phù hợp. Cần thống nhất lại lịch với khách.',
  STAFF_REVIEW_REQUIRED: 'Cần nhân viên điều phối xem lại lịch và các lời mời đã gửi.',
  SYSTEM_DISPATCH_IN_PROGRESS: 'Hệ thống đang tìm người nhận ca. Chỉ điều phối thủ công khi ca cần hỗ trợ.',
  DAY_ORIGIN_MISSING: 'Chưa có điểm xuất phát cho ngày làm việc. Cần cập nhật trước khi mời tự động.',
  CONTRACT_REQUIRED: 'Hợp đồng đã ký chưa bao phủ thời gian làm việc.',
  CONTRACT_HOURS_EXCEEDED: 'Ca này vượt giờ làm việc thông thường hoặc giờ trong hợp đồng.',
  WORK_AREA_MISMATCH: 'Ca nằm ngoài khu vực nhân viên đã đăng ký.',
  OUTSIDE_WORKING_HOURS: 'Ca nằm ngoài thời gian nhân viên đã đăng ký.',
  SLOT_UNAVAILABLE: 'Lịch này đã có công việc khác.',
  SERVICE_CAPABILITY_REQUIRED: 'Cần Staff xác nhận năng lực thực hiện dịch vụ này.',
  PET_CAPABILITY_MISMATCH: 'Điều kiện chăm sóc thú cưng chưa phù hợp với năng lực nhân viên.',
  TRAVEL_REVIEW_REQUIRED: 'Cần dữ liệu hành trình hiện hành để sắp xếp các địa điểm khác nhau.',
  TRAVEL_TIME_CONFLICT: 'Chưa đủ thời gian di chuyển và bàn giao giữa các ca.',
  DAY_OFF: 'Nhân viên đã có ngày nghỉ được xác nhận.',
  PAYMENT_REQUIRED: 'Cần xác minh đủ thanh toán trước khi gửi hoặc nhận lời mời.',
  VISIT_ALREADY_ASSIGNED: 'Buổi đã có người nhận.',
  VISIT_UNAVAILABLE: 'Ca chưa sẵn sàng nhận việc. Kiểm tra thanh toán và kế hoạch chăm sóc.',
  WITHDRAWAL_MODE_CHANGED: 'Thời gian còn lại đã thay đổi. Kiểm tra hộp thoại mới rồi xác nhận lại.',
  WITHDRAWAL_ALREADY_REQUESTED: 'Buổi này đã có yêu cầu rút đang chờ nhân viên.',
  SITTER_WITHDREW: 'Người chăm sóc này vừa rút khỏi buổi.',
  OFFER_EXPIRED: 'Lời mời đã hết hạn.', VERSION_CONFLICT: 'Dữ liệu đã thay đổi. Hãy tải lại.',
  SCHEDULING_STORAGE_NOT_READY: 'Chức năng lịch làm việc chưa được kích hoạt đầy đủ.'
};
export function useSchedulingCommand(onSuccess) {
  const operation = useRef(null), locked = useRef(false);
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(false), [message, setMessage] = useState(null);
  const execute = async work => {
    if (locked.current) return;
    if (work && pending) return;
    if (work) operation.current = { work, key: `schedule:${globalThis.crypto.randomUUID()}` };
    if (!operation.current) return;
    locked.current = true; setBusy(true); setMessage(null);
    try {
      const result = await operation.current.work(operation.current.key);
      if (result?.pending || result?.status === 202) { setPending(true); setMessage('Đang chờ xác nhận.'); return; }
      operation.current = null; setPending(false); setMessage('Đã xác nhận.'); onSuccess?.(result);
    } catch (error) {
      const uncertain = !error.status || error.status >= 500 || ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'INVALID_RESPONSE'].includes(error.code);
      setPending(uncertain);
      if (!uncertain) operation.current = null;
      setMessage(uncertain ? 'Chưa nhận được xác nhận. Kiểm tra lại cùng yêu cầu.' : errors[error.code] || 'Chưa thể thực hiện. Kiểm tra dữ liệu và tải lại.');
    } finally { locked.current = false; setBusy(false); }
  };
  return { execute, retry: () => execute(), busy, pending, message };
}
