import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Input, Notice, Select } from '../../components/ui/index.js';
import { complaintApi } from '../../services/complaint-api.js';
import './review-complaint.css';

const categories = [['SERVICE_QUALITY', 'Chất lượng dịch vụ'], ['PET_SAFETY', 'An toàn thú cưng'], ['SITTER_CONDUCT', 'Hành vi Pet Sitter'], ['ACCESS', 'Ra vào / bàn giao'], ['BILLING', 'Thanh toán'], ['OTHER', 'Khác']];

export function ComplaintSubmitPage({ api = complaintApi, visitId: suppliedVisitId, expectedVersion, onComplete }) {
  const params = useParams(); const visitId = suppliedVisitId || params.visitId;
  const [form, setForm] = useState({ category: 'SERVICE_QUALITY', summary: '', description: '', evidenceRefs: '', requestedOutcome: '' });
  const [status, setStatus] = useState({ state: 'idle' });
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async event => {
    event.preventDefault();
    if (!visitId || !form.summary.trim() || !form.description.trim()) { setStatus({ state: 'error', message: 'Hãy nhập tiêu đề và nội dung complaint.' }); return; }
    setStatus({ state: 'saving' });
    try {
      const result = await api.submit({ visitId, expectedVersion, ...form, evidenceRefs: form.evidenceRefs.split(',').map(value => value.trim()).filter(Boolean) });
      if (result?.pending) { setStatus({ state: 'pending', message: 'Yêu cầu đang chờ máy chủ xác nhận. Chưa coi complaint là đã gửi.' }); return; }
      setStatus({ state: 'success', message: 'Complaint đã được ghi nhận và chuyển Staff xử lý.' }); onComplete?.(result);
    } catch (error) {
      const message = error?.code === 'COMPLAINT_WINDOW_EXPIRED' ? 'Thời hạn gửi complaint 7 ngày đã kết thúc.' : error?.code === 'COMPLAINT_ALREADY_OPEN' ? 'Visit này đã có complaint đang mở.' : error?.code === 'VERSION_CONFLICT' ? 'Visit đã thay đổi. Hãy tải lại trước khi gửi.' : 'Không thể gửi complaint. Kiểm tra dữ liệu và thử lại.';
      setStatus({ state: error?.status === 403 ? 'forbidden' : 'error', message });
    }
  };
  return <main className="review-complaint-page" aria-labelledby="complaint-submit-title">
    <header className="review-complaint-page__header"><p className="review-complaint-page__eyebrow">VISIT {visitId || '—'} · CUSTOMER</p><h1 id="complaint-submit-title">Gửi complaint</h1><p>Complaint chỉ được gửi trong 7 ngày từ lúc visit hoàn tất. Hệ thống giữ một complaint đang mở cho mỗi visit để Staff theo dõi nhất quán.</p></header>
    {status.state === 'success' && <Notice state="success" title="Đã ghi nhận">{status.message}</Notice>}
    {status.state === 'pending' && <Notice state="pending" title="Đang chờ máy chủ">{status.message}</Notice>}
    {status.state === 'forbidden' && <Notice state="forbidden" title="Không có quyền gửi complaint">Visit không thuộc Customer hiện tại.</Notice>}
    {status.state === 'error' && <Notice state="error" title="Không thể gửi complaint">{status.message}</Notice>}
    <form className="review-complaint-card review-complaint-form" onSubmit={submit} aria-busy={status.state === 'saving'}>
      <Select label="Nhóm vấn đề" name="category" value={form.category} onChange={update} disabled={status.state === 'saving'}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Input label="Tiêu đề" name="summary" value={form.summary} onChange={update} maxLength={500} required disabled={status.state === 'saving'} />
      <label className="review-complaint-field"><span>Nội dung complaint <b aria-hidden="true">*</b></span><textarea name="description" rows={7} maxLength={4000} value={form.description} onChange={update} required disabled={status.state === 'saving'} placeholder="Mô tả bối cảnh, thời điểm và điều cần Staff xác minh." /></label>
      <Input label="Mã bằng chứng riêng tư (phân tách bằng dấu phẩy)" name="evidenceRefs" value={form.evidenceRefs} onChange={update} disabled={status.state === 'saving'} hint="Chỉ dùng media ID do provider cấp; không dán URL công khai." />
      <label className="review-complaint-field"><span>Kết quả mong muốn</span><textarea name="requestedOutcome" rows={3} maxLength={2000} value={form.requestedOutcome} onChange={update} disabled={status.state === 'saving'} /></label>
      <Button type="submit" loading={status.state === 'saving'} disabled={!visitId}>Gửi complaint</Button>
    </form>
  </main>;
}

export const CustomerComplaintSubmitPage = ComplaintSubmitPage;
