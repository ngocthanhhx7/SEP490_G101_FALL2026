import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Dialog, Notice, Toast } from '../../components/ui/index.js';
import { VisitEvidencePreview } from '../../components/common/VisitEvidencePreview.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { incidentApi } from '../../services/incident-api.js';
import { createPrivateImageApi, PRIVATE_IMAGE_MAX_BYTES } from '../../services/private-image-api.js';
import { bookingMoney } from '../../utils/booking-presentation.js';
import './incidents.css';

const LABELS = {
  OPEN: 'Đang mở',
  UNDER_REVIEW: 'Đang xử lý',
  RESOLVED: 'Đã xử lý',
  CLOSED: 'Đã đóng',
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng',
  ROUTINE: 'Thông thường',
  URGENT: 'Khẩn',
  EMERGENCY: 'Khẩn cấp',
  SAFETY: 'An toàn',
  HEALTH_OBSERVATION: 'Quan sát sức khỏe',
  MISSING_PET: 'Thất lạc thú cưng',
  ACCESS: 'Không vào được nhà',
  PROPERTY: 'Hư hại tài sản',
  BEHAVIOUR: 'Hành vi thú cưng',
  OTHER: 'Khác'
};
const TIMELINE_LABELS = {
  INCIDENT_REPORTED: 'Báo cáo sự cố',
  STAFF_ACTION: 'Bước xử lý',
  SUSPENSION_PROPOSED: 'Đề xuất tạm ngưng người chăm sóc',
  INCIDENT_REFUND_PROPOSED: 'Gửi đề xuất hoàn tiền',
  INCIDENT_REFUND_DECIDED: 'Quyết định hoàn tiền của Admin',
  INCIDENT_RESOLVED: 'Giải quyết sự cố'
};
const REQUIRED_MSG = 'Trường này là bắt buộc.';
const IMAGE_TYPES = ['image/png', 'image/jpeg'];
const label = value => LABELS[value] || value || 'Chưa xác định';
const msg44 = remainingVnd => Number.isSafeInteger(remainingVnd)
  ? `Số tiền không được vượt quá ${bookingMoney(remainingVnd)}, phần còn lại sau các khoản hoàn đã ghi nhận của lịch đặt.`
  : 'Số tiền vượt quá phần còn lại sau các khoản hoàn đã ghi nhận của lịch đặt.';

function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
    : 'Chưa có thời điểm';
}

function errorText(error) {
  if (error?.code === 'VERSION_CONFLICT') return 'Sự cố đã được cập nhật bởi người khác. Tải lại trước khi gửi.';
  if (error?.code === 'FORBIDDEN') return 'Phiên hiện tại không có quyền xử lý.';
  if (error?.code === 'SUSPENSION_ALREADY_PROPOSED') return 'Sự cố này đã gửi đề xuất tạm ngưng người chăm sóc trước đó.';
  if (error?.code === 'VISIT_ALREADY_WAIVED') return 'Buổi này đã được đề xuất không tính tiền hoặc hoàn tiền trước đó.';
  if (error?.code === 'BILLING_SOURCE_UNAVAILABLE') return 'Lịch đặt chưa có thanh toán được xác nhận nên chưa thể đề xuất hoàn tiền.';
  return 'Không thể hoàn tất thao tác. Kiểm tra mạng và thử lại.';
}

