import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createComplaintApi } from '../../services/complaint-api.js';
import { createPrivateImageApi } from '../../services/private-image-api.js';
import { bookingMoney } from '../../utils/booking-presentation.js';
import { complaintDeadline, complaintSubject, complaintVisitTime } from '../../utils/complaint-presentation.js';
import { hasRole } from '../../utils/role-access.js';
import { ComplaintManagementForm } from './ComplaintManagementForms.jsx';
import './complaint-management.css';

const tabs = [
  ['OPEN', 'Đang mở'],
  ['ESCALATED', 'Chuyển quản trị'],
  ['RESOLVED', 'Đã giải quyết']
];
const statusLabel = Object.fromEntries(tabs);
const emptyFilters = { state: 'OPEN', q: '', sort: 'newest' };
const successMessages = {
  MSG131: 'Đã gửi kết quả cho khách hàng.',
  MSG147: 'Đã gửi khoản đề xuất cho quản trị viên. Khách sẽ nhận kết quả sau khi quản trị viên quyết định.'
};

function Status({ item }) {
  const old = item.state === 'OPEN' && Number.isSafeInteger(item.openDays) && item.openDays >= 3;
  return <span className={'complaint-management__status complaint-management__status--' +
    (old ? 'old' : item.state.toLowerCase())}>
    {old ? 'Mở ' + item.openDays + ' ngày' : statusLabel[item.state] ?? 'Đang cập nhật'}
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
  return <div className="complaint-management__evidence">
    <button type="button" className="complaint-management__text-button" aria-expanded={visible}
      onClick={() => setVisible(previous => !previous)}>{label} ({items.length})</button>
    {visible && <ul>{items.map(({ mediaId, caption }, index) =>
      <EvidencePhoto key={mediaId} api={api} mediaId={mediaId} label={caption || label + ' ' + (index + 1)} />)}</ul>}
  </div>;
}

function ComplaintDetail({ item, api, imageApi, isAdmin, getCsrfToken, onComplete, focus }) {
  const heading = useRef(null);
  useEffect(() => {
    if (focus) heading.current?.focus();
  }, [focus]);
  const bookingCode = item.booking?.code;
  const bookingTime = complaintVisitTime(item.booking);
  const visitTime = complaintVisitTime(item.visit);
  const bookingLabel = [bookingCode ?? item.bookingId, item.booking?.serviceName, bookingTime].filter(Boolean).join(' · ');
  const visitLabel = item.scope === 'VISIT'
    ? [visitTime ? 'Buổi ' + visitTime : 'Buổi chăm sóc', item.visit?.sitterName].filter(Boolean).join(' · ')
    : 'Cả lịch đặt' + (bookingCode ? ' ' + bookingCode : '');
  const pending = item.proposal?.status === 'PENDING';
  const open = item.state === 'OPEN' && !pending;
  const finalDecision = isAdmin && item.state === 'ESCALATED';
  const hasBookingRoute = typeof item.bookingId === 'string' && /^[a-f0-9]{24}$/i.test(item.bookingId);
  return <>
    <header className="complaint-management__detail-header">
      <h2 tabIndex={-1} ref={heading}>{item.code ?? item.id}</h2>
      <Status item={item} />
    </header>
    <dl className="complaint-management__facts">
      <div><dt>Khách hàng</dt><dd>{[item.customer?.displayName, item.customer?.phone].filter(Boolean).join(' · ') || '—'}</dd></div>
      <div><dt>Lịch đặt</dt><dd>{bookingLabel || '—'}</dd></div>
      <div><dt>Khiếu nại về</dt><dd>{visitLabel}</dd></div>
      <div><dt>Gửi lúc</dt><dd>{complaintDeadline(item.createdAt) ?? '—'}</dd></div>
    </dl>
    <section className="complaint-management__statement"><h3>Khách viết</h3><p>{item.description || '—'}</p></section>
    <div className="complaint-management__links">
      <Evidence complaintId={item.id} items={item.evidenceRefs} label="Ảnh của khách" getCsrfToken={getCsrfToken} />
      {hasBookingRoute && <Link to={'/staff/bookings/' + item.bookingId}>Xem lịch đặt</Link>}
    </div>
    {item.handlingNotes && <section className="complaint-management__statement"><h3>Ghi chú đã lưu</h3><p>{item.handlingNotes}</p></section>}
    {item.customerResult && <section className="complaint-management__statement">
      <h3>{item.isFinal ? 'Kết quả cuối' : 'Kết quả đã gửi khách'}</h3><p>{item.customerResult}</p>
      {Number.isSafeInteger(item.approvedAmountVnd) && <p>Khoản đã quyết: {bookingMoney(item.approvedAmountVnd)}</p>}
    </section>}
    {pending && <section className="complaint-management__statement">
      <h3>Khoản đề xuất đang chờ duyệt</h3>
      <p>{bookingMoney(item.proposal.amountVnd)}</p><p>{item.proposal.reason}</p>
      <Evidence complaintId={item.id} items={item.proposal.evidenceRefs} label="Ảnh bằng chứng của Staff" getCsrfToken={getCsrfToken} />
    </section>}
    {item.objectionReason && <section className="complaint-management__statement">
      <h3>Lý do khách không đồng ý</h3><p>{item.objectionReason}</p>
    </section>}
    {(open || finalDecision) && <ComplaintManagementForm key={item.id + ':' + item.version}
      item={item} api={api} imageApi={imageApi} finalDecision={finalDecision} onComplete={onComplete} />}
    {!open && !finalDecision && item.billState === 'ON_HOLD' && <p className="complaint-management__bill-note">
      Hoá đơn của {bookingCode ?? 'lịch đặt'} được giữ đến khi kết quả là cuối cùng.
    </p>}
  </>;
}

