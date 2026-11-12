import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { Button, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createComplaintApi } from '../../services/complaint-api.js';
import { createPrivateImageApi, PRIVATE_IMAGE_MAX_BYTES } from '../../services/private-image-api.js';
import { bookingPath, complaintDeadline, complaintError, complaintVisitStart, complaintVisitTime, retryKey } from '../../utils/complaint-presentation.js';
import { ComplaintResultList } from './ComplaintResultList.jsx';
import './complaint-submit.css';

const IMAGE_LIMIT = 20;
const IMAGE_TYPES = ['image/jpeg', 'image/png'];

function PhotoTile({ photo, onRemove, busy }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return;
    const objectUrl = URL.createObjectURL(photo.file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.file]);
  return <div className="complaint-photo">
    {url ? <img src={url} alt={photo.file.name} /> : <span>{photo.file.name}</span>}
    <button type="button" aria-label={'Bỏ ảnh ' + photo.file.name} disabled={busy} onClick={onRemove}><X size={17} /></button>
  </div>;
}

function ComplaintForm({ data, visit, bookingId, api, imageApi, onSubmitted }) {
  const operation = useRef(null), locked = useRef(false);
  const [choice, setChoice] = useState(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const { booking, wholeBooking } = data;
  const canVisit = visit?.eligibility.eligible === true;
  const canWhole = wholeBooking.eligible && (visit ? visit.canSubmit : wholeBooking.aboveVisitTable);
  const scope = canVisit && (choice !== 'BOOKING' || !canWhole) ? 'VISIT' : 'BOOKING';
  const deadline = complaintDeadline(scope === 'VISIT' ? visit.eligibility.deadlineAt : wholeBooking.deadlineAt);
  const visitStart = complaintVisitStart(visit?.startAt);
  const cutoff = scope === 'BOOKING' ? 'lịch đặt kết thúc' :
    visit.state === 'STAFF_CLOSED' ? 'buổi được đóng' : 'buổi kết thúc';

  function choosePhotos(event) {
    const files = [...event.target.files];
    event.target.value = '';
    if (photos.length + files.length > IMAGE_LIMIT) { setPhotoError('Bạn có thể thêm tối đa 20 ảnh.'); return; }
    if (files.some(file => !IMAGE_TYPES.includes(file.type) || file.size < 1 || file.size > PRIVATE_IMAGE_MAX_BYTES)) {
      setPhotoError('Chọn ảnh PNG hoặc JPEG không quá 5 MB.');
      return;
    }
    setPhotoError('');
    setPhotos(previous => [...previous, ...files.map(file => ({ file, key: globalThis.crypto.randomUUID() }))]);
  }

  async function submit(event) {
    event.preventDefault();
    if (locked.current || (!canVisit && !canWhole)) return;
    if (!description.trim()) { setError({ description: true, text: 'Trường này là bắt buộc.' }); return; }
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const evidenceRefs = [];
      for (const photo of photos) {
        const uploaded = await imageApi.upload(photo.file, { idempotencyKey: photo.key });
        evidenceRefs.push(uploaded.id);
      }
      const payload = {
        scope, bookingId, ...(scope === 'VISIT' ? { visitId: visit.id } : {}),
        expectedVersion: (scope === 'VISIT' ? visit.version : booking.version) ?? undefined,
        description: description.trim(), evidenceRefs
      };
      const result = await api.submit({ ...payload, idempotencyKey: retryKey(operation, payload) });
      if (result.pending) { setError({ text: 'Đang chờ xác nhận. Hãy thử lại để kiểm tra.' }); return; }
      setDescription('');
      setPhotos([]);
      operation.current = null;
      onSubmitted(result.data.complaint ?? result.data);
    } catch (failure) {
      setError({
        description: Boolean(failure.fieldErrors?.description),
        text: complaintError(failure, 'Không gửi được khiếu nại. Hãy thử lại.')
      });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  if (!canVisit && !canWhole) {
    const reason = visit?.eligibility.reason ?? wholeBooking.reason;
    return <div className="complaint-panel">
      <h2>Nội dung khiếu nại</h2>
      <p>{complaintError({ code: reason }, 'Buổi hoặc lịch đặt này hiện chưa đủ điều kiện gửi khiếu nại.')}</p>
    </div>;
  }

  return <form className="complaint-panel complaint-form" onSubmit={submit} noValidate aria-busy={busy || undefined}>
    <h2>Nội dung khiếu nại</h2>
    <fieldset disabled={busy} className="complaint-scopes">
      <legend>Khiếu nại về <span aria-hidden="true">*</span></legend>
      <div>
        {visit && <label><input type="radio" name="complaint-scope" checked={scope === 'VISIT'} disabled={!canVisit}
          onChange={() => setChoice('VISIT')} /><span>Buổi này{visitStart ? ' (' + visitStart + ')' : ''}</span></label>}
        {(canWhole || visit) && <label><input type="radio" name="complaint-scope" checked={scope === 'BOOKING'} disabled={!canWhole}
          onChange={() => setChoice('BOOKING')} /><span>Cả lịch đặt{booking.code ? ' ' + booking.code : ''}</span></label>}
      </div>
    </fieldset>
    <label className="complaint-field" htmlFor="complaint-description">Điều chưa ổn <span aria-hidden="true">*</span></label>
    <textarea id="complaint-description" rows={5} maxLength={1000} value={description} disabled={busy} required
      aria-invalid={error?.description || undefined}
      aria-describedby={error?.description ? 'complaint-description-error' : 'complaint-description-limit'}
      onChange={event => { setDescription(event.target.value); setError(null); }} />
    {error?.description && <p className="complaint-form-error" id="complaint-description-error" role="alert">{error.text}</p>}
    <p id="complaint-description-limit" className="complaint-form__hint">Tối đa 1.000 ký tự.</p>
    <fieldset disabled={busy} className="complaint-photos">
      <legend>Ảnh <span>(không bắt buộc)</span></legend>
      <div className="complaint-photos__grid">
        {photos.map(photo => <PhotoTile key={photo.key} photo={photo} busy={busy}
          onRemove={() => { setPhotoError(''); setPhotos(previous => previous.filter(item => item.key !== photo.key)); }} />)}
        {photos.length < IMAGE_LIMIT && <label className="complaint-photo-add">
          <input type="file" accept="image/jpeg,image/png" multiple aria-label="Thêm ảnh" onChange={choosePhotos} />
          <Plus size={25} aria-hidden="true" />
        </label>}
      </div>
      {photoError && <p className="complaint-form-error" role="alert">{photoError}</p>}
    </fieldset>
    <aside className="complaint-form__note">
      {deadline && <p>Bạn gửi được khiếu nại đến {deadline} (7 ngày sau khi {cutoff}). Mỗi buổi chỉ có một khiếu nại đang mở.</p>}
      <p>Khi khiếu nại chưa có kết quả cuối, hoá đơn của lịch đặt được giữ lại.</p>
    </aside>
    {error && !error.description && <p className="complaint-form-error" role="alert">{error.text}</p>}
    <div className="complaint-form-actions">
      <Link to={bookingPath(bookingId)} className="pwc-button pwc-button--secondary">Hủy</Link>
      <Button type="submit" loading={busy}>Gửi khiếu nại</Button>
    </div>
  </form>;
}

function ComplaintWorkspace({ bookingId, visitId, selectedId, api, imageApi }) {
  const eligibility = useApiResource(useCallback(({ signal }) => api.eligibility({ bookingId, signal }), [api, bookingId]));
  const [submitted, setSubmitted] = useState(null);
  const data = eligibility.data;
  const visit = data?.visits.find(row => row.id === visitId);
  const booking = data?.booking;
  const context = visit
    ? [visit.serviceName, complaintVisitTime(visit), visit.sitterName,
      booking?.code ? 'Lịch đặt ' + booking.code : null]
    : [booking?.code ? 'Lịch đặt ' + booking.code : null, booking?.serviceName, complaintVisitTime(booking)];
  return <section className="complaint-submit" aria-labelledby="complaint-submit-title">
    <header className="complaint-submit__header">
      <Link to={bookingPath(bookingId)}><ArrowLeft size={18} aria-hidden="true" />Quay lại chi tiết lịch đặt</Link>
      <h1 id="complaint-submit-title">Gửi khiếu nại</h1>
      {context.some(Boolean) && <p>{context.filter(Boolean).join(' · ')}</p>}
    </header>
    {submitted && <Notice state="success" title="Khiếu nại của bạn đã được gửi.">Bạn có thể xem kết quả tại đây.</Notice>}
    <div className="complaint-submit__columns">
      {eligibility.status === 'success' ? <ComplaintForm key={visit?.id ?? bookingId} data={data}
        bookingId={bookingId} visit={visit} api={api} imageApi={imageApi}
        onSubmitted={item => { setSubmitted(item); eligibility.retry(); }} />
        : eligibility.status === 'loading' ? <Notice state="loading" title="Đang tải thông tin lịch đặt…" />
          : <Notice state="error" title="Chưa tải được điều kiện gửi khiếu nại"
            action={<Button variant="secondary" onClick={eligibility.retry}>Thử lại</Button>} />}
      <ComplaintResultList api={api} bookingId={bookingId} selectedId={selectedId} submitted={submitted} />
    </div>
  </section>;
}

export function ComplaintSubmitPage() {
  const { bookingId } = useParams(), [query] = useSearchParams();
  const { getCsrfToken } = useSession();
  const api = useMemo(() => createComplaintApi({ getCsrfToken }), [getCsrfToken]);
  const imageApi = useMemo(() => createPrivateImageApi({ getCsrfToken }), [getCsrfToken]);
  const visitId = query.get('visit'), selectedId = query.get('complaint');
  return <ComplaintWorkspace key={bookingId} bookingId={bookingId} visitId={visitId} selectedId={selectedId} api={api} imageApi={imageApi} />;
}

export const CustomerComplaintSubmitPage = ComplaintSubmitPage;
