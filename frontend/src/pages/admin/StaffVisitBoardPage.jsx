import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Select, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { createVisitBoardApi, formatVisitBoardTime, vietnamDateTimeToUtc, vietnamToday } from '../../services/visit-board-api.js';
import './staff-visit-board.css';

const KINDS = { ALL: 'Tất cả', PROPOSAL: 'Đề xuất', BOOKING: 'Booking', OFFER: 'Lời mời Sitter', VISIT: 'Buổi chăm sóc', CASE: 'Sự cố / khiếu nại' };
const STATES = {
  ALL: [], PROPOSAL: ['PENDING_CUSTOMER_CONFIRMATION', 'CUSTOMER_CONFIRMED', 'EXPIRED', 'REJECTED', 'STALE'],
  BOOKING: ['DRAFT', 'PENDING_CUSTOMER_CONFIRMATION', 'PENDING_PAYMENT', 'DISPATCH_PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  OFFER: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'],
  VISIT: ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'STAFF_CLOSED', 'CANCELLED'],
  CASE: ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']
};
const LABELS = { PENDING_CUSTOMER_CONFIRMATION: 'Chờ Customer xác nhận', CUSTOMER_CONFIRMED: 'Customer đã xác nhận',
  PENDING_PAYMENT: 'Chờ thanh toán', DISPATCH_PENDING: 'Chờ điều phối', SCHEDULED: 'Chưa phân công', ASSIGNED: 'Đã phân công',
  PENDING: 'Chờ phản hồi', DECLINED: 'Đã từ chối', EXPIRED: 'Hết hạn', OPEN: 'Đang mở', IN_PROGRESS: 'Đang thực hiện' };
function errorText(error) {
  if (error.status === 403) return 'Quyền vận hành đã thay đổi. Bạn không thể xem hoặc thao tác dữ liệu này.';
  if (error.status === 401) return 'Phiên đã hết hạn. Đăng nhập lại để tiếp tục.';
  if (error.status === 409) return 'Lịch, điều kiện nhận ca hoặc phiên bản đã thay đổi. Tải lại và kiểm tra trước khi tiếp tục.';
  if (error.status === 404 || error.status === 503) return 'Bảng điều phối chưa sẵn sàng. Thử lại khi dịch vụ được kết nối.';
  if (error.status === 422 || error.code === 'INVALID_LOCAL_TIME') return 'Kiểm tra nội dung, khu vực và thời gian đã nhập.';
  return 'Chưa nhận được xác nhận từ máy chủ. Tải lại để kiểm tra kết quả trước khi gửi lại.';
}