export function ComplaintManagementPage({ api: suppliedApi, imageApi: suppliedImageApi, complaintId: suppliedId, initialFilters = {} }) {
  const route = useParams(), [params, setParams] = useSearchParams();
  const { user, getCsrfToken } = useSession();
  const isAdmin = hasRole(user, 'ADMIN');
  const api = useMemo(() => suppliedApi ?? createComplaintApi({ getCsrfToken }), [suppliedApi, getCsrfToken]);
  const imageApi = useMemo(() => suppliedImageApi ?? createPrivateImageApi({ getCsrfToken }), [suppliedImageApi, getCsrfToken]);
  const [filters, setFilters] = useState(() => ({ ...emptyFilters, ...initialFilters }));
  const [search, setSearch] = useState(filters.q);
  const [cursors, setCursors] = useState([undefined]);
  const [message, setMessage] = useState(null);
  const tabRefs = useRef([]);
  const selectedParam = suppliedId ?? route.complaintId ?? params.get('complaint');
  const cursor = cursors.at(-1);
  const list = useApiResource(useCallback(({ signal }) => api.list({ ...filters, cursor, signal }), [api, filters, cursor]));
  const items = list.data?.items ?? [];
  const counts = list.data?.counts;
  const selectedId = selectedParam || items[0]?.id;
  const detail = useApiResource(useCallback(({ signal }) => selectedId
    ? api.get({ complaintId: selectedId, signal }) : Promise.resolve({ data: null }), [api, selectedId]));

  function select(id) {
    setParams(id ? { complaint: id } : {});
  }

  function apply(filtersUpdate) {
    setFilters(previous => ({ ...previous, ...filtersUpdate }));
    setCursors([undefined]);
    select(null);
  }

  function changeTab(state) {
    setMessage(null);
    apply({ state });
  }

  function tabKeyboard(event, index) {
    const next = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length,
      Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    changeTab(tabs[next][0]);
    tabRefs.current[next]?.focus();
  }

  function completed(result) {
    select(selectedId);
    setMessage(successMessages[result.messageCode] ?? 'Đã ghi kết quả cuối.');
    list.retry();
    detail.retry();
  }

  return <section className="complaint-management" aria-labelledby="complaint-management-title">
    <header className="complaint-management__header">
      <h1 id="complaint-management-title">Khiếu nại</h1>
      <p>Theo dõi từng khiếu nại đến khi có kết quả. Số tiền hoàn do quản lý duyệt.</p>
    </header>
    {message && <Notice state="success" title={message} />}
    <div className="complaint-management__tabs" role="tablist" aria-label="Trạng thái khiếu nại">
      {tabs.map(([state, label], index) => <button key={state} id={'complaint-tab-' + state}
        ref={element => { tabRefs.current[index] = element; }} type="button" role="tab"
        aria-controls="complaint-tab-panel" aria-selected={filters.state === state} tabIndex={filters.state === state ? 0 : -1}
        onClick={() => changeTab(state)} onKeyDown={event => tabKeyboard(event, index)}>
        {label} ({counts?.[state] ?? (list.status === 'success' ? 0 : '…')})
      </button>)}
    </div>
    <form className="complaint-management__filters" onSubmit={event => { event.preventDefault(); apply({ q: search.trim() }); }}>
      <input type="search" aria-label="Tìm theo mã khiếu nại, mã lịch đặt hoặc tên khách"
        placeholder="Tìm theo mã khiếu nại, mã lịch đặt hoặc tên khách"
        maxLength={100} value={search} onChange={event => setSearch(event.target.value)} />
      <Button type="submit" variant="secondary">Tìm</Button>
      <select aria-label="Sắp xếp" value={filters.sort} onChange={event => apply({ sort: event.target.value })}>
        <option value="newest">Mới gửi trước</option><option value="oldest">Cũ nhất trước</option>
      </select>
    </form>
    <div className="complaint-management__columns">
      <section id="complaint-tab-panel" role="tabpanel" aria-labelledby={'complaint-tab-' + filters.state}
        className="complaint-management__list">
        {list.status !== 'success' && <ResourceNotice resource={list}
          title={list.status === 'loading' ? 'Đang tải khiếu nại…' : 'Chưa tải được danh sách khiếu nại'} />}
        {list.status === 'success' && (items.length
          ? <ul>{items.map(item => <li key={item.id}>
            <button type="button" aria-current={selectedId === item.id || undefined}
              onClick={() => { setMessage(null); select(item.id); }}>
              <span className="complaint-management__row-title">
                <strong>{[item.code ?? item.id, item.customer?.displayName].filter(Boolean).join(' · ')}</strong>
                <Status item={item} />
              </span>
              <span className="complaint-management__muted">
                {[item.scope === 'VISIT' ? item.booking?.code : null, complaintSubject(item),
                  item.createdAt ? 'Gửi ' + complaintDeadline(item.createdAt) : null].filter(Boolean).join(' · ')}
              </span>
            </button>
          </li>)}</ul>
          : <p className="complaint-management__empty">Không tìm thấy khiếu nại.</p>)}
        {(cursors.length > 1 || list.data?.nextCursor) && <div className="complaint-management__paging">
          <Button variant="secondary" disabled={cursors.length === 1 || list.status === 'loading'}
            onClick={() => { setCursors(previous => previous.slice(0, -1)); select(null); }}>Trang trước</Button>
          <Button variant="secondary" disabled={!list.data?.nextCursor}
            onClick={() => { setCursors(previous => [...previous, list.data.nextCursor]); select(null); }}>Trang tiếp</Button>
        </div>}
      </section>
      {selectedId && <section className="complaint-management__detail" aria-label="Chi tiết khiếu nại">
        {detail.status === 'success' && detail.data?.id === selectedId
          ? <ComplaintDetail key={selectedId} item={detail.data} api={api} imageApi={imageApi} isAdmin={isAdmin}
            getCsrfToken={getCsrfToken} focus={selectedParam === selectedId} onComplete={completed} />
          : <ResourceNotice resource={detail} title={detail.status === 'loading' || detail.status === 'success'
            ? 'Đang tải hồ sơ…' : 'Chưa mở được hồ sơ khiếu nại'} />}
      </section>}
    </div>
  </section>;
}

export const ComplaintListPage = ComplaintManagementPage;
export const StaffComplaintDetailsPage = ComplaintManagementPage;
