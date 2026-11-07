import { useRef, useEffect, useState } from 'react';
import { Button } from '../ui/index.js';

const reasons = {
  UNVERIFIED_SOURCE: 'Chưa có nguồn đánh giá khách hàng được xác minh',
  DEMO_OR_MISSING_ACCOUNT: 'Dữ liệu demo hoặc thiếu tài khoản nguồn',
  REVIEW_SOURCE_CHANGED_OR_WITHHELD: 'Đánh giá hoặc nguồn đối chiếu đã thay đổi',
  COMPLETION_SOURCE_CHANGED: 'Chưa đối chiếu được hoàn tất dịch vụ và công chăm sóc',
  MISSING_DECISION_FEATURES: 'Thiếu đặc trưng tại thời điểm gợi ý',
  INVALID_OR_LATE_FEATURES: 'Đặc trưng không hợp lệ hoặc được ghi sau quyết định',
};
export function AiTrainingReadiness({ api, disabled }) {
  const [state, setState] = useState({ busy: false, data: null, error: null });
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function inspect() {
    if (state.busy) return;
    const current = new AbortController(); controller.current = current;
    setState({ busy: true, data: null, error: null });
    try {
      const result = await api.trainingReadiness({ signal: current.signal });
      if (!current.signal.aborted) setState({ busy: false, data: result.data, error: null });
    } catch (error) {
      if (!current.signal.aborted) setState({ busy: false, data: null, error: error.code });
    }
  }
  const data = state.data;
  return <section><h2>Đối chiếu dữ liệu huấn luyện</h2>
    <p>Kiểm tra nguồn đánh giá, hoàn tất dịch vụ và đặc trưng tại lúc gợi ý. Chỉ đọc dữ liệu, không huấn luyện hay kích hoạt model.</p>
    <Button disabled={disabled || state.busy} onClick={inspect}>{state.busy ? 'Đang đối chiếu…' : 'Kiểm tra dữ liệu đủ điều kiện'}</Button>
    {state.error && <p role="alert">Chưa hoàn tất đối chiếu. {state.error === 'TRAINING_AUDIT_TIMEOUT' ? 'Cần chạy kiểm tra đầy đủ bằng công cụ offline.' : 'Thử lại khi kết nối sẵn sàng.'}</p>}
    {data && <div role="status"><p>Đã quét {data.scanned} kết quả · Hợp lệ {data.eligibleRows} mẫu từ {data.bookingGroups} lịch đặt độc lập.</p>
      <p>Trong dữ liệu đã đối chiếu, còn thiếu {data.missingObservations} mẫu và {data.missingBookingGroups} lịch đặt để đạt ngưỡng số lượng.</p>
      <p>{data.truncated ? 'Đã chạm giới hạn kiểm tra trên web. Cần kiểm tra toàn bộ bằng công cụ offline.' : data.readyForTraining ? 'Đạt ngưỡng số lượng. Cần xuất dữ liệu và kiểm định theo thời gian trước khi duyệt model.' : 'Chưa đủ điều kiện train. Tiếp tục ghi nhận ca hoàn tất và đánh giá hợp lệ.'}</p>
      <ul>{Object.entries(data.excluded).map(([reason, count]) => <li key={reason}>{reasons[reason] ?? 'Chưa đáp ứng đối chiếu nguồn'}: {count}</li>)}</ul>
      <p>Phạm vi tối đa {data.scanLimit} kết quả; dữ liệu công khai, demo và báo cáo tổng hợp không thay thế đánh giá khách hàng thật.</p>
    </div>}
  </section>;
}
