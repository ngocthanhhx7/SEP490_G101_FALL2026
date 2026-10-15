import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { reviewApi } from '../../services/review-api.js';
import './review-complaint.css';

export function VisitReviewPage({ api = reviewApi, visitId: suppliedVisitId, expectedVersion, onComplete }) {
  const params = useParams();
  const visitId = suppliedVisitId || params.visitId;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState({ state: 'idle' });
  const submit = async event => {
    event.preventDefault();
    if (!visitId || !rating) { setStatus({ state: 'error', message: 'Hãy chọn số sao trước khi gửi.' }); return; }
    setStatus({ state: 'saving' });
    try {
      const result = await api.rateVisit({ visitId, expectedVersion, rating, comment: comment || undefined });
      if (result?.pending) { setStatus({ state: 'pending', message: 'Yêu cầu đang chờ máy chủ xác nhận. Chưa coi đánh giá là đã gửi.' }); return; }
      setStatus({ state: 'success', message: 'Đánh giá đã được máy chủ ghi nhận.' }); onComplete?.(result);
    } catch (error) {
      const message = error?.code === 'REVIEW_ALREADY_EXISTS' ? 'Visit này đã có đánh giá.' : error?.code === 'VISIT_NOT_ELIGIBLE' ? 'Chỉ visit đã hoàn tất mới được đánh giá.' : error?.code === 'VERSION_CONFLICT' ? 'Visit đã thay đổi. Hãy tải lại trước khi gửi.' : 'Không thể gửi đánh giá. Kiểm tra mạng và thử lại.';
      setStatus({ state: error?.status === 403 ? 'forbidden' : 'error', message });
    }
  };
  return <main className="review-complaint-page" aria-labelledby="visit-review-title">
    <header className="review-complaint-page__header"><p className="review-complaint-page__eyebrow">VISIT {visitId || '—'} · CUSTOMER</p><h1 id="visit-review-title">Đánh giá Pet Sitter</h1><p>Chia sẻ trải nghiệm sau khi visit đã hoàn tất. Đánh giá được giới hạn trong visit này và không công khai thông tin cá nhân.</p></header>
    {status.state === 'success' && <Notice state="success" title="Đã ghi nhận">{status.message}</Notice>}
    {status.state === 'pending' && <Notice state="pending" title="Đang chờ máy chủ">{status.message}</Notice>}
    {status.state === 'forbidden' && <Notice state="forbidden" title="Không có quyền đánh giá">Phiên hiện tại không phải Customer của visit.</Notice>}
    {status.state === 'error' && <Notice state="error" title="Không thể gửi đánh giá">{status.message}</Notice>}
    <form className="review-complaint-card review-complaint-form" onSubmit={submit} aria-busy={status.state === 'saving'}>
      <fieldset className="review-complaint-field" disabled={status.state === 'saving'}><legend>Điểm đánh giá <b aria-hidden="true">*</b></legend><div className="review-complaint-rating" role="group" aria-label="Chọn số sao">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" aria-pressed={rating === value} aria-label={`${value} sao`} onClick={() => setRating(value)}>{value}★</button>)}</div></fieldset>
      <label className="review-complaint-field"><span>Nhận xét (không bắt buộc)</span><textarea rows={6} maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} disabled={status.state === 'saving'} placeholder="Điều bạn hài lòng hoặc muốn Paw World Care cải thiện" /></label>
      <Button type="submit" loading={status.state === 'saving'} disabled={!visitId}>Gửi đánh giá</Button>
    </form>
  </main>;
}

export const RateVisitPage = VisitReviewPage;
