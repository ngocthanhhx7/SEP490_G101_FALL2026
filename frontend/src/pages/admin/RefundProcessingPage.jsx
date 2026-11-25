import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createComplaintApi } from '../../services/complaint-api.js';
import { createPrivateImageApi } from '../../services/private-image-api.js';
import { bookingMoney } from '../../utils/booking-presentation.js';
import { complaintDeadline, complaintError, complaintSubject, complaintVisitTime, retryKey, uncertainComplaint } from '../../utils/complaint-presentation.js';
import './refund-processing.css';

const tabs = [
  ['PENDING', 'Chờ duyệt'],
  ['DECIDED', 'Đã quyết'],
  ['BOOKING_REFUNDS', 'Hoàn tiền lịch đặt']
];
const proposalStatusLabels = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REDUCED: 'Đã hạ số tiền',
  REJECTED: 'Đã từ chối',
  RECORDED: 'Đã ghi nhận'
};
const successMessages = {
  MSG134: 'Đã duyệt số tiền hoàn. Nhân viên và khách hàng đã được thông báo.',
  MSG135: 'Đã từ chối đề xuất hoàn tiền. Nhân viên đã được thông báo.'
};

function StatusBadge({ status }) {
  const key = String(status || 'PENDING').toLowerCase();
  return <span className={'refund-processing__status refund-processing__status--' + key}>
    {proposalStatusLabels[status] ?? 'Đang cập nhật'}
  </span>;
}

function ResourceNotice({ resource, title }) {
  if (resource.status === 'loading') return <Notice state="loading" title={title} />;
  if (resource.status === 'pending') return <Notice state="pending" title="Đang chờ máy chủ xác nhận"
    action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />;
  return <Notice state={resource.status === 'forbidden' ? 'forbidden' : 'error'} title={title}
    action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />;
}

function EvidencePhoto({ api, mediaId, label }) {
  const resource = useApiResource(useCallback(async ({ signal }) => ({ data: await api.read(mediaId, { signal }) }), [api, mediaId]));
  const blob = resource.data?.blob;
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== 'function') return;
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return <li>{resource.status === 'success' ? url && <img src={url} alt={label} />
    : <ResourceNotice resource={resource} title={resource.status === 'loading' ? 'Đang tải ảnh…' : 'Chưa tải được ảnh'} />}</li>;
}

function Evidence({ complaintId, items, label, getCsrfToken }) {
  const [visible, setVisible] = useState(false);
  const api = useMemo(() => createPrivateImageApi({ getCsrfToken, readPath: mediaId =>
    '/complaints/' + encodeURIComponent(complaintId) + '/evidence/' + mediaId + '/content' }), [getCsrfToken, complaintId]);
  if (!items?.length) return null;
  return <div className="refund-processing__evidence">
    <button type="button" className="refund-processing__text-button" aria-expanded={visible}
      onClick={() => setVisible(previous => !previous)}>{label} ({items.length})</button>
    {visible && <ul>{items.map(({ mediaId, caption }, index) =>
      <EvidencePhoto key={mediaId} api={api} mediaId={mediaId} label={caption || label + ' ' + (index + 1)} />)}</ul>}
  </div>;
}

