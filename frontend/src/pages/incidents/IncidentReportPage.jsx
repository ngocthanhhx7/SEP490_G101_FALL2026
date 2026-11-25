import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Dialog, Notice, Select } from '../../components/ui/index.js';
import { incidentApi } from '../../services/incident-api.js';
import { PRIVATE_IMAGE_MAX_BYTES, privateImageApi } from '../../services/private-image-api.js';
import './incidents.css';

const SEVERITIES = [['LOW', 'Thấp'], ['MEDIUM', 'Trung bình'], ['HIGH', 'Cao'], ['CRITICAL', 'Nghiêm trọng']];
const URGENCIES = [['ROUTINE', 'Thông thường'], ['URGENT', 'Khẩn'], ['EMERGENCY', 'Khẩn cấp']];
const CATEGORIES = [
  ['HEALTH_OBSERVATION', 'Thú cưng ốm hoặc bị thương'],
  ['ACCESS', 'Không vào được nhà'],
  ['PROPERTY', 'Hư hỏng đồ đạc'],
  ['MISSING_PET', 'Thú cưng bị lạc'],
  ['OTHER', 'Khác']
];
const MAX_PHOTOS = 5;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png']);
const MSG01 = 'Trường này là bắt buộc.';
const MSG93 = 'Đã gửi báo cáo. Nhân viên đã được thông báo.';

function msg43Text(hotline) {
  return hotline
    ? `Nếu thú cưng cần chăm sóc khẩn cấp, hãy gọi ngay cho Paw World theo số ${hotline}.`
    : 'Nếu thú cưng cần chăm sóc khẩn cấp, hãy liên hệ ngay với Paw World để được hỗ trợ.';
}

