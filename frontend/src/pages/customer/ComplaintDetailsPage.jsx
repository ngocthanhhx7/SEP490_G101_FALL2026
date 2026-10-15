import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { complaintApi } from '../../services/complaint-api.js';
import './review-complaint.css';

const labels = { OPEN: 'Đang mở', UNDER_REVIEW: 'Đang xem xét', RESOLVED: 'Đã phản hồi', CLOSED: 'Đã đóng', SERVICE_QUALITY: 'Chất lượng dịch vụ', PET_SAFETY: 'An toàn thú cưng', SITTER_CONDUCT: 'Hành vi Pet Sitter', ACCESS: 'Ra vào / bàn giao', BILLING: 'Thanh toán', OTHER: 'Khác' };
const label = value => labels[value] || value || 'Chưa cập nhật';
function date(value) { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(parsed) : 'Chưa có thời điểm'; }

export function ComplaintDetailsPage({ api = complaintApi, complaintId: suppliedComplaintId, onComplete }) {
  const params = useParams(); const complaintId = suppliedComplaintId || params.complaintId || params.caseId;
  const resource = useApiResource(useCallback(({ signal }) => api.get({ complaintId, signal }), [api, complaintId]));
  const [reason, setReason] = useState(''); const [command, setCommand] = useState({ state: 'idle' });
  const submitObjection = async event => {
    event.preventDefault(); if (!reason.trim() || !resource.data) return;
    setCommand({ state: 'saving' });
    try {
      const result = await api.disagree({ complaintId, expectedVersion: resource.data.version, reason });
      if (result?.pending) { setCommand({ state: 'pending', message: 'Yêu cầu đang chờ máy chủ xác nhận.' }); return; }
      setCommand({ state: 'success', message: 'Ý kiến không đồng ý đã được ghi nhận một lần.' }); setReason(''); onComplete?.(result); resource.retry();
    } catch (error) { setCommand({ state: error?.status === 403 ? 'forbidden' : 'error', message: error?.code === 'OBJECTION_ALREADY_USED' ? 'Lượt không đồng ý đã được sử dụng.' : error?.code === 'VERSION_CONFLICT' ? 'Complaint đã thay đổi. Hãy tải lại trước khi gửi.' : 'Không thể gửi ý kiến. Hãy thử lại.' }); }
  };
  if (resource.status === 'loading') return <main className="review-complaint-page"><Notice state="loading" title="Đang tải complaint">Đang kiểm tra quyền truy cập.</Notice></main>;
  if (resource.status === 'pending') return <main className="review-complaint-page"><Notice state="pending" title="Đang chờ máy chủ">Chi tiết chờ chưa được coi là đã xác nhận.</Notice></main>;
  if (resource.status === 'forbidden') return <main className="review-complaint-page"><Notice state="forbidden" title="Không có quyền xem complaint">Complaint không thuộc phạm vi phiên hiện tại.</Notice></main>;
  if (resource.status === 'error' || !resource.data) return <main className="review-complaint-page"><Notice state="error" title="Không tải được complaint" action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Mã complaint có thể không hợp lệ hoặc đã bị ẩn.</Notice></main>;
  const item = resource.data;
  return <main className="review-complaint-page" aria-labelledby="complaint-details-title">
    <header className="review-complaint-page__header"><p className="review-complaint-page__eyebrow">COMPLAINT {item.id} · VISIT {item.visitId}</p><h1 id="complaint-details-title">Theo dõi complaint</h1><p>Trạng thái được quyết định bởi máy chủ: <strong>{label(item.state)}</strong>.</p></header>
    {command.state !== 'idle' && <Notice state={command.state} title={command.state === 'success' ? 'Đã ghi nhận' : 'Trạng thái yêu cầu'}>{command.message}</Notice>}
    <section className="review-complaint-card"><dl className="review-complaint-facts"><div><dt>Nhóm vấn đề</dt><dd>{label(item.category)}</dd></div><div><dt>Mở lúc</dt><dd>{date(item.createdAt)}</dd></div><div><dt>Settlement</dt><dd>{item.settlement?.state === 'ON_HOLD' ? 'Đang giữ để xử lý' : 'Không bị giữ'}</dd></div></dl><h2>{item.summary}</h2><p>{item.description}</p>{item.requestedOutcome && <><h3>Kết quả mong muốn</h3><p>{item.requestedOutcome}</p></>}</section>
    {item.evidenceRefs?.length > 0 && <section className="review-complaint-card"><h2>Bằng chứng riêng tư</h2><ul>{item.evidenceRefs.map(ref => <li key={ref.mediaId}>{ref.mediaId}{ref.caption ? ` · ${ref.caption}` : ''}</li>)}</ul><p>Ảnh và file không được phát hành bằng URL công khai.</p></section>}
    {item.response && <section className="review-complaint-card"><h2>Phản hồi xử lý</h2><p>{item.response.summary}</p>{item.response.actionsTaken && <p>{item.response.actionsTaken}</p>}{item.response.recordedAt && <small>{date(item.response.recordedAt)}</small>}</section>}
    {item.state === 'RESOLVED' && item.objection?.allowed && <form className="review-complaint-card review-complaint-form" onSubmit={submitObjection}><h2>Không đồng ý với phản hồi</h2><p>Bạn có một lượt phản hồi không đồng ý. Sau đó Admin sẽ đưa ra quyết định cuối.</p><label className="review-complaint-field"><span>Lý do <b aria-hidden="true">*</b></span><textarea rows={5} value={reason} onChange={event => setReason(event.target.value)} maxLength={4000} disabled={command.state === 'saving'} required /></label><Button type="submit" loading={command.state === 'saving'}>Gửi ý kiến</Button></form>}
  </main>;
}

export const CustomerComplaintDetailsPage = ComplaintDetailsPage;
