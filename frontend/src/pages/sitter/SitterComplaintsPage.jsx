import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterComplaintApi } from '../../services/sitter-complaint-api.js';
import '../customer/review-complaint.css';

const labels = { OPEN: 'Đang mở', UNDER_REVIEW: 'Đang xem xét', RESOLVED: 'Đã phản hồi', CLOSED: 'Đã đóng', SERVICE_QUALITY: 'Chất lượng dịch vụ', PET_SAFETY: 'An toàn thú cưng', SITTER_CONDUCT: 'Hành vi Pet Sitter', ACCESS: 'Ra vào / bàn giao', BILLING: 'Thanh toán', OTHER: 'Khác' };
const label = value => labels[value] || value || 'Chưa cập nhật';
function date(value) { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(parsed) : 'Chưa có thời điểm'; }

function ComplaintCard({ item }) {
  return <li className="review-complaint-list__item"><div className="review-complaint-list__meta"><span className="review-complaint-pill">{label(item.state)}</span><span>{label(item.category)}</span><span>Visit {item.visitId}</span></div><h2>{item.summary || 'Complaint cần xem chi tiết'}</h2><p>{date(item.createdAt)}</p><Link className="pwc-button pwc-button--secondary" to={`/sitter/complaints/${item.id}`}>Mở complaint</Link></li>;
}

function Feedback({ item }) {
  return <><section className="review-complaint-card"><h2>{item.summary}</h2><p>{item.description}</p>{item.response && <><h3>Phản hồi xử lý</h3><p>{item.response.summary}</p>{item.response.actionsTaken && <p>{item.response.actionsTaken}</p>}{item.response.recordedAt && <small>{date(item.response.recordedAt)}</small>}</>}</section>{item.evidenceRefs?.length > 0 && <section className="review-complaint-card"><h2>Bằng chứng liên quan</h2><ul>{item.evidenceRefs.map(ref => <li key={ref.mediaId}>{ref.mediaId}{ref.caption ? ` · ${ref.caption}` : ''}</li>)}</ul><p>File chỉ được truy cập theo quyền máy chủ, không dùng URL công khai.</p></section>}</>;
}

export function SitterComplaintsPage({ api = sitterComplaintApi, complaintId: suppliedComplaintId }) {
  const params = useParams(); const complaintId = suppliedComplaintId || params.complaintId || params.caseId;
  const resource = useApiResource(useCallback(({ signal }) => complaintId ? api.get({ complaintId, signal }) : api.list({ signal }), [api, complaintId]));
  if (resource.status === 'loading') return <main className="review-complaint-page"><Notice state="loading" title="Đang tải complaint">Đang kiểm tra phạm vi các visit được giao.</Notice></main>;
  if (resource.status === 'pending') return <main className="review-complaint-page"><Notice state="pending" title="Đang chờ máy chủ">Dữ liệu chờ chưa được coi là đã xác nhận.</Notice></main>;
  if (resource.status === 'forbidden') return <main className="review-complaint-page"><Notice state="forbidden" title="Không có quyền xem complaint">Complaint không thuộc visit được giao cho Sitter hiện tại.</Notice></main>;
  if (resource.status === 'error') return <main className="review-complaint-page"><Notice state="error" title="Không tải được complaint" action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Kiểm tra kết nối hoặc quyền truy cập.</Notice></main>;
  if (complaintId) { const item = resource.data; return <main className="review-complaint-page" aria-labelledby="sitter-complaint-title"><header className="review-complaint-page__header"><p className="review-complaint-page__eyebrow">COMPLAINT {item.id} · VISIT {item.visitId}</p><h1 id="sitter-complaint-title">Complaint liên quan</h1><p>Tiến độ do máy chủ quyết định: <strong>{label(item.state)}</strong> · mở lúc {date(item.createdAt)}</p></header><Feedback item={item} /></main>; }
  const items = resource.data?.items || [];
  return <main className="review-complaint-page" aria-labelledby="sitter-complaints-title"><header className="review-complaint-page__header"><p className="review-complaint-page__eyebrow">PAW WORLD CARE · PET SITTER</p><h1 id="sitter-complaints-title">Complaint liên quan</h1><p>Chỉ complaint gắn với các visit được giao cho bạn được hiển thị.</p></header>{items.length === 0 ? <Notice state="empty" title="Chưa có complaint liên quan">Các visit được giao chưa có complaint trong phạm vi của bạn.</Notice> : <ol className="review-complaint-list" aria-label="Các complaint liên quan">{items.map(item => <ComplaintCard key={item.id} item={item} />)}</ol>}</main>;
}

export const SitterComplaintDetailsPage = SitterComplaintsPage;
