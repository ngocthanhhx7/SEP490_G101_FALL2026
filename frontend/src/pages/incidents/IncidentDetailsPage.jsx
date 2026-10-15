import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Input, Notice, Select } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { incidentApi } from '../../services/incident-api.js';
import './incidents.css';

const LABELS = { OPEN: 'Đang mở', UNDER_REVIEW: 'Đang xem xét', RESOLVED: 'Đã giải quyết', CLOSED: 'Đã đóng', LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Nghiêm trọng', ROUTINE: 'Thông thường', URGENT: 'Khẩn', EMERGENCY: 'Khẩn cấp' };
const label = value => LABELS[value] || value || 'Chưa xác định';
function formatDate(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date) : 'Chưa có thời điểm'; }
function errorText(error) { if (error?.code === 'VERSION_CONFLICT') return 'Sự cố đã được cập nhật bởi người khác. Tải lại trước khi gửi.'; if (error?.code === 'FORBIDDEN') return 'Phiên hiện tại không có quyền xử lý.'; return 'Không thể hoàn tất thao tác. Kiểm tra mạng và thử lại.'; }

export function IncidentDetailsPage({ api = incidentApi, caseId: suppliedCaseId }) {
  const params = useParams();
  const caseId = suppliedCaseId || params.caseId || params.incidentId;
  const session = useSession();
  const [form, setForm] = useState({ targetState: 'UNDER_REVIEW', summary: '', actionsTaken: '', followUp: '', staffNotes: '' });
  const [command, setCommand] = useState({ state: 'idle' });
  const load = useCallback(({ signal }) => api.get({ caseId, signal }), [api, caseId]);
  const resource = useApiResource(load);
  const item = resource.data;
  const roles = session.user?.roles || session.user?.role ? (session.user.roles || [session.user.role]) : [];
  const canResolve = roles.includes('STAFF') || roles.includes('ADMIN');
  const submit = async event => {
    event.preventDefault(); if (!item || !form.summary.trim()) return;
    setCommand({ state: 'saving' });
    try {
      const result = await api.resolve({ caseId, expectedVersion: item.version, targetState: form.targetState, summary: form.summary,
        actionsTaken: form.actionsTaken || undefined, followUp: form.followUp || undefined, staffNotes: form.staffNotes || undefined });
      if (result?.pending) { setCommand({ state: 'pending', message: 'Yêu cầu đang chờ máy chủ. Chưa coi case đã thay đổi.' }); return; }
      setCommand({ state: 'success', message: 'Máy chủ đã xác nhận cập nhật xử lý.' }); resource.retry();
    } catch (error) { setCommand({ state: error.status === 403 ? 'forbidden' : 'error', message: errorText(error) }); }
  };
  if (resource.status === 'loading') return <main className="incident-page"><Notice state="loading" title="Đang tải sự cố">Đang kiểm tra quyền truy cập.</Notice></main>;
  if (resource.status === 'pending') return <main className="incident-page"><Notice state="pending" title="Đang chờ máy chủ">Chi tiết chờ chưa được coi là đã xác nhận.</Notice></main>;
  if (resource.status === 'forbidden') return <main className="incident-page"><Notice state="forbidden" title="Không có quyền xem sự cố">Case không thuộc phạm vi phiên.</Notice></main>;
  if (resource.status === 'error' || !item) return <main className="incident-page"><Notice state="error" title="Không tải được sự cố" action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Sự cố có thể đã bị ẩn hoặc mã không hợp lệ.</Notice></main>;
  return <main className="incident-page incident-details" aria-labelledby="incident-details-title">
    <header className="incident-page__header"><p className="incident-page__eyebrow">CASE {item.id} · VISIT {item.visitId}</p><h1 id="incident-details-title">Chi tiết và xử lý sự cố</h1><p>Trạng thái: <strong>{label(item.state)}</strong> · Mức khẩn cấp: <strong>{label(item.urgency || item.severity)}</strong></p></header>
    {command.state !== 'idle' && <Notice state={command.state} title={command.state === 'success' ? 'Đã xác nhận' : 'Trạng thái yêu cầu'}>{command.message}</Notice>}
    <section className="incident-card"><h2>Thông tin ghi nhận</h2><dl className="incident-facts"><div><dt>Loại</dt><dd>{label(item.category)}</dd></div><div><dt>Thời điểm</dt><dd>{formatDate(item.createdAt)}</dd></div><div><dt>Mô tả</dt><dd>{item.description}</dd></div><div><dt>Việc đã làm ngay</dt><dd>{item.immediateAction || 'Chưa có'}</dd></div></dl></section>
    <section className="incident-card"><h2>Dòng thời gian</h2>{item.timeline?.length ? <ol className="incident-timeline">{item.timeline.map((event, index) => <li key={`${event.type}-${index}`}><strong>{event.type}</strong><p>{event.note}</p><time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time></li>)}</ol> : <Notice state="empty" title="Chưa có cập nhật">Dòng thời gian sẽ xuất hiện khi Staff ghi nhận thao tác.</Notice>}</section>
    {item.evidenceRefs?.length > 0 && <section className="incident-card"><h2>Bằng chứng riêng tư</h2><ul>{item.evidenceRefs.map(ref => <li key={ref.mediaId}>{ref.mediaId}{ref.caption ? ` · ${ref.caption}` : ''}</li>)}</ul></section>}
    {canResolve && item.state !== 'CLOSED' && <form className="incident-card incident-form" onSubmit={submit}><h2>Ghi nhận xử lý</h2><Select label="Chuyển trạng thái" value={form.targetState} onChange={event => setForm({ ...form, targetState: event.target.value })} disabled={command.state === 'saving'}><option value="UNDER_REVIEW">Đang xem xét</option><option value="RESOLVED">Đã giải quyết</option>{roles.includes('ADMIN') && <option value="CLOSED">Đóng case</option>}</Select><Input label="Tóm tắt xử lý" required maxLength={4000} value={form.summary} onChange={event => setForm({ ...form, summary: event.target.value })} disabled={command.state === 'saving'} /><label className="incident-field"><span>Việc đã thực hiện</span><textarea value={form.actionsTaken} onChange={event => setForm({ ...form, actionsTaken: event.target.value })} rows={3} maxLength={4000} disabled={command.state === 'saving'} /></label><label className="incident-field"><span>Việc cần theo dõi</span><textarea value={form.followUp} onChange={event => setForm({ ...form, followUp: event.target.value })} rows={3} maxLength={2000} disabled={command.state === 'saving'} /></label><label className="incident-field"><span>Ghi chú nội bộ Staff</span><textarea value={form.staffNotes} onChange={event => setForm({ ...form, staffNotes: event.target.value })} rows={3} maxLength={8000} disabled={command.state === 'saving'} /></label><p className="incident-form__hint">Quyết định tiền, giữ tiền hoặc hoàn tiền phải đi qua Admin và contract tài chính; màn này không tự tính hoặc tự giải ngân.</p><Button type="submit" loading={command.state === 'saving'}>Lưu xử lý</Button></form>}
  </main>;
}

export const IncidentResolutionPage = IncidentDetailsPage;