export function StaffVisitBoardPage({ apiRequest: suppliedRequest, operationKey = () => window.crypto.randomUUID() }) {
  const session = useSession();
  const canView = session.status === 'authenticated' && session.user?.roles?.some(role => ['STAFF', 'ADMIN'].includes(role));
  const initial = () => ({ date: vietnamToday(), areaCode: '', kind: 'ALL', state: '', needsAction: false, cursor: '' });
  const [draft, setDraft] = useState(initial);
  const [filter, setFilter] = useState(initial);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState('idle');
  const [detailRevision, setDetailRevision] = useState(0);
  const [form, setForm] = useState({ message: '', startAt: '', endAt: '', sitterId: '', reason: '' });
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const operation = useRef(null);
  const actorId = session.user?.id ?? session.user?.userId;
  const actorGeneration = useRef(0);
  useEffect(() => { actorGeneration.current += 1; setSelectedId(''); setDetail(null); setFeedback(null);
    setPending(false); setUncertain(false); operation.current = null;
  }, [actorId, canView]);
  const request = useMemo(() => suppliedRequest ?? createApiClient({ getCsrfToken: session.getCsrfToken,
    onUnauthorized: session.invalidate }), [suppliedRequest, session.getCsrfToken, session.invalidate]);
  const api = useMemo(() => createVisitBoardApi(request), [request]);
  const load = useCallback(options => canView ? api.list(filter, options) : Promise.resolve({ data: null }), [api, canView, filter, actorId]);
  const resource = useApiResource(load);
  const rows = canView && resource.status === 'success' ? resource.data?.items ?? [] : [];
  useEffect(() => {
    if (!canView || !selectedId) { setDetail(null); setDetailStatus('idle'); return; }
    const controller = new AbortController();
    setDetail(null); setDetailStatus('loading');
    api.detail(selectedId, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (result.pending) { setDetailStatus('pending'); return; }
      if (!result.data || result.data.id !== selectedId) throw Error('Invalid detail');
      setDetail(result.data); setDetailStatus('success');
    }).catch(error => { if (!controller.signal.aborted) setDetailStatus(error.status === 403 ? 'forbidden' : 'error'); });
    return () => controller.abort();
  }, [api, canView, actorId, selectedId, detailRevision]);
  const reload = () => { resource.retry(); setDetailRevision(value => value + 1); };
  const mutate = async (event, action) => {
    event.preventDefault();
    if (!canView || !detail || pending || uncertain) return;
    const generation = actorGeneration.current;
    setPending(true); setFeedback(null);
    try {
      const body = action === 'propose' ? { expectedVersion: detail.version, message: form.message,
        alternatives: [{ startAt: vietnamDateTimeToUtc(form.startAt), endAt: vietnamDateTimeToUtc(form.endAt) }] }
        : { expectedVersion: detail.version, sitterId: form.sitterId.trim(), reason: form.reason.trim() };
      const fingerprint = JSON.stringify({ id: detail.id, action, body });
      if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, key: operationKey() };
      const result = await api[action](detail.id, body, operation.current.key);
      if (generation !== actorGeneration.current) return;
      if (result.pending) { setUncertain(true); setFeedback({ state: 'pending', text: 'Yêu cầu đang chờ xác nhận. Chưa thay đổi trạng thái buổi chăm sóc.' }); }
      else if (action === 'propose' && result.data?.visitId === detail.id
        && result.data?.state === 'PENDING_CUSTOMER_CONFIRMATION' && result.data?.visitResolved === false) {
        setFeedback({ state: 'pending', text: 'Đã ghi nhận đề xuất. Vẫn chờ Customer chọn và xác nhận; buổi chăm sóc chưa được giải quyết.' });
        operation.current = null; reload();
      } else if (action === 'assign' && result.data?.id === detail.id && result.data?.sitterId === body.sitterId
        && result.data?.state === 'ASSIGNED' && result.data?.version === detail.version + 1) {
        setFeedback({ state: 'success', text: 'Máy chủ đã xác nhận phân công.' }); operation.current = null; reload();
      } else {
        setUncertain(true); setFeedback({ state: 'pending', text: 'Chưa có xác nhận hợp lệ. Tải lại để kiểm tra; không gửi lại tự động.' });
      }
    } catch (error) {
      if (generation !== actorGeneration.current) return;
      const unknown = ['TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code) || error.status >= 500;
      setUncertain(unknown);
      setFeedback({ state: unknown ? 'pending' : error.status === 403 ? 'forbidden' : 'error', text: errorText(error) });
      if (error.status === 403 || error.status === 401) { setDetail(null); setSelectedId(''); resource.retry(); }
    } finally { if (generation === actorGeneration.current) setPending(false); }
  };
  const choose = row => { setSelectedId(row.visitId ?? row.id); setFeedback(null); setUncertain(false);
    setForm({ message: '', startAt: '', endAt: '', sitterId: '', reason: '' }); operation.current = null; };
  if (['loading', 'pending'].includes(session.status)) return <main className="visit-board"><Notice state="loading" title="Đang kiểm tra phiên">Đang xác minh quyền vận hành.</Notice></main>;
  if (!canView) return <main className="visit-board"><Notice state="forbidden" title="Không có quyền truy cập bảng điều phối">Chỉ Staff và Admin được cấp phạm vi vận hành mới truy cập.</Notice></main>;
  return <main className="visit-board">
    <a href="#visit-board-results" className="visit-board-skip">Bỏ qua đến kết quả</a>
    <header><p className="visit-board-eyebrow">PAW WORLD CARE · ĐIỀU PHỐI</p><h1>Bảng điều phối</h1>
      <p>Theo dõi lịch, lời mời và công việc cần xử lý. Thời gian Việt Nam (UTC+7).</p></header>
    <form className="visit-board-filters" onSubmit={event => { event.preventDefault(); setFilter({ ...draft, cursor: '' }); setSelectedId(''); }}>
      <Input label="Ngày vận hành" type="date" required value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} />
      <Input label="Mã khu vực" value={draft.areaCode} onChange={event => setDraft({ ...draft, areaCode: event.target.value })} hint="Để trống để xem các khu vực được cấp quyền." />
      <Select label="Loại công việc" value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value, state: '' })}>
        {Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <Select label="Trạng thái" value={draft.state} onChange={event => setDraft({ ...draft, state: event.target.value })}>
        <option value="">Tất cả trạng thái</option>{STATES[draft.kind].map(state => <option key={state} value={state}>{LABELS[state] ?? state}</option>)}
      </Select>
      <label className="visit-board-check"><input type="checkbox" checked={draft.needsAction} onChange={event => setDraft({ ...draft, needsAction: event.target.checked })} />Chỉ việc cần xử lý</label>
      <Button type="submit" disabled={pending}>Áp dụng bộ lọc</Button><Button variant="secondary" onClick={reload} disabled={pending}>Tải lại</Button>
    </form>
    {feedback && <Notice state={feedback.state} title={feedback.state === 'success' ? 'Đã xác nhận' : 'Trạng thái yêu cầu'}>{feedback.text}</Notice>}
    <div className="visit-board-columns">
      <section id="visit-board-results" aria-label="Kết quả điều phối" aria-busy={resource.status === 'loading'}>
        {resource.status === 'loading' && <Notice state="loading" title="Đang tải bảng điều phối">Đang lấy dữ liệu trong phạm vi được cấp.</Notice>}
        {resource.status === 'pending' && <Notice state="pending" title="Bảng đang chờ">Máy chủ chưa xác nhận dữ liệu.</Notice>}
        {resource.status === 'forbidden' && <Notice state="forbidden" title="Không được phép xem khu vực">Chọn khu vực thuộc phạm vi vận hành của bạn.</Notice>}
        {resource.status === 'error' && <Notice state="error" title="Không tải được bảng điều phối">{errorText({ code: resource.code })}</Notice>}
        {resource.status === 'success' && rows.length === 0 && <Notice state="empty" title="Không có công việc phù hợp">Thử ngày, khu vực hoặc trạng thái khác.</Notice>}
        <ul className="visit-board-list">{rows.map(row => <li key={row.kind + row.id}>
          <article><p className="visit-board-eyebrow">{KINDS[row.kind]} · {row.areaCode}</p><h2>{row.serviceName}</h2>
            <p><time dateTime={row.startAt}>{formatVisitBoardTime(row.startAt)}</time></p>
            <p>{LABELS[row.state] ?? row.state}{row.needsAction ? ' · Cần xử lý' : ''}</p>
            {row.remedyState === 'PENDING_CUSTOMER_CONFIRMATION' && <p className="visit-board-pending">Chờ Customer xác nhận · Chưa giải quyết</p>}
            <p>{row.petCount ?? '—'} thú cưng · Mã {row.id}</p>
            {(row.visitId || row.kind === 'VISIT') && <Button variant="secondary" onClick={() => choose(row)} disabled={pending || uncertain}>Xử lý {row.visitId ?? row.id}</Button>}
          </article>
        </li>)}</ul>
        <nav aria-label="Phân trang"><Button variant="secondary" disabled={!filter.cursor || pending} onClick={() => { setFilter({ ...filter, cursor: '' }); setSelectedId(''); }}>Về trang đầu</Button>
          <Button disabled={!resource.data?.nextCursor || resource.status !== 'success' || pending} onClick={() => { setFilter({ ...filter, cursor: resource.data.nextCursor }); setSelectedId(''); }}>Trang tiếp</Button></nav>
      </section>
      <aside className="visit-board-detail" aria-label="Xử lý buổi chăm sóc">
        <h2>Phương án điều phối</h2>
        {!selectedId && <p>Chọn một buổi chăm sóc để xem phương án và phản hồi.</p>}
        {['loading', 'pending', 'error', 'forbidden'].includes(detailStatus) && <Notice state={detailStatus} title={{ loading: 'Đang tải buổi chăm sóc', pending: 'Buổi chăm sóc đang chờ', error: 'Không tải được buổi chăm sóc', forbidden: 'Không có quyền xem buổi chăm sóc' }[detailStatus]}>Tải lại để kiểm tra dữ liệu mới nhất.</Notice>}
        {detail && <><h3>{detail.serviceName}</h3><p>{formatVisitBoardTime(detail.startAt)} · {detail.areaCode}</p>
          {detail.remedy && <section aria-label="Đề xuất và phản hồi"><h3>{LABELS[detail.remedy.state] ?? detail.remedy.state}</h3>
            <p>{detail.remedy.message}</p><p>Ghi nhận: {formatVisitBoardTime(detail.remedy.createdAt)}</p>
            <ul>{detail.remedy.alternatives.map(item => <li key={item.id}>{formatVisitBoardTime(item.startAt)} — {formatVisitBoardTime(item.endAt)}</li>)}</ul>
            {detail.remedy.response ? <p>Phản hồi {formatVisitBoardTime(detail.remedy.response.respondedAt)}: {detail.remedy.response.message}</p> : <p>Customer chưa phản hồi. Không coi booking là xử lý xong.</p>}
          </section>}
          {detail.state === 'SCHEDULED' && <>
            {detail.noSitterReason && <form onSubmit={event => mutate(event, 'propose')}><h3>Đề xuất lịch thay thế</h3>
              <Input label="Nội dung gửi Customer" required maxLength={1000} value={form.message} disabled={pending || uncertain} onChange={event => setForm({ ...form, message: event.target.value })} />
              <Input label="Bắt đầu mới (giờ Việt Nam)" type="datetime-local" required value={form.startAt} disabled={pending || uncertain} onChange={event => setForm({ ...form, startAt: event.target.value })} />
              <Input label="Kết thúc mới (giờ Việt Nam)" type="datetime-local" required value={form.endAt} disabled={pending || uncertain} onChange={event => setForm({ ...form, endAt: event.target.value })} />
              <Button type="submit" disabled={pending || uncertain}>Gửi đề xuất · Chờ Customer</Button>
            </form>}
            <form onSubmit={event => mutate(event, 'assign')}><h3>Phân công thủ công</h3><p>Máy chủ kiểm tra lại điều kiện nhận ca, xung đột, thanh toán và xác nhận của Customer trước khi lưu.</p>
              <Input label="Mã Sitter" required value={form.sitterId} disabled={pending || uncertain} onChange={event => setForm({ ...form, sitterId: event.target.value })} />
              <Input label="Lý do phân công" required maxLength={1000} value={form.reason} disabled={pending || uncertain} onChange={event => setForm({ ...form, reason: event.target.value })} />
              <Button type="submit" disabled={pending || uncertain}>Kiểm tra và phân công</Button>
            </form>
          </>}
        </>}
      </aside>
    </div>
  </main>;
}