export function IncidentReportPage({
  api = incidentApi,
  imageApi = privateImageApi,
  visitId: suppliedVisitId,
  hotline: suppliedHotline,
  onComplete
}) {
  const params = useParams();
  const operation = useRef(null);
  const fileInput = useRef(null);
  const visitId = suppliedVisitId || params.visitId;
  const [form, setForm] = useState({
    severity: 'MEDIUM',
    urgency: 'ROUTINE',
    category: '',
    description: '',
    immediateAction: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState('');
  const [hotline, setHotline] = useState(() => (suppliedHotline?.trim() ? suppliedHotline.trim() : null));
  const [showUrgentPopup, setShowUrgentPopup] = useState(false);
  const [status, setStatus] = useState({ state: 'idle' });

  useEffect(() => {
    if (suppliedHotline !== undefined) {
      setHotline(suppliedHotline?.trim() ? suppliedHotline.trim() : null);
      return;
    }
    if (typeof api?.config !== 'function') return;
    const controller = new window.AbortController();
    api
      .config({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          const value = typeof data?.hotline === 'string' && data.hotline.trim() ? data.hotline.trim() : null;
          setHotline(value);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [api, suppliedHotline]);

  const disabled = ['saving', 'pending'].includes(status.state);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => (current[name] ? { ...current, [name]: '' } : current));
    if (name === 'category' && value === 'HEALTH_OBSERVATION') {
      setShowUrgentPopup(true);
    }
  };

  const handleFileChange = (event) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selected.length) return;
    setPhotoError('');
    const next = [];
    for (const file of selected) {
      if (photos.length + next.length >= MAX_PHOTOS) {
        setPhotoError(`Chỉ đính kèm tối đa ${MAX_PHOTOS} ảnh.`);
        break;
      }
      if (!PHOTO_TYPES.has(file.type)) {
        setPhotoError('Chỉ hỗ trợ ảnh định dạng JPG hoặc PNG.');
        continue;
      }
      if (file.size > PRIVATE_IMAGE_MAX_BYTES) {
        setPhotoError('Mỗi ảnh không vượt quá 5 MB.');
        continue;
      }
      next.push({
        localId: globalThis.crypto.randomUUID(),
        key: globalThis.crypto.randomUUID().replace(/-/g, ''),
        file,
        name: file.name || 'anh-su-co.jpg',
        mediaId: null
      });
    }
    if (next.length) {
      operation.current = null;
      setPhotos((current) => [...current, ...next]);
    }
  };

  const removePhoto = (localId) => {
    operation.current = null;
    setPhotoError('');
    setPhotos((current) => current.filter((item) => item.localId !== localId));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (status.state === 'saving') return;
    const errors = {};
    if (!form.category) errors.category = MSG01;
    if (!form.description.trim()) errors.description = MSG01;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setStatus({ state: 'saving' });
    setPhotoError('');
    try {
      const evidenceRefs = [];
      const updatedPhotos = [...photos];
      for (let index = 0; index < updatedPhotos.length; index += 1) {
        const item = updatedPhotos[index];
        if (item.mediaId) {
          evidenceRefs.push(item.mediaId);
          continue;
        }
        const uploaded = await imageApi.upload(item.file, { idempotencyKey: item.key });
        const mediaId = uploaded?.id ?? uploaded?.data?.id;
        if (!mediaId) throw new Error('UPLOAD_FAILED');
        updatedPhotos[index] = { ...item, mediaId };
        evidenceRefs.push(mediaId);
      }
      if (updatedPhotos.length) setPhotos(updatedPhotos);

      operation.current ??= {
        key: globalThis.crypto.randomUUID(),
        body: {
          visitId,
          severity: form.severity,
          urgency: form.urgency,
          category: form.category,
          description: form.description,
          immediateAction: form.immediateAction || undefined,
          evidenceRefs
        }
      };
      const result = await api.report({ ...operation.current.body, idempotencyKey: operation.current.key });
      if (result?.pending) {
        setStatus({ state: 'pending', message: 'Yêu cầu đang chờ máy chủ xác nhận. Chưa coi sự cố là đã gửi.' });
        return;
      }
      operation.current = null;
      setStatus({ state: 'success', message: MSG93 });
      onComplete?.(result);
    } catch (error) {
      const uncertain = !error.status || error.status >= 500;
      if (!uncertain) operation.current = null;
      const uploadFailed = error.code === 'PROVIDER_UNAVAILABLE' || error.message === 'UPLOAD_FAILED';
      setStatus({
        state: uploadFailed ? 'error' : uncertain ? 'pending' : error.status === 403 ? 'forbidden' : 'error',
        message: uploadFailed
          ? 'Chưa thể tải ảnh lên kho riêng tư. Bạn có thể bỏ ảnh để gửi báo cáo hoặc thử lại sau.'
          : error.code === 'VERSION_CONFLICT'
            ? 'Visit đã thay đổi. Tải lại trước khi gửi.'
            : 'Không thể gửi sự cố. Kiểm tra dữ liệu và thử lại.'
      });
    }
  };

  return (
    <section className="incident-page incident-report" aria-labelledby="incident-report-title">
      <header className="incident-page__header">
        <p className="incident-page__eyebrow">VISIT {visitId || '—'}</p>
        <h1 id="incident-report-title">Báo cáo sự cố</h1>
        <p>Ghi nhận điều đã quan sát, ảnh đính kèm (nếu có) và mức khẩn cấp. Paw World Care không chẩn đoán hoặc kê đơn tự động.</p>
      </header>
      {status.state === 'success' && <Notice state="success" title="Đã gửi báo cáo">{status.message}</Notice>}
      {status.state === 'pending' && <Notice state="pending" title="Đang chờ máy chủ">{status.message}</Notice>}
      {status.state === 'forbidden' && <Notice state="forbidden" title="Không có quyền báo cáo">Visit không thuộc Customer hoặc Sitter được giao.</Notice>}
      {status.state === 'error' && <Notice state="error" title="Không thể gửi sự cố">{status.message}</Notice>}
      {form.category === 'HEALTH_OBSERVATION' && (
        <Notice state="error" title="Cảnh báo khẩn cấp">{msg43Text(hotline)}</Notice>
      )}
      <form className="incident-card incident-form" onSubmit={submit} noValidate aria-busy={status.state === 'saving'}>
        <Select label="Mức khẩn cấp" name="urgency" value={form.urgency} onChange={update} disabled={disabled}>
          {URGENCIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select label="Mức độ" name="severity" value={form.severity} onChange={update} disabled={disabled}>
          {SEVERITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <div className="incident-field-group">
          <Select
            label="Loại sự cố"
            name="category"
            value={form.category}
            onChange={update}
            disabled={disabled}
            error={fieldErrors.category || undefined}
          >
            <option value="">Chọn loại sự cố</option>
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
        <label className="incident-field">
          <span>Mô tả quan sát <b aria-hidden="true">*</b></span>
          <textarea
            name="description"
            value={form.description}
            onChange={update}
            rows={6}
            maxLength={4000}
            required
            aria-invalid={Boolean(fieldErrors.description) || undefined}
            aria-describedby={fieldErrors.description ? 'incident-description-error' : undefined}
            disabled={disabled}
            placeholder="Điều gì đã xảy ra? Ghi thời điểm, vị trí và biểu hiện quan sát được."
          />
          {fieldErrors.description && (
            <span id="incident-description-error" className="incident-field__error" role="alert">
              {fieldErrors.description}
            </span>
          )}
        </label>
        <label className="incident-field">
          <span>Việc đã làm ngay</span>
          <textarea
            name="immediateAction"
            value={form.immediateAction}
            onChange={update}
            rows={3}
            maxLength={2000}
            disabled={disabled}
            placeholder="Ví dụ: đưa thú cưng ra khu vực an toàn; không ghi chẩn đoán."
          />
        </label>
        <div className="incident-field">
          <span>Ảnh (không bắt buộc)</span>
          <div className="incident-photos__controls">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png"
              className="incident-photos__input"
              aria-label="Chọn ảnh sự cố"
              disabled={disabled || photos.length >= MAX_PHOTOS}
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || photos.length >= MAX_PHOTOS}
              onClick={() => fileInput.current?.click()}
            >
              Thêm ảnh
            </Button>
            <span className="incident-form__hint">JPG hoặc PNG, tối đa 5 MB mỗi ảnh (tối đa {MAX_PHOTOS} ảnh).</span>
          </div>
          {photoError && <span className="incident-field__error" role="alert">{photoError}</span>}
          {photos.length > 0 && (
            <ul className="incident-photos__list" aria-label="Ảnh đã chọn">
              {photos.map((photo) => (
                <li key={photo.localId} className="incident-photos__item">
                  <span>{photo.name}</span>
                  <button
                    type="button"
                    className="incident-photos__remove"
                    disabled={disabled}
                    onClick={() => removePhoto(photo.localId)}
                  >
                    Bỏ ảnh
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="incident-form__hint">
          Staff sẽ tiếp nhận theo giờ vận hành đã được xác nhận và thông báo cho bên liên quan của buổi chăm sóc.
        </p>
        <Button
          type="submit"
          loading={status.state === 'saving'}
          loadingLabel="Đang gửi…"
          disabled={!visitId || status.state === 'success'}
        >
          {status.state === 'pending' ? 'Kiểm tra lại báo cáo' : 'Gửi báo cáo sự cố'}
        </Button>
      </form>
      <Dialog
        open={showUrgentPopup}
        onClose={() => setShowUrgentPopup(false)}
        title="Cảnh báo khẩn cấp"
        intent="destructive"
        description={msg43Text(hotline)}
        footer={
          <Button variant="primary" onClick={() => setShowUrgentPopup(false)}>
            Đã hiểu
          </Button>
        }
      />
    </section>
  );
}

export const ReportIncidentPage = IncidentReportPage;
