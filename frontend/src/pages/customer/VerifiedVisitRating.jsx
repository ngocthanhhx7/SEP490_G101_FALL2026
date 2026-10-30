import { useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '../../components/ui/index.js';
export function VerifiedVisitRating({ api, visit }) {
  const [rating, setRating] = useState(5), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [saved, setSaved] = useState(false), [uncertain, setUncertain] = useState(false);
  const attempt = useRef(null), locked = useRef(false);
  async function submit(event) {
    event.preventDefault(); if (locked.current) return;
    if (!uncertain) attempt.current = { rating, expectedVersion: visit.version, key: globalThis.crypto.randomUUID() };
    locked.current = true; setBusy(true); setMessage('');
    try {
      const { key, ...body } = attempt.current;
      await api.rateVisit(visit.id, body, key); setSaved(true); setUncertain(false); setMessage('Đã ghi nhận đánh giá của bạn.');
    } catch (error) {
      setUncertain(['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'COMMAND_PENDING', 'INVALID_RESPONSE', 'ABORTED'].includes(error.code) || error.status >= 500);
      if (error.code === 'REVIEW_ALREADY_EXISTS') { setSaved(true); setMessage('Ca này đã được đánh giá.'); }
      else setMessage('Chưa ghi nhận được đánh giá. Đơn cần hoàn tất và có nguồn xác minh buổi chăm sóc.');
    } finally { locked.current = false; setBusy(false); }
  }
  return <form className="pwc-visit-rating" onSubmit={submit} aria-label={`Đánh giá ca ${visit.id}`}><h4>{visit.serviceName}</h4>
    {!saved && <><label>Mức hài lòng<select value={rating} disabled={busy || uncertain} onChange={event => setRating(Number(event.target.value))}>
      {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} sao</option>)}</select></label>
      <Button type="submit" disabled={busy}><Star size={16} />{uncertain ? 'Kiểm tra lại đánh giá' : 'Gửi đánh giá'}</Button></>}
    {message && <p role="status">{message}</p>}
  </form>;
}
