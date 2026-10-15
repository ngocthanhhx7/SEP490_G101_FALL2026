import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Input, Notice, Select } from '../../components/ui/index.js';
import { incidentApi } from '../../services/incident-api.js';
import './incidents.css';

const SEVERITIES = [['LOW', 'Thấp'], ['MEDIUM', 'Trung bình'], ['HIGH', 'Cao'], ['CRITICAL', 'Nghiêm trọng']];
const URGENCIES = [['ROUTINE', 'Thông thường'], ['URGENT', 'Khẩn'], ['EMERGENCY', 'Khẩn cấp']];
const CATEGORIES = [['SAFETY', 'An toàn'], ['HEALTH_OBSERVATION', 'Quan sát sức khỏe'], ['MISSING_PET', 'Thú cưng thất lạc'], ['ACCESS', 'Ra vào'], ['PROPERTY', 'Tài sản'], ['BEHAVIOUR', 'Hành vi'], ['OTHER', 'Khác']];

export function IncidentReportPage({ api = incidentApi, visitId: suppliedVisitId, onComplete }) {
  const params = useParams();
  const visitId = suppliedVisitId || params.visitId;
  const [form, setForm] = useState({ severity: 'MEDIUM', urgency: 'ROUTINE', category: 'SAFETY', description: '', immediateAction: '', evidenceRefs: '' });
  const [status, setStatus] = useState({ state: 'idle' });
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async event => {
    event.preventDefault();
    if (!form.description.trim()) { setStatus({ state: 'error', message: 'Hãy mô tả sự cố bằng thông tin quan sát được.' }); return; }
    setStatus({ state: 'saving' });
    try {
      const result = await api.report({ visitId, severity: form.severity, urgency: form.urgency, category: form.category,
        description: form.description, immediateAction: form.immediateAction || undefined,
        evidenceRefs: form.evidenceRefs.split(',').map(value => value.trim()).filter(Boolean) });
      if (result?.pending) { setStatus({ state: 'pending', message: 'Yêu cầu đang chờ máy chủ xác nhận. Chưa coi sự cố là đã gửi.' }); return; }
      setStatus({ state: 'success', message: 'Máy chủ đã ghi nhận sự cố và chuyển Staff tiếp nhận.' });
      onComplete?.(result);
    } catch (error) {
      setStatus({ state: error.status === 403 ? 'forbidden' : 'error', message: error.code === 'VERSION_CONFLICT' ? 'Visit đã thay đổi. Tải lại trước khi gửi.' : 'Không thể gửi sự cố. Kiểm tra dữ liệu và thử lại.' });
    }
  };
  return <main className="incident-page incident-report" aria-labelledby="incident-report-title">
    <header className="incident-page__header"><p className="incident-page__eyebrow">VISIT {visitId || '—'}</p><h1 id="incident-report-title">Báo cáo sự cố</h1><p>Ghi nhận điều đã quan sát, bằng chứng riêng tư và mức khẩn cấp. Paw World Care không chẩn đoán hoặc kê đơn tự động.</p></header>
    {status.state === 'success' && <Notice state="success" title="Đã ghi nhận">{status.message}</Notice>}
    {status.state === 'pending' && <Notice state="pending" title="Đang chờ máy chủ">{status.message}</Notice>}
    {status.state === 'forbidden' && <Notice state="forbidden" title="Không có quyền báo cáo">Visit không thuộc Customer hoặc Sitter được giao.</Notice>}
    {status.state === 'error' && <Notice state="error" title="Không thể gửi sự cố">{status.message}</Notice>}
    <form className="incident-card incident-form" onSubmit={submit} aria-busy={status.state === 'saving'}>
      <Select label="Mức khẩn cấp" name="urgency" value={form.urgency} onChange={update} disabled={status.state === 'saving'}>{URGENCIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Select label="Mức độ" name="severity" value={form.severity} onChange={update} disabled={status.state === 'saving'}>{SEVERITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Select label="Loại sự cố" name="category" value={form.category} onChange={update} disabled={status.state === 'saving'}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <label className="incident-field"><span>Mô tả quan sát <b aria-hidden="true">*</b></span><textarea name="description" value={form.description} onChange={update} rows={6} maxLength={4000} required disabled={status.state === 'saving'} placeholder="Điều gì đã xảy ra? Ghi thời điểm, vị trí và biểu hiện quan sát được." /></label>
      <label className="incident-field"><span>Việc đã làm ngay</span><textarea name="immediateAction" value={form.immediateAction} onChange={update} rows={3} maxLength={2000} disabled={status.state === 'saving'} placeholder="Ví dụ: đưa thú cưng ra khu vực an toàn; không ghi chẩn đoán." /></label>
      <Input label="Mã bằng chứng riêng tư (phân tách bằng dấu phẩy)" name="evidenceRefs" value={form.evidenceRefs} onChange={update} disabled={status.state === 'saving'} hint="Chỉ dùng mã media đã được provider cấp; không dán liên kết công khai." />
      <p className="incident-form__hint">Staff sẽ tiếp nhận theo giờ vận hành đã được xác nhận và quyết định có cần liên hệ Customer hoặc cơ sở thú y hay không.</p>
      <Button type="submit" loading={status.state === 'saving'} loadingLabel="Đang gửi…" disabled={!visitId}>Gửi báo cáo sự cố</Button>
    </form>
  </main>;
}

export const ReportIncidentPage = IncidentReportPage;
