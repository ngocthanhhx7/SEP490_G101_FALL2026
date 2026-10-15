import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { sitterReviewApi } from '../../services/sitter-review-api.js';
import './sitter-feedback.css';

export function SitterVisitReviewPage({ api = sitterReviewApi, visitId: suppliedVisitId, expectedVersion, onComplete }) {
  const { visitId: routeVisitId } = useParams(); const visitId = suppliedVisitId || routeVisitId;
  const [rating, setRating] = useState(0); const [comment, setComment] = useState(''); const [status, setStatus] = useState({ state: 'idle' });
  const submit = async event => {
    event.preventDefault();
    if (!visitId || !rating) { setStatus({ state: 'error', message: 'Hãy chọn số sao trước khi gửi.' }); return; }
    setStatus({ state: 'saving' });
    try {
      const result = await api.rateCustomer({ visitId, expectedVersion, rating, comment: comment || undefined });
      if (result?.pending) { setStatus({ state: 'pending', message: 'Yêu cầu đang chờ máy chủ xác nhận. Chưa coi đánh giá là đã gửi.' }); return; }
      setStatus({ state: 'success', message: 'Đánh giá Customer đã được máy chủ ghi nhận.' }); onComplete?.(result);
    } catch (error) {
      const message = error?.code === 'REVIEW_ALREADY_EXISTS' ? 'Visit này đã có đánh giá theo hướng Sitter → Customer.'
        : error?.code === 'VISIT_NOT_ELIGIBLE' ? 'Chỉ visit đã hoàn tất và được giao cho bạn mới được đánh giá.'
          : error?.code === 'DECISION_REQUIRED' ? 'Quy tắc thời hạn và moderation cho đánh giá Sitter chưa được cấu hình.'
            : error?.code === 'VERSION_CONFLICT' ? 'Visit đã thay đổi. Hãy tải lại trước khi gửi.' : 'Không thể gửi đánh giá. Hãy thử lại.';
      setStatus({ state: error?.status === 403 ? 'forbidden' : 'error', message });
    }
  };
  return <main className="sitter-feedback-page" aria-labelledby="sitter-review-title">
    <header className="sitter-feedback-page__header"><p>VISIT {visitId || '—'} · PET SITTER</p><h1 id="sitter-review-title">Đánh giá Customer</h1><p>Đánh giá chỉ gắn với visit đã được giao và máy chủ quyết định quyền, thời hạn và trạng thái moderation.</p></header>
    {status.state === 'success' && <Notice state="success" title="Đã ghi nhận">{status.message}</Notice>}
    {status.state === 'pending' && <Notice state="pending" title="Đang chờ máy chủ">{status.message}</Notice>}
    {status.state === 'forbidden' && <Notice state="forbidden" title="Không có quyền đánh giá">Visit không thuộc Sitter hiện tại.</Notice>}
    {status.state === 'error' && <Notice state="error" title="Không thể gửi đánh giá">{status.message}</Notice>}
    <form className="sitter-feedback-card" onSubmit={submit} aria-busy={status.state === 'saving'}>
      <fieldset disabled={status.state === 'saving'}><legend>Điểm đánh giá <b aria-hidden="true">*</b></legend><div className="sitter-feedback-rating" role="group" aria-label="Chọn số sao">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" aria-pressed={rating === value} aria-label={`${value} sao`} onClick={() => setRating(value)}>{value}★</button>)}</div></fieldset>
      <label><span>Nhận xét (không bắt buộc)</span><textarea rows={6} maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} disabled={status.state === 'saving'} /></label>
      <Button type="submit" loading={status.state === 'saving'} disabled={!visitId}>Gửi đánh giá</Button>
    </form>
  </main>;
}

export const SitterRateCustomerPage = SitterVisitReviewPage;