export function IncidentDetailsPage({ api = incidentApi, imageApi, caseId: suppliedCaseId }) {
  const params = useParams();
  const resolveOp = useRef(null);
  const actionOp = useRef(null);
  const suspendOp = useRef(null);
  const caseId = suppliedCaseId || params.caseId || params.incidentId;
  const session = useSession();
  const effectiveImageApi = useMemo(
    () => imageApi ?? (session.getCsrfToken ? createPrivateImageApi({ getCsrfToken: session.getCsrfToken }) : null),
    [imageApi, session.getCsrfToken]
  );

  const [actionNote, setActionNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [suspendError, setSuspendError] = useState('');

  const [resultText, setResultText] = useState('');
  const [chargeVisit, setChargeVisit] = useState('yes');
  const [amountText, setAmountText] = useState('');
  const [proposalReason, setProposalReason] = useState('');
  const [files, setFiles] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [command, setCommand] = useState({ state: 'idle' });
  const [toastMessage, setToastMessage] = useState('');

  const dismissToast = useCallback(() => setToastMessage(''), []);
  const load = useCallback(({ signal }) => api.get({ caseId, signal }), [api, caseId]);
  const readEvidence = useCallback((mediaId, { signal }) => api.readEvidence({ caseId, mediaId, signal }), [api, caseId]);
  const resource = useApiResource(load);
  const item = resource.data;

  const roles = useMemo(
    () => (session.user?.roles || session.user?.role ? (session.user.roles || [session.user.role]) : []),
    [session.user]
  );
  const canResolve = roles.includes('STAFF') || roles.includes('ADMIN');
  const isResolved = item ? ['RESOLVED', 'CLOSED'].includes(item.state) : false;
  const pendingProposal = item?.proposal?.status === 'PENDING';
  const billingAvailable = item?.billing?.status === 'AVAILABLE';
  const remainingVnd = billingAvailable ? item.billing.remainingVnd : null;
  const visitPriceVnd = item?.visitBilling?.paidPriceVnd ?? 0;
  const visitAlreadyWaived = item?.visitBilling?.alreadyWaived === true;

  const trimmedAmount = amountText.trim();
  const extraAmountVnd = /^\d+$/.test(trimmedAmount) ? Number(trimmedAmount) : 0;
  const waivedVisitVnd = chargeVisit === 'no' && !visitAlreadyWaived ? visitPriceVnd : 0;
  const hasMoneyInput = chargeVisit === 'no' || Boolean(trimmedAmount);
  const totalProposedVnd = waivedVisitVnd + extraAmountVnd;
  const reasonRequired = hasMoneyInput && (chargeVisit === 'no' || extraAmountVnd > 0);

  function chooseFiles(event) {
    const selected = [...event.target.files];
    event.target.value = '';
    if (files.length + selected.length > 20) {
      setFormErrors(prev => ({ ...prev, evidenceRefs: 'Bạn có thể thêm tối đa 20 ảnh.' }));
      return;
    }
    if (selected.some(file => !IMAGE_TYPES.includes(file.type) || file.size < 1 || file.size > PRIVATE_IMAGE_MAX_BYTES)) {
      setFormErrors(prev => ({ ...prev, evidenceRefs: 'Chọn ảnh PNG hoặc JPEG không quá 5 MB.' }));
      return;
    }
    setFormErrors(prev => ({ ...prev, evidenceRefs: null }));
    setFiles(prev => [...prev, ...selected.map(file => ({ file, key: globalThis.crypto.randomUUID() }))]);
  }

  async function submitAction(event) {
    event.preventDefault();
    if (!item || actionBusy) return;
    if (!actionNote.trim()) {
      setActionError(REQUIRED_MSG);
      return;
    }
    setActionError('');
    setActionBusy(true);
    try {
      actionOp.current ??= {
        key: globalThis.crypto.randomUUID(),
        body: { caseId, expectedVersion: item.version, note: actionNote.trim() }
      };
      const response = await api.addAction({ ...actionOp.current.body, idempotencyKey: actionOp.current.key });
      if (response?.pending) {
        setActionError('Yêu cầu đang chờ máy chủ xác nhận. Hãy thử lại.');
        return;
      }
      actionOp.current = null;
      setActionNote('');
      setToastMessage('Thay đổi của bạn đã được lưu.');
      resource.retry();
    } catch (error) {
      const uncertain = !error?.status || error.status >= 500;
      if (!uncertain) actionOp.current = null;
      setActionError(errorText(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function submitSuspend() {
    if (!item || suspendBusy) return;
    setSuspendBusy(true);
    setSuspendError('');
    try {
      suspendOp.current ??= {
        key: globalThis.crypto.randomUUID(),
        body: { caseId, expectedVersion: item.version, ...(suspendReason.trim() ? { reason: suspendReason.trim() } : {}) }
      };
      const response = await api.proposeSuspension({ ...suspendOp.current.body, idempotencyKey: suspendOp.current.key });
      if (response?.pending) {
        setSuspendError('Yêu cầu đang chờ máy chủ xác nhận. Hãy thử lại.');
        return;
      }
      suspendOp.current = null;
      setSuspendOpen(false);
      setSuspendReason('');
      setToastMessage('Đã gửi đề xuất tạm ngưng người chăm sóc tới Admin.');
      resource.retry();
    } catch (error) {
      const uncertain = !error?.status || error.status >= 500;
      if (!uncertain) suspendOp.current = null;
      setSuspendError(errorText(error));
    } finally {
      setSuspendBusy(false);
    }
  }

  async function submitResolve(event) {
    event.preventDefault();
    if (!item || ['saving', 'pending'].includes(command.state)) return;

    const nextErrors = {};
    if (!resultText.trim()) nextErrors.customerResult = REQUIRED_MSG;

    if (chargeVisit === 'no' && visitAlreadyWaived) {
      nextErrors.chargeVisit = 'Buổi này đã được đề xuất không tính tiền hoặc hoàn tiền trước đó.';
    }

    let parsedExtra = 0;
    if (trimmedAmount) {
      const num = Number(trimmedAmount);
      if (!/^\d+$/.test(trimmedAmount) || !Number.isSafeInteger(num) || (chargeVisit !== 'no' && num < 1)) {
        nextErrors.amountVnd = chargeVisit === 'no' ? 'Nhập số nguyên đồng từ 0 trở lên.' : 'Nhập số nguyên đồng lớn hơn 0.';
      } else {
        parsedExtra = num;
      }
    }

    const total = (chargeVisit === 'no' ? visitPriceVnd : 0) + parsedExtra;
    const sendingProposal = chargeVisit === 'no' || Boolean(trimmedAmount);
    if (sendingProposal && !nextErrors.amountVnd && !nextErrors.chargeVisit) {
      if (total < 1) {
        nextErrors.amountVnd = 'Nhập số nguyên đồng lớn hơn 0.';
      } else if (Number.isSafeInteger(remainingVnd) && total > remainingVnd) {
        nextErrors.amountVnd = msg44(remainingVnd);
      }
      if (!proposalReason.trim()) {
        nextErrors.reason = REQUIRED_MSG;
      }
    }

    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length && !resolveOp.current) return;

    setCommand({ state: 'saving' });
    try {
      if (!resolveOp.current) {
        const body = {
          caseId,
          expectedVersion: item.version,
          targetState: 'RESOLVED',
          customerResult: resultText.trim(),
          summary: resultText.trim(),
          chargeVisit: chargeVisit === 'yes'
        };
        if (sendingProposal) {
          const evidenceRefs = [];
          if (files.length && effectiveImageApi?.upload) {
            for (const { file, key } of files) {
              const uploaded = await effectiveImageApi.upload(file, { idempotencyKey: key });
              evidenceRefs.push(uploaded.id);
            }
          }
          body.proposal = {
            ...(trimmedAmount ? { amountVnd: parsedExtra } : {}),
            reason: proposalReason.trim(),
            evidenceRefs
          };
        }
        resolveOp.current = { key: globalThis.crypto.randomUUID(), body };
      }

      const response = await api.resolve({ ...resolveOp.current.body, idempotencyKey: resolveOp.current.key });
      if (response?.pending) {
        setCommand({ state: 'pending', message: 'Yêu cầu đang chờ máy chủ. Chưa coi sự cố đã thay đổi.' });
        return;
      }
      const messageCode = response?.data?.messageCode;
      resolveOp.current = null;
      setCommand({ state: 'idle' });
      setResultText('');
      setChargeVisit('yes');
      setAmountText('');
      setProposalReason('');
      setFiles([]);
      setFormErrors({});
      setToastMessage(
        messageCode === 'MSG95'
          ? 'Số tiền đề xuất đã được gửi cho Admin. Sự cố sẽ được giải quyết khi Admin quyết định.'
          : 'Sự cố đã được giải quyết. Khách hàng và người chăm sóc đã được thông báo.'
      );
      resource.retry();
    } catch (error) {
      if (error?.code === 'REFUND_CAP_EXCEEDED') {
        resolveOp.current = null;
        setCommand({ state: 'idle' });
        setFormErrors(prev => ({ ...prev, amountVnd: msg44(error.remainingVnd ?? remainingVnd) }));
        return;
      }
      if (error?.code === 'VALIDATION_FAILED' && error?.fieldErrors) {
        resolveOp.current = null;
        setCommand({ state: 'idle' });
        const mapped = {};
        if (error.fieldErrors.reason) mapped.reason = REQUIRED_MSG;
        if (error.fieldErrors.summary) mapped.customerResult = REQUIRED_MSG;
        if (error.fieldErrors.amountVnd) mapped.amountVnd = 'Nhập số nguyên đồng lớn hơn 0.';
        setFormErrors(mapped);
        return;
      }
      const uncertain = !error?.status || error.status >= 500;
      if (!uncertain) resolveOp.current = null;
      setCommand({
        state: uncertain ? 'pending' : error.status === 403 ? 'forbidden' : 'error',
        message: errorText(error)
      });
    }
  }

  if (resource.status === 'loading') return <section className="incident-page"><Notice state="loading" title="Đang tải sự cố">Đang kiểm tra quyền truy cập.</Notice></section>;
  if (resource.status === 'pending') return <section className="incident-page"><Notice state="pending" title="Đang chờ máy chủ">Chi tiết chờ chưa được coi là đã xác nhận.</Notice></section>;
  if (resource.status === 'forbidden') return <section className="incident-page"><Notice state="forbidden" title="Không có quyền xem sự cố">Sự cố không thuộc phạm vi phiên.</Notice></section>;
  if (resource.status === 'error' || !item) return <section className="incident-page"><Notice state="error" title="Không tải được sự cố" action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Sự cố có thể đã bị ẩn hoặc mã không hợp lệ.</Notice></section>;

  const formFrozen = ['saving', 'pending'].includes(command.state);

  return <section className="incident-page incident-details" aria-labelledby="incident-details-title">
    <Toast message={toastMessage} onClose={dismissToast} />
    <header className="incident-page__header">
      <p className="incident-page__eyebrow">{item.code || item.id} · VISIT {item.visitId}</p>
      <h1 id="incident-details-title">Chi tiết và xử lý sự cố</h1>
      <p>Trạng thái: <strong>{label(item.state)}</strong> · Mức khẩn cấp: <strong>{label(item.urgency || item.severity)}</strong></p>
    </header>

    {command.state !== 'idle' && command.message && (
      <Notice state={command.state} title="Trạng thái yêu cầu">{command.message}</Notice>
    )}

    <section className="incident-card">
      <h2>Báo cáo sự cố</h2>
      <dl className="incident-facts">
        <div><dt>Loại</dt><dd>{label(item.category)}</dd></div>
        <div><dt>Thời điểm</dt><dd>{formatDate(item.createdAt)}</dd></div>
        <div><dt>Mô tả</dt><dd>{item.description}</dd></div>
        <div><dt>Việc đã làm ngay</dt><dd>{item.immediateAction || 'Chưa có'}</dd></div>
      </dl>
    </section>

    {item.evidenceRefs?.length > 0 && <section className="incident-card">
      <h2>Bằng chứng riêng tư</h2>
      <ul>{item.evidenceRefs.map((ref, index) => <li key={ref.mediaId}>
        <VisitEvidencePreview mediaId={ref.mediaId} read={readEvidence} label={ref.caption || `Ảnh sự cố ${index + 1}`} />
        {ref.caption && <p>{ref.caption}</p>}
      </li>)}</ul>
    </section>}

    {canResolve && billingAvailable && <section className="incident-card" aria-labelledby="incident-bill-title">
      <h2 id="incident-bill-title">Hoá đơn</h2>
      <dl className="incident-facts">
        <div><dt>Mã lịch đặt</dt><dd>{item.booking?.code || item.booking?.id || '—'}</dd></div>
        <div><dt>Khách đã trả</dt><dd>{bookingMoney(item.billing.basisAmountVnd)}</dd></div>
        <div><dt>Đã hoàn</dt><dd>{bookingMoney(item.billing.approvedTotalVnd ?? 0)}</dd></div>
        <div><dt>Còn lại</dt><dd><strong>{bookingMoney(item.billing.remainingVnd)}</strong></dd></div>
      </dl>
    </section>}

    <section className="incident-card" aria-labelledby="incident-actions-title">
      <h2 id="incident-actions-title">Các bước xử lý</h2>
      {item.timeline?.length
        ? <ol className="incident-timeline">{item.timeline.map((event, index) => (
          <li key={`${event.type}-${index}`}>
            <strong>{TIMELINE_LABELS[event.type] || event.type}</strong>
            <p>{event.note}</p>
            <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
          </li>
        ))}</ol>
        : <Notice state="empty" title="Chưa có bước xử lý">Các bước xử lý sẽ xuất hiện khi Staff ghi nhận.</Notice>}

      {canResolve && !isResolved && <form className="incident-action-form" onSubmit={submitAction} noValidate>
        <label className="incident-field" htmlFor="incident-action-note">
          <span>Thêm bước xử lý</span>
          <textarea id="incident-action-note" rows={2} maxLength={4000} value={actionNote}
            disabled={actionBusy} aria-invalid={Boolean(actionError)}
            onChange={event => { setActionNote(event.target.value); setActionError(''); }} />
        </label>
        {actionError && <p className="incident-field__error" role="alert">{actionError}</p>}
        <div>
          <Button type="submit" variant="secondary" loading={actionBusy}>Lưu bước</Button>
        </div>
      </form>}
    </section>

    {pendingProposal && <section className="incident-card" aria-labelledby="incident-pending-proposal-title">
      <h2 id="incident-pending-proposal-title">Đề xuất hoàn tiền đang chờ Admin duyệt</h2>
      <dl className="incident-facts">
        <div><dt>Số tiền đề xuất</dt><dd><strong>{bookingMoney(item.proposal.amountVnd)}</strong></dd></div>
        <div><dt>Lý do</dt><dd>{item.proposal.reason}</dd></div>
        {item.proposal.customerResult && <div><dt>Kết quả dự kiến</dt><dd>{item.proposal.customerResult}</dd></div>}
      </dl>
    </section>}

    {!pendingProposal && item.moneyDecision && <section className="incident-card" aria-labelledby="incident-money-decision-title">
      <h2 id="incident-money-decision-title">Quyết định hoàn tiền</h2>
      {item.moneyDecision.outcome === 'REJECT'
        ? <p>Quản trị viên đã từ chối đề xuất hoàn tiền.{item.moneyDecision.reason ? ` Lý do: ${item.moneyDecision.reason}` : ''}</p>
        : item.moneyDecision.outcome === 'REDUCE'
          ? <p>Quản trị viên đã hạ số tiền hoàn xuống <strong>{bookingMoney(item.moneyDecision.amountVnd)}</strong> (đề xuất ban đầu {bookingMoney(item.proposal?.amountVnd)}).</p>
          : <p>Quản trị viên đã duyệt khoản hoàn <strong>{bookingMoney(item.moneyDecision.amountVnd)}</strong>.</p>}
    </section>}

    {isResolved && item.customerResult && <section className="incident-card" aria-labelledby="incident-result-summary-title">
      <h2 id="incident-result-summary-title">Kết quả xử lý</h2>
      <p>{item.customerResult}</p>
      {Number.isSafeInteger(item.approvedAmountVnd) && <p>Số tiền hoàn được duyệt: <strong>{bookingMoney(item.approvedAmountVnd)}</strong></p>}
    </section>}

    {canResolve && !isResolved && (item.suspensionProposal || item.sitter?.id) && <section className="incident-card incident-suspension">
      {item.suspensionProposal
        ? <p className="incident-suspension__done">Đã đề xuất tạm ngưng{item.suspensionProposal.sitterName ? ` (${item.suspensionProposal.sitterName})` : ''}</p>
        : <button type="button" className="incident-link-button" onClick={() => { setSuspendError(''); setSuspendOpen(true); }}>
          Đề xuất Admin tạm ngưng người chăm sóc
        </button>}
    </section>}

    {canResolve && !isResolved && !pendingProposal && <form className="incident-card incident-form" onSubmit={submitResolve} noValidate>
      <h2>Xử lý sự cố</h2>
      <label className="incident-field" htmlFor="incident-result">
        <span>Kết quả <span aria-hidden="true">*</span></span>
        <textarea id="incident-result" rows={3} maxLength={4000} value={resultText} disabled={formFrozen}
          aria-invalid={Boolean(formErrors.customerResult)}
          onChange={event => { setResultText(event.target.value); setFormErrors(prev => ({ ...prev, customerResult: null })); }} />
      </label>
      {formErrors.customerResult && <p className="incident-field__error" role="alert">{formErrors.customerResult}</p>}

      <fieldset className="incident-charge-group" disabled={formFrozen}>
        <legend>Tính tiền buổi này <span aria-hidden="true">*</span></legend>
        <label className="incident-radio">
          <input type="radio" name="chargeVisit" value="yes" checked={chargeVisit === 'yes'}
            onChange={() => { setChargeVisit('yes'); setFormErrors(prev => ({ ...prev, chargeVisit: null, amountVnd: null })); }} />
          <span>Có, tính tiền buổi như bình thường</span>
        </label>
        <label className="incident-radio">
          <input type="radio" name="chargeVisit" value="no" checked={chargeVisit === 'no'} disabled={visitAlreadyWaived}
            onChange={() => { setChargeVisit('no'); setFormErrors(prev => ({ ...prev, chargeVisit: null, amountVnd: null })); }} />
          <span>
            Không, đề xuất không tính tiền buổi này
            {visitPriceVnd > 0 && !visitAlreadyWaived ? ` (+ ${bookingMoney(visitPriceVnd)})` : ''}
          </span>
        </label>
        {visitAlreadyWaived && <p className="incident-form__hint">Buổi này đã được đề xuất không tính tiền hoặc đã hoàn tiền trước đó.</p>}
        {formErrors.chargeVisit && <p className="incident-field__error" role="alert">{formErrors.chargeVisit}</p>}
      </fieldset>

      <label className="incident-field" htmlFor="incident-amount">
        <span>Số tiền đề xuất trả lại (đ)</span>
        <input id="incident-amount" inputMode="numeric" maxLength={16} value={amountText} disabled={formFrozen}
          placeholder="Ví dụ chi phí thú y (không bắt buộc)"
          aria-invalid={Boolean(formErrors.amountVnd)}
          onChange={event => { setAmountText(event.target.value); setFormErrors(prev => ({ ...prev, amountVnd: null })); }} />
      </label>
      {chargeVisit === 'no' && totalProposedVnd > 0 && (
        <p className="incident-form__hint">Tổng đề xuất gửi Admin: <strong>{bookingMoney(totalProposedVnd)}</strong>.</p>
      )}
      {Number.isSafeInteger(remainingVnd) && (
        <p className="incident-form__hint">Giới hạn tối đa còn lại của lịch đặt: {bookingMoney(remainingVnd)}.</p>
      )}
      {formErrors.amountVnd && <p className="incident-field__error" role="alert">{formErrors.amountVnd}</p>}

      <label className="incident-field" htmlFor="incident-proposal-reason">
        <span>Lý do và bằng chứng {reasonRequired && <span aria-hidden="true">*</span>}</span>
        <textarea id="incident-proposal-reason" rows={3} maxLength={4000} value={proposalReason}
          disabled={!reasonRequired || formFrozen}
          aria-invalid={Boolean(formErrors.reason)}
          onChange={event => { setProposalReason(event.target.value); setFormErrors(prev => ({ ...prev, reason: null })); }} />
      </label>
      <p className="incident-form__hint">Bắt buộc nhập lý do khi có số tiền đề xuất; tệp bằng chứng không bắt buộc.</p>
      {formErrors.reason && <p className="incident-field__error" role="alert">{formErrors.reason}</p>}

      {effectiveImageApi?.upload && <div className="incident-photos__controls">
        <label className="incident-add-file">
          <span>+ Thêm tệp</span>
          <input type="file" className="incident-photos__input" accept="image/png,image/jpeg" multiple
            disabled={!reasonRequired || formFrozen} onChange={chooseFiles} />
        </label>
      </div>}
      {formErrors.evidenceRefs && <p className="incident-field__error" role="alert">{formErrors.evidenceRefs}</p>}
      {files.length > 0 && <ul className="incident-photos__list">{files.map(({ file, key }) => (
        <li key={key} className="incident-photos__item">
          <span>{file.name}</span>
          <button type="button" className="incident-photos__remove" disabled={formFrozen}
            onClick={() => setFiles(prev => prev.filter(row => row.key !== key))}>Bỏ</button>
        </li>
      ))}</ul>}

      <div>
        <Button type="submit" loading={command.state === 'saving'}>
          {command.state === 'pending' ? 'Kiểm tra lại yêu cầu' : 'Xử lý xong'}
        </Button>
      </div>
    </form>}

    <Dialog open={suspendOpen} title="Đề xuất Admin tạm ngưng người chăm sóc" onClose={() => !suspendBusy && setSuspendOpen(false)} dismissible={!suspendBusy}
      footer={<>
        <Button variant="secondary" disabled={suspendBusy} onClick={() => setSuspendOpen(false)}>Quay lại</Button>
        <Button variant="danger" loading={suspendBusy} onClick={submitSuspend}>Xác nhận gửi đề xuất</Button>
      </>}>
      <p>Gửi đề xuất tạm ngưng người chăm sóc <strong>{item.sitter?.displayName || item.sitter?.id}</strong> từ sự cố <strong>{item.code || item.id}</strong> tới Admin?</p>
      <label className="incident-field" htmlFor="incident-suspend-reason">
        <span>Ghi chú thêm (không bắt buộc)</span>
        <textarea id="incident-suspend-reason" rows={2} maxLength={1000} value={suspendReason} disabled={suspendBusy}
          onChange={event => setSuspendReason(event.target.value)} />
      </label>
      {suspendError && <p className="incident-field__error" role="alert">{suspendError}</p>}
    </Dialog>
  </section>;
}

export const IncidentResolutionPage = IncidentDetailsPage;
