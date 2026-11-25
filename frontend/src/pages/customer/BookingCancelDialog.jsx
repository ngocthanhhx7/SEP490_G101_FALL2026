import { useCallback, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, Dialog } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { bookingMoney } from '../../utils/booking-presentation.js';
import './booking-change.css';

const CANCEL_REASONS = [
  'Thay đổi kế hoạch',
  'Thú cưng có vấn đề sức khỏe',
  'Đặt nhầm ngày hoặc giờ',
  'Lý do khác'
];

const unknownResult = new Set(['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'INVALID_RESPONSE']);
const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function formatVisitOption(visit) {
  const start = visit.startAt && Number.isFinite(Date.parse(visit.startAt))
    ? dateFormatter.format(new Date(visit.startAt))
    : 'Chưa rõ giờ';
  return [start, visit.sitterName].filter(Boolean).join(' · ');
}

function formatVisitStart(startAt) {
  return startAt && Number.isFinite(Date.parse(startAt))
    ? dateFormatter.format(new Date(startAt))
    : 'Chưa rõ giờ';
}

function formatTimeRemaining(startAt, serverNow) {
  const startMs = Date.parse(startAt);
  const nowMs = Number.isFinite(Date.parse(serverNow)) ? Date.parse(serverNow) : Date.now();
  if (!Number.isFinite(startMs)) return '—';
  const diffMinutes = Math.max(0, Math.floor((startMs - nowMs) / 60000));
  if (diffMinutes < 60) {
    return diffMinutes <= 1 ? 'Còn dưới 1 phút' : `Còn ${diffMinutes} phút`;
  }
  const totalHours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (totalHours < 24) {
    return minutes > 0 ? `Còn ${totalHours} giờ ${minutes} phút` : `Còn ${totalHours} giờ`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `Còn ${days} ngày ${hours} giờ` : `Còn ${days} ngày`;
}

function cancelErrorMessage(error) {
  if (error?.code === 'VISIT_ALREADY_STARTED') return 'Buổi chăm sóc đã tới giờ bắt đầu nên không thể huỷ.';
  if (error?.code === 'VISIT_NOT_CANCELLABLE' || error?.code === 'BOOKING_NOT_CANCELLABLE') {
    return 'Lịch đặt hoặc buổi chăm sóc này không còn ở trạng thái cho phép huỷ.';
  }
  if (error?.code === 'VERSION_CONFLICT') return 'Lịch đặt vừa thay đổi. Vui lòng tải lại trước khi thử lại.';
  return 'Chưa thể huỷ lúc này. Vui lòng thử lại.';
}

function formatMsg27(preview) {
  if (!preview) return '';
  if (preview.lateFeeTotalVnd > 0) {
    if (!preview.isPaid) {
      return `Huỷ bây giờ sẽ giữ ${bookingMoney(preview.lateFeeTotalVnd)} (30% giá buổi trước giảm giá).`;
    }
    return `Huỷ bây giờ sẽ giữ ${bookingMoney(preview.lateFeeTotalVnd)} (30% giá buổi trước giảm giá); ${bookingMoney(preview.refundTotalVnd)} sẽ được hoàn lại.`;
  }
  if (!preview.isPaid) {
    return 'Huỷ bây giờ được miễn phí.';
  }
  return `Huỷ bây giờ được miễn phí: ${bookingMoney(preview.refundTotalVnd)} sẽ được hoàn lại.`;
}

export function BookingCancelDialog({ booking, visits, initialVisitId, api, onClose, onCancelled }) {
  const formId = useId();
  const initialVisit = visits.find(item => item.id === initialVisitId) ?? visits[0];
  const [scope, setScope] = useState(initialVisitId ? 'VISIT' : 'BOOKING');
  const [selectedId, setSelectedId] = useState(initialVisit?.id ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const operation = useRef(null);

  const single = scope === 'VISIT';
  const activeVisitId = single ? (visits.some(item => item.id === selectedId) ? selectedId : visits[0]?.id) : null;
  const locked = busy || uncertain;

  const previewResource = useApiResource(useCallback(async ({ signal }) => {
    const payload = single ? { scope: 'VISIT', visitId: activeVisitId } : { scope: 'BOOKING' };
    return { data: await api.previewCancellation(booking.id, payload, { signal }) };
  }, [api, booking.id, single, activeVisitId]));

  const preview = previewResource.status === 'success' ? previewResource.data : null;

  async function execute() {
    if (inFlight.current || !operation.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api.cancelBooking(booking.id, operation.current.body, operation.current.key);
      operation.current = null;
      onCancelled(result);
    } catch (err) {
      const retry = unknownResult.has(err?.code) || (err?.status >= 500);
      setUncertain(retry);
      if (!retry) operation.current = null;
      setError(retry ? 'Chưa nhận được xác nhận. Hãy kiểm tra lại cùng yêu cầu huỷ.' : cancelErrorMessage(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (locked || inFlight.current || !preview) return;
    const body = {
      scope,
      ...(single ? { visitId: activeVisitId } : {}),
      ...(reason ? { reason } : {})
    };
    const key = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `cancel-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    operation.current = { body, key };
    void execute();
  }

  return <Dialog open onClose={onClose} dismissible={!locked} className="booking-change-dialog"
    title="Xác nhận huỷ lịch đặt"
    description="Kiểm tra phí huỷ và số tiền hoàn dự kiến trước khi xác nhận."
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={locked}>Quay lại</Button>
      {uncertain
        ? <Button variant="destructive" loading={busy} onClick={execute}>Kiểm tra lại yêu cầu</Button>
        : <Button type="submit" form={formId} variant="destructive" loading={busy}
          disabled={!preview || previewResource.status !== 'success'}>
          Xác nhận huỷ
        </Button>}
    </>}>
    <form id={formId} onSubmit={submit}>
      <fieldset disabled={locked} className="booking-change-form">
        {visits.length > 1 && <div className="booking-change-field">
          <span id={formId + '-scope'}>Phạm vi huỷ</span>
          <div role="group" aria-labelledby={formId + '-scope'} className="booking-change-scope">
            <button type="button" aria-pressed={!single} onClick={() => { setScope('BOOKING'); setError(''); }}>
              Cả lịch đặt ({visits.length} buổi)
            </button>
            <button type="button" aria-pressed={single} onClick={() => { setScope('VISIT'); setError(''); }}>
              Một buổi
            </button>
          </div>
        </div>}

        {single && <label className="booking-change-field">
          <span>Chọn buổi cần huỷ</span>
          <span className="booking-change-field__select">
            <select className="pwc-control" value={activeVisitId ?? ''} onChange={event => {
              setSelectedId(event.target.value);
              setError('');
            }}>
              {visits.map(visit => <option key={visit.id} value={visit.id}>{formatVisitOption(visit)}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </label>}

        <label className="booking-change-field">
          <span>Lý do huỷ (không bắt buộc)</span>
          <span className="booking-change-field__select">
            <select className="pwc-control" value={reason} onChange={event => setReason(event.target.value)}>
              <option value="">— Chọn lý do (không bắt buộc) —</option>
              {CANCEL_REASONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </label>
      </fieldset>

      <div className="booking-change-price" aria-live="polite">
        {previewResource.status === 'loading' && <p role="status">Đang tính phí huỷ và số tiền hoàn…</p>}
        {['error', 'pending', 'forbidden'].includes(previewResource.status) && <div role="alert">
          <p>{cancelErrorMessage(previewResource.error)}</p>
          <Button type="button" variant="secondary" onClick={previewResource.retry}>Thử lại</Button>
        </div>}
        {preview && <>
          {Array.isArray(preview.items) && preview.items.length > 0 && <div className="booking-cancel-visits">
            <strong>Các buổi sẽ huỷ ({preview.items.length})</strong>
            <ul>
              {preview.items.map(item => <li key={item.visitId} className="booking-cancel-visits__row">
                <span className="booking-cancel-visits__time">
                  <span>{formatVisitStart(item.startAt)}</span>
                  <span className="booking-cancel-visits__remaining">{formatTimeRemaining(item.startAt, preview.serverNow)}</span>
                </span>
                <span className={item.lateFeeVnd > 0 ? 'booking-cancel-visits__fee booking-cancel-visits__fee--late' : 'booking-cancel-visits__fee'}>
                  {item.lateFeeVnd > 0 ? `Phí huỷ muộn ${bookingMoney(item.lateFeeVnd)}` : 'Miễn phí'}
                </span>
              </li>)}
            </ul>
          </div>}
          <strong>{formatMsg27(preview)}</strong>
          {preview.comboDiscountAdjustmentVnd > 0 && <p>
            Điều chỉnh giảm giá nhiều buổi trên các buổi còn lại: − {bookingMoney(preview.comboDiscountAdjustmentVnd)}.
          </p>}
          {preview.isPaid && preview.refundTotalVnd > 0 && <p>
            Khoản hoàn tiền sẽ được ghi nhận ngay và kế toán Paw World chi trả ngoài hệ thống.
          </p>}
        </>}
      </div>

      {error && <p className="booking-change-error" role="alert">{error}</p>}
    </form>
  </Dialog>;
}