function RefundDecisionForm({ item, api, onDecided }) {
  const proposal = item.proposal;
  const billing = item.billing;
  const remainingVnd = billing?.status === 'AVAILABLE' ? billing.remainingVnd : null;
  const [approvedText, setApprovedText] = useState(() => String(proposal?.amountVnd ?? ''));
  const [rejectReason, setRejectReason] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(null), locked = useRef(false);

  async function submitDecision(mode) {
    if (locked.current) return;
    const nextErrors = {};
    let payload = pending.current?.payload;

    if (!payload) {
      if (mode === 'REJECT') {
        if (!rejectReason.trim()) nextErrors.reason = 'Trường này là bắt buộc.';
      } else {
        const raw = approvedText.trim();
        const value = Number(raw);
        if (!raw) {
          nextErrors.amountVnd = 'Trường này là bắt buộc.';
        } else if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) {
          nextErrors.amountVnd = 'Nhập số nguyên đồng lớn hơn 0.';
        } else if (value > proposal.amountVnd) {
          nextErrors.amountVnd = 'Số tiền duyệt không được vượt quá số tiền nhân viên đề xuất (' + bookingMoney(proposal.amountVnd) + ').';
        } else if (Number.isSafeInteger(remainingVnd) && value > remainingVnd) {
          nextErrors.amountVnd = 'Số tiền không được vượt quá ' + bookingMoney(remainingVnd) + ', phần còn lại sau các khoản hoàn đã ghi nhận của lịch đặt.';
        }
      }
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length) return;

      if (mode === 'REJECT') {
        payload = {
          complaintId: item.id,
          expectedVersion: item.version,
          outcome: 'REJECT',
          reason: rejectReason.trim()
        };
      } else {
        const value = Number(approvedText.trim());
        payload = {
          complaintId: item.id,
          expectedVersion: item.version,
          outcome: value < proposal.amountVnd ? 'REDUCE' : 'APPROVE',
          ...(value < proposal.amountVnd ? { amountVnd: value } : {})
        };
      }
    }

    locked.current = true;
    setBusy(true);
    setErrors({});
    let attempted = false;
    try {
      const idempotencyKey = retryKey(pending, payload);
      pending.current.payload = payload;
      attempted = true;
      const response = await api.decideRefund({ ...payload, idempotencyKey });
      if (response.pending) {
        setUncertain(true);
        setErrors({ form: 'Đang chờ xác nhận. Hãy thử lại để kiểm tra.' });
        return;
      }
      pending.current = null;
      setUncertain(false);
      onDecided(response.data);
    } catch (error) {
      if (error.code === 'REFUND_CAP_EXCEEDED') {
        pending.current = null;
        setUncertain(false);
        const cap = Number.isSafeInteger(error.remainingVnd) ? bookingMoney(error.remainingVnd) : null;
        setErrors({ amountVnd: cap
          ? 'Số tiền không được vượt quá ' + cap + ', phần còn lại sau các khoản hoàn đã ghi nhận của lịch đặt.'
          : 'Số tiền vượt phần còn lại sau các khoản hoàn đã ghi nhận của lịch đặt.' });
      } else if (error.code === 'BILLING_SOURCE_UNAVAILABLE') {
        pending.current = null;
        setUncertain(false);
        setErrors({ form: 'Lịch đặt chưa có thanh toán được xác nhận nên chưa thể duyệt hoàn tiền.' });
      } else {
        const unknown = attempted && uncertainComplaint(error);
        setUncertain(unknown);
        if (!unknown) pending.current = null;
        setErrors({ form: complaintError(error, 'Chưa lưu được quyết định hoàn tiền. Hãy thử lại.') });
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const frozen = busy || uncertain;
  return <form className="refund-processing__form" onSubmit={event => { event.preventDefault(); submitDecision('APPROVE'); }} noValidate aria-busy={busy || undefined}>
    <div>
      <label htmlFor="refund-approved-amount">Số tiền duyệt (đ)</label>
      <input id="refund-approved-amount" inputMode="numeric" maxLength={16} value={approvedText} disabled={frozen}
        aria-invalid={Boolean(errors.amountVnd)}
        aria-describedby={errors.amountVnd ? 'refund-approved-amount-error' : 'refund-approved-amount-help'}
        onChange={event => { setApprovedText(event.target.value); setErrors(prev => ({ ...prev, amountVnd: null })); }} />
      <p id="refund-approved-amount-help" className="refund-processing__muted">
        Tối đa {bookingMoney(proposal.amountVnd)} theo đề xuất{Number.isSafeInteger(remainingVnd)
          ? ' và không vượt quá ' + bookingMoney(remainingVnd) + ' còn lại.' : '.'}
      </p>
      {errors.amountVnd && <p className="refund-processing__error" id="refund-approved-amount-error" role="alert">{errors.amountVnd}</p>}
    </div>
    <div>
      <label htmlFor="refund-reject-reason">Lý do từ chối</label>
      <textarea id="refund-reject-reason" rows={3} maxLength={4000} value={rejectReason} disabled={frozen}
        aria-invalid={Boolean(errors.reason)}
        aria-describedby={errors.reason ? 'refund-reject-reason-error' : 'refund-reject-reason-help'}
        onChange={event => { setRejectReason(event.target.value); setErrors(prev => ({ ...prev, reason: null })); }} />
      <p id="refund-reject-reason-help" className="refund-processing__muted">Bắt buộc nhập khi bấm Từ chối.</p>
      {errors.reason && <p className="refund-processing__error" id="refund-reject-reason-error" role="alert">{errors.reason}</p>}
    </div>
    <p className="refund-processing__note">
      Khoản hoàn được duyệt sẽ được ghi nhận để kế toán Paw World chi trả ngoài hệ thống.
    </p>
    {errors.form && <p className="refund-processing__error" role="alert">{errors.form}</p>}
    <div className="refund-processing__actions">
      <Button type="submit" loading={busy}>{uncertain ? 'Thử lại' : 'Duyệt'}</Button>
      <Button type="button" variant="secondary" disabled={frozen} onClick={() => submitDecision('REJECT')}>Từ chối</Button>
    </div>
  </form>;
}

function ProposalDetail({ item, api, getCsrfToken, onDecided, focus }) {
  const heading = useRef(null);
  useEffect(() => {
    if (focus) heading.current?.focus();
  }, [focus]);
  const proposal = item.proposal;
  const billing = item.billing;
  const decision = item.moneyDecision;
  const hasBookingRoute = typeof item.bookingId === 'string' && /^[a-f0-9]{24}$/i.test(item.bookingId);
  const bookingLabel = [item.booking?.code ?? item.bookingId, item.booking?.serviceName, complaintVisitTime(item.booking)]
    .filter(Boolean).join(' · ');
  const billingReady = billing?.status === 'AVAILABLE';
  const remaining = billingReady ? Math.max(0, billing.basisAmountVnd - (billing.approvedTotalVnd ?? 0)) : null;

  return <>
    <header className="refund-processing__detail-header">
      <h2 tabIndex={-1} ref={heading}>{item.code ?? item.id}</h2>
      <StatusBadge status={proposal?.status} />
    </header>
    <dl className="refund-processing__facts">
      <div><dt>Khách hàng</dt><dd>{[item.customer?.displayName, item.customer?.phone].filter(Boolean).join(' · ') || '—'}</dd></div>
      <div><dt>Lịch đặt</dt><dd>{bookingLabel || '—'}</dd></div>
      <div><dt>Khách đã trả</dt><dd>{billingReady ? bookingMoney(billing.basisAmountVnd) : 'Chưa có thanh toán được xác nhận'}</dd></div>
      <div><dt>Đã hoàn</dt><dd>{billingReady ? bookingMoney(billing.approvedTotalVnd ?? 0) : '—'}</dd></div>
      <div><dt>Còn lại</dt><dd>{Number.isSafeInteger(remaining) ? bookingMoney(remaining) : '—'}</dd></div>
      <div><dt>Nhân viên đề xuất</dt><dd>{[proposal?.createdByName, complaintDeadline(proposal?.createdAt)].filter(Boolean).join(' · ') || '—'}</dd></div>
      <div><dt>Số tiền đề xuất</dt><dd><strong>{Number.isSafeInteger(proposal?.amountVnd) ? bookingMoney(proposal.amountVnd) : '—'}</strong></dd></div>
    </dl>
    <section className="refund-processing__statement">
      <h3>Lý do và bằng chứng</h3>
      <p>{proposal?.reason || '—'}</p>
      <Evidence complaintId={item.id} items={proposal?.evidenceRefs} label="Ảnh bằng chứng của Staff" getCsrfToken={getCsrfToken} />
      <Evidence complaintId={item.id} items={item.evidenceRefs} label="Ảnh của khách" getCsrfToken={getCsrfToken} />
    </section>
    <div className="refund-processing__links">
      <Link to={'/admin/complaints?complaint=' + encodeURIComponent(item.id)}>Xem khiếu nại</Link>
      {hasBookingRoute && <Link to={'/staff/bookings/' + item.bookingId}>Xem lịch đặt</Link>}
    </div>
    {proposal?.status === 'PENDING'
      ? <RefundDecisionForm key={item.id + ':' + item.version} item={item} api={api} onDecided={onDecided} />
      : decision && <section className="refund-processing__statement">
        <h3>Kết quả đã quyết</h3>
        {decision.outcome === 'REJECT'
          ? <p>Đã từ chối đề xuất hoàn tiền.{decision.reason ? ' Lý do: ' + decision.reason : ''}</p>
          : <p>Số tiền duyệt: <strong>{bookingMoney(decision.amountVnd)}</strong>
            {decision.outcome === 'REDUCE' ? ' (hạ từ ' + bookingMoney(proposal.amountVnd) + ')' : ''}</p>}
        {decision.decidedAt && <p className="refund-processing__muted">Quyết định lúc {complaintDeadline(decision.decidedAt)}</p>}
      </section>}
  </>;
}

function BookingRefundDetail({ item }) {
  const hasBookingRoute = typeof item.bookingId === 'string' && /^[a-f0-9]{24}$/i.test(item.bookingId);
  return <>
    <header className="refund-processing__detail-header">
      <h2>{item.booking?.serviceName || 'Hoàn tiền huỷ lịch đặt'}</h2>
      <StatusBadge status={item.state || 'RECORDED'} />
    </header>
    <dl className="refund-processing__facts">
      <div><dt>Khách hàng</dt><dd>{item.customer?.displayName || '—'}</dd></div>
      <div><dt>Mã lịch đặt</dt><dd><code>{item.bookingId || '—'}</code></dd></div>
      <div><dt>Buổi chăm sóc</dt><dd>{item.visit?.startAt ? complaintDeadline(item.visit.startAt) : '—'}</dd></div>
      <div><dt>Số tiền hoàn</dt><dd><strong>{bookingMoney(item.amountVnd)}</strong></dd></div>
      {item.lateFeeVnd > 0 && <div><dt>Phí huỷ muộn (30%)</dt><dd>{bookingMoney(item.lateFeeVnd)}</dd></div>}
      {item.comboDiscountAdjustmentVnd > 0 && <div><dt>Điều chỉnh giảm giá combo</dt><dd>− {bookingMoney(item.comboDiscountAdjustmentVnd)}</dd></div>}
      <div><dt>Ghi nhận lúc</dt><dd>{item.recordedAt ? complaintDeadline(item.recordedAt) : '—'}</dd></div>
      <div><dt>Lý do huỷ</dt><dd>{item.reason || 'Không ghi nhận lý do'}</dd></div>
    </dl>
    <p className="refund-processing__note">
      Khoản hoàn tiền từ huỷ lịch đặt đã được ghi nhận tự động theo GBR-15/GBR-17 để kế toán Paw World chi trả ngoài hệ thống.
    </p>
    <div className="refund-processing__links">
      {hasBookingRoute && <Link to={'/staff/bookings/' + item.bookingId}>Xem lịch đặt</Link>}
    </div>
  </>;
}

export function RefundProcessingPage({ api: suppliedApi } = {}) {
  const [params, setParams] = useSearchParams();
  const { getCsrfToken } = useSession();
  const api = useMemo(() => suppliedApi ?? createComplaintApi({ getCsrfToken }), [suppliedApi, getCsrfToken]);
  const [status, setStatus] = useState('PENDING');
  const [cursors, setCursors] = useState([undefined]);
  const [message, setMessage] = useState(null);
  const [selectedBookingRefundId, setSelectedBookingRefundId] = useState(null);
  const [savedCounts, setSavedCounts] = useState(null);
  const tabRefs = useRef([]);
  const selectedParam = params.get('complaint');
  const cursor = cursors.at(-1);
  const isBookingRefundTab = status === 'BOOKING_REFUNDS';

  const list = useApiResource(useCallback(({ signal }) => !isBookingRefundTab
    ? api.refundProposals({
      status, sort: status === 'PENDING' ? 'oldest' : 'newest', cursor, signal
    })
    : Promise.resolve({ data: null }), [api, isBookingRefundTab, status, cursor]));

  useEffect(() => {
    if (list.data?.proposalCounts) setSavedCounts(list.data.proposalCounts);
  }, [list.data]);

  const bookingRefunds = useApiResource(useCallback(({ signal }) => isBookingRefundTab && typeof api.bookingRefunds === 'function'
    ? api.bookingRefunds({ signal })
    : Promise.resolve({ data: { items: [], total: 0 } }), [api, isBookingRefundTab]));

  const items = list.data?.items ?? [];
  const counts = list.data?.proposalCounts ?? savedCounts;
  const selectedId = !isBookingRefundTab ? (selectedParam || items[0]?.id) : null;

  const bookingRefundItems = bookingRefunds.data?.items ?? [];
  const activeBookingRefund = bookingRefundItems.find(item => item.id === selectedBookingRefundId) ?? bookingRefundItems[0] ?? null;

  const detail = useApiResource(useCallback(({ signal }) => selectedId
    ? api.refundProposal({ complaintId: selectedId, signal })
    : Promise.resolve({ data: null }), [api, selectedId]));

  function select(id) {
    setParams(id ? { complaint: id } : {});
  }

  function changeTab(nextStatus) {
    setMessage(null);
    setStatus(nextStatus);
    setCursors([undefined]);
    setSelectedBookingRefundId(null);
    select(null);
  }

  function tabKeyboard(event, index) {
    const next = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length,
      Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    changeTab(tabs[next][0]);
    tabRefs.current[next]?.focus();
  }

  function onDecided(result) {
    const outcome = result?.complaint?.moneyDecision?.outcome;
    const code = result?.messageCode ?? (outcome === 'REJECT' ? 'MSG135' : 'MSG134');
    setMessage(successMessages[code] ?? successMessages.MSG134);
    list.retry();
    detail.retry();
  }

  function tabLabel(tabKey, label) {
    if (tabKey === 'BOOKING_REFUNDS') {
      return Number.isSafeInteger(bookingRefunds.data?.total) && isBookingRefundTab
        ? `${label} (${bookingRefunds.data.total})`
        : label;
    }
    return `${label} (${counts?.[tabKey] ?? (list.status === 'success' ? 0 : '…')})`;
  }

  return <section className="refund-processing" aria-labelledby="refund-processing-title">
    <header className="refund-processing__header">
      <h1 id="refund-processing-title">Hoàn tiền</h1>
      <p>Xem và quyết định các khoản hoàn tiền từ khiếu nại và theo dõi hoàn tiền huỷ lịch đặt.</p>
    </header>
    {message && <Notice state="success" title={message} />}
    <div className="refund-processing__tabs" role="tablist" aria-label="Trạng thái đề xuất hoàn tiền">
      {tabs.map(([tabKey, label], index) => <button key={tabKey} id={'refund-tab-' + tabKey}
        ref={element => { tabRefs.current[index] = element; }} type="button" role="tab"
        aria-controls="refund-tab-panel" aria-selected={status === tabKey} tabIndex={status === tabKey ? 0 : -1}
        onClick={() => changeTab(tabKey)} onKeyDown={event => tabKeyboard(event, index)}>
        {tabLabel(tabKey, label)}
      </button>)}
    </div>
    {isBookingRefundTab ? <div className="refund-processing__columns">
      <section id="refund-tab-panel" role="tabpanel" aria-labelledby="refund-tab-BOOKING_REFUNDS"
        className="refund-processing__list">
        {bookingRefunds.status !== 'success' && <ResourceNotice resource={bookingRefunds}
          title={bookingRefunds.status === 'loading' ? 'Đang tải hoàn tiền lịch đặt…' : 'Chưa tải được danh sách hoàn tiền lịch đặt'} />}
        {bookingRefunds.status === 'success' && (bookingRefundItems.length
          ? <ul>{bookingRefundItems.map(item => <li key={item.id}>
            <button type="button" aria-current={activeBookingRefund?.id === item.id || undefined}
              onClick={() => setSelectedBookingRefundId(item.id)}>
              <span className="refund-processing__row-title">
                <strong>{[item.customer?.displayName || 'Khách hàng', bookingMoney(item.amountVnd)].join(' · ')}</strong>
                <StatusBadge status={item.state || 'RECORDED'} />
              </span>
              <span className="refund-processing__muted">
                {[
                  item.booking?.serviceName || item.bookingId,
                  item.lateFeeVnd > 0 ? 'Phí huỷ muộn ' + bookingMoney(item.lateFeeVnd) : 'Huỷ miễn phí',
                  item.recordedAt ? complaintDeadline(item.recordedAt) : null
                ].filter(Boolean).join(' · ')}
              </span>
            </button>
          </li>)}</ul>
          : <p className="refund-processing__empty">Chưa có khoản hoàn tiền nào từ huỷ lịch đặt.</p>)}
      </section>
      {activeBookingRefund && <section className="refund-processing__detail" aria-label="Chi tiết hoàn tiền lịch đặt">
        <BookingRefundDetail item={activeBookingRefund} />
      </section>}
    </div> : <div className="refund-processing__columns">
      <section id="refund-tab-panel" role="tabpanel" aria-labelledby={'refund-tab-' + status}
        className="refund-processing__list">
        {list.status !== 'success' && <ResourceNotice resource={list}
          title={list.status === 'loading' ? 'Đang tải đề xuất hoàn tiền…' : 'Chưa tải được danh sách đề xuất hoàn tiền'} />}
        {list.status === 'success' && (items.length
          ? <ul>{items.map(item => <li key={item.id}>
            <button type="button" aria-current={selectedId === item.id || undefined}
              onClick={() => { setMessage(null); select(item.id); }}>
              <span className="refund-processing__row-title">
                <strong>{[item.code ?? item.id, item.customer?.displayName].filter(Boolean).join(' · ')}</strong>
                <StatusBadge status={item.proposal?.status} />
              </span>
              <span className="refund-processing__muted">
                {[
                  item.booking?.code ?? complaintSubject(item),
                  Number.isSafeInteger(item.proposal?.amountVnd) ? 'Đề xuất ' + bookingMoney(item.proposal.amountVnd) : null,
                  item.proposal?.createdAt ? 'Gửi ' + complaintDeadline(item.proposal.createdAt) : null
                ].filter(Boolean).join(' · ')}
              </span>
            </button>
          </li>)}</ul>
          : <p className="refund-processing__empty">
            {status === 'PENDING' ? 'Chưa có đề xuất hoàn tiền chờ duyệt.' : 'Chưa có đề xuất nào đã quyết.'}
          </p>)}
        {(cursors.length > 1 || list.data?.nextCursor) && <div className="refund-processing__paging">
          <Button variant="secondary" disabled={cursors.length === 1 || list.status === 'loading'}
            onClick={() => { setCursors(previous => previous.slice(0, -1)); select(null); }}>Trang trước</Button>
          <Button variant="secondary" disabled={!list.data?.nextCursor}
            onClick={() => { setCursors(previous => [...previous, list.data.nextCursor]); select(null); }}>Trang tiếp</Button>
        </div>}
      </section>
      {selectedId && <section className="refund-processing__detail" aria-label="Chi tiết đề xuất hoàn tiền">
        {detail.status === 'success' && detail.data?.id === selectedId
          ? <ProposalDetail key={selectedId} item={detail.data} api={api} getCsrfToken={getCsrfToken}
            focus={selectedParam === selectedId} onDecided={onDecided} />
          : <ResourceNotice resource={detail} title={detail.status === 'loading' || detail.status === 'success'
            ? 'Đang tải đề xuất…' : 'Chưa mở được chi tiết đề xuất'} />}
      </section>}
    </div>}
  </section>;
}
