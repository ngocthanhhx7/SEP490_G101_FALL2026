import { useRef, useState } from 'react';

const errors = {
  NO_ELIGIBLE_SITTER: 'Chưa có nhân viên phù hợp với khu vực và ca này.',
  DIRECTED_SCHEDULE_REVIEW_REQUIRED: 'Nhân viên khách chỉ định chưa có ca phù hợp. Cần thống nhất lại lịch với khách.',
  STAFF_REVIEW_REQUIRED: 'Cần nhân viên điều phối xem lại lịch và các lời mời đã gửi.',
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
  VISIT_UNAVAILABLE: 'Ca chưa sẵn sàng nhận việc. Kiểm tra thanh toán và kế hoạch chăm sóc.',
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
      operation.current = null; setPending(false); setMessage('Đã xác nhận.'); onSuccess?.();
    } catch (error) {
      const uncertain = !error.status || ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR'].includes(error.code);
      setPending(uncertain);
      if (!uncertain) operation.current = null;
      setMessage(uncertain ? 'Chưa nhận được xác nhận. Kiểm tra lại cùng yêu cầu.' : errors[error.code] || 'Chưa thể thực hiện. Kiểm tra dữ liệu và tải lại.');
    } finally { locked.current = false; setBusy(false); }
  };
  return { execute, retry: () => execute(), busy, pending, message };
}
