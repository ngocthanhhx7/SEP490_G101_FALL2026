import { Link } from 'react-router-dom';
import { CursorPagination } from '../../components/ui/Pagination.jsx';
import { useCallback, useState } from 'react';
import { CalendarDays, Check, ChevronRight, ClipboardList, RefreshCw } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button, Dialog } from '../../components/ui/index.js';
import { OperationsTable, OperationsBadge } from '../../components/common/OperationsWorkspace.jsx';
import { googleMapsDirections } from '../../utils/maps.js';
import { sitterAreaLabel } from '../../utils/sitter-area-label.js';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';
import { AssignedCare } from './AssignedCare.jsx';
import { VisitWithdrawalDialog } from './VisitWithdrawalDialog.jsx';
import { VISIT_WITHDRAWAL_MESSAGES } from '../../constants/visit-withdrawal-messages.js';
import { VisitExecution } from './VisitExecution.jsx';
import { CompactEmpty, CompactRow } from '../../components/common/CompactSurface.jsx';
import '../../styles/employee-scheduling.css';
import './sitter-workspace.css';
const time = value => new Date(value).toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});
const states = {
  PENDING: 'Chờ phản hồi',
  ACCEPTED: 'Đã nhận',
  DECLINED: 'Đã từ chối',
  EXPIRED: 'Hết hạn',
  REVOKED: 'Đã thu hồi',
  ASSIGNED: 'Đã nhận ca',
  IN_PROGRESS: 'Đang chăm sóc',
  COMPLETED: 'Đã hoàn thành'
};
const title = row => `${row.serviceName || 'Ca chăm sóc'}${row.pets?.length ? ' cho ' + row.pets.map(pet => pet.name).filter(Boolean).join(', ') : ''}`;
export function EmployeeInvitationsPage({
  api, initialVisitId, initialOfferId, onCloseOffer
}) {
  const [offerPages, setOfferPages] = useState([]),
    [assignmentPages, setAssignmentPages] = useState([]),
    [historyPages, setHistoryPages] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false),
    [selected, setSelected] = useState(initialOfferId ? { kind: 'linkedOffer' }
      : /^[a-f0-9]{24}$/i.test(initialVisitId ?? '') ? { kind: 'linked' } : null),
    [withdrawalVisit, setWithdrawalVisit] = useState(null),
    [withdrawalResult, setWithdrawalResult] = useState(null);
  const offerCursor = offerPages.at(-1),
    assignmentCursor = assignmentPages.at(-1),
    historyCursor = historyPages.at(-1);
  const load = useCallback(({
    signal
  }) => api.offers({
    signal,
    cursor: offerCursor,
    state: 'PENDING'
  }), [api, offerCursor]);
  const assignmentsLoad = useCallback(({
    signal
  }) => api.assignments({
    signal,
    cursor: assignmentCursor
  }), [api, assignmentCursor]);
  const historyLoad = useCallback(({
    signal
  }) => historyOpen ? api.offers({
    signal,
    cursor: historyCursor,
    state: 'HISTORY'
  }) : Promise.resolve({
    data: {
      items: []
    }
  }), [api, historyOpen, historyCursor]);
  const resource = useApiResource(load),
    assignments = useApiResource(assignmentsLoad),
    history = useApiResource(historyLoad);
  const linkedLoad = useCallback(({ signal }) => /^[a-f0-9]{24}$/i.test(initialVisitId ?? '')
    ? api.execution(initialVisitId, { signal }) : Promise.resolve({ data: null }), [api, initialVisitId]);
  const linked = useApiResource(linkedLoad);
  const offerLoad = useCallback(({ signal }) => /^[a-f0-9]{24}$/i.test(initialOfferId ?? '') && api.offer
    ? api.offer(initialOfferId, { signal }) : Promise.resolve({ data: null }), [api, initialOfferId]);
  const linkedOffer = useApiResource(offerLoad);
  const command = useSchedulingCommand(() => {
    resource.retry();
    assignments.retry();
    if (historyOpen) history.retry();
    if (initialOfferId) linkedOffer.retry();
  });
  const locked = command.busy || command.pending;
  async function acceptOffer(row, key) {
    try {
      return await api.respond(row.id, 'acceptances', row.version, key);
    } catch (error) {
      if (error.code === 'VISIT_ALREADY_ASSIGNED') resource.retry();
      throw error;
    }
  }
  function withdrawalSaved(result) {
    setWithdrawalResult(result.mode === 'EARLY' ? VISIT_WITHDRAWAL_MESSAGES.MSG57(result.startAt) : VISIT_WITHDRAWAL_MESSAGES.MSG56);
    setWithdrawalVisit(null);
    resource.retry();
    assignments.retry();
    setSelected(null);
  }
  function pager(data, pages, setPages, label) {
    if (!pages.length && !data.data?.nextCursor) return null;
    return <CursorPagination page={pages.length + 1} label={label} hasNext={Boolean(data.data?.nextCursor)} onFirst={() => setPages([])} onPrevious={() => setPages(rows => rows.slice(0, -1))} onNext={() => setPages(rows => [...rows, data.data.nextCursor])} previousDisabled={!pages.length || data.status === 'loading'} nextDisabled={!data.data?.nextCursor || data.status !== 'success'} previousLabel={'Trang ' + label + ' trước'} nextLabel={'Trang ' + label + ' sau'} />;
  }
  function offerActions(row) {
    if (row.state !== 'PENDING' || !row.canRespond) return null;
    return <div className="sitter-offer-actions">
      <Button className="sitter-offer-actions__accept" disabled={locked} onClick={() => command.execute(key => acceptOffer(row, key))}>
        <Check size={18} aria-hidden="true" />Nhận việc
      </Button>
      <Button variant="secondary" className="sitter-offer-actions__decline" disabled={locked}
        onClick={() => command.execute(key => api.respond(row.id, 'declines', row.version, key))}>Từ chối</Button>
    </div>;
  }
  const baseColumns = [{
    key: 'service',
    label: 'Ca chăm sóc',
    render: row => <strong>{title(row)}</strong>
  }, {
    key: 'time',
    label: 'Ngày giờ',
    render: row => <>{time(row.startAt)}<small>Đến {time(row.endAt)}</small></>
  }, {
    key: 'area',
    label: 'Khu vực',
    render: sitterAreaLabel
  }, {
    key: 'state',
    label: 'Trạng thái',
    render: row => <OperationsBadge>{row.state === 'PENDING' && !row.canRespond ? 'Hết hạn' : states[row.state] ?? 'Đang cập nhật'}</OperationsBadge>
  }];
  const offerRows = (resource.data?.items ?? []).filter(row => row.state === 'PENDING');
  const active = selected?.kind === 'linkedOffer' ? linkedOffer.data ?? null : selected?.kind === 'linked' ? linked.data ? { ...linked.data, id: linked.data.visitId } : null
    : (selected && (selected.kind === 'assignment' ? assignments.data?.items : selected.kind === 'history' ? history.data?.items : resource.data?.items)?.find(row => row.id === selected.row.id)) ?? selected?.row;
  return <section className="employee-scheduling employee-invitations sitter-workspace">
    {selected?.kind === 'linked' && linked.status === 'loading' && <p role="status">Đang mở buổi từ thông báo…</p>}
    {selected?.kind === 'linked' && ['error', 'forbidden'].includes(linked.status) && <p role="alert">Không thể mở buổi từ thông báo. <Button onClick={linked.retry}>Thử lại</Button></p>}
    {selected?.kind === 'linkedOffer' && linkedOffer.status === 'loading' && <p role="status">Đang tải lời mời…</p>}
    {selected?.kind === 'linkedOffer' && ['error','forbidden','empty'].includes(linkedOffer.status) &&
      <p role="alert">Không tìm được lời mời này. <Button onClick={linkedOffer.retry}>Thử lại</Button> <Button onClick={onCloseOffer}>Xem danh sách</Button></p>}
    <header><div><h1 data-duplicate-title>Lời mời nhận việc</h1><p>Xem ca và hạn phản hồi trước khi nhận việc.</p></div><Button variant="ghost" aria-label="Tải lại lời mời" className="sitter-workspace__refresh" onClick={() => {
        resource.retry();
        assignments.retry();
        if (historyOpen) history.retry();
      }}><RefreshCw size={18} aria-hidden="true" /><span>Tải lại</span></Button></header>
    {command.message && <p role="status">{command.message}</p>}{command.pending && <Button disabled={command.busy} onClick={command.retry}>Kiểm tra lại yêu cầu</Button>}
    <h2>Lời mời đang chờ</h2><ListStatus resource={resource} name="lời mời" />
    {['success', 'empty'].includes(resource.status) && !offerRows.length && <CompactEmpty icon={ClipboardList} title="Chưa có lời mời đang chờ">
      Lời mời mới sẽ xuất hiện ở đây khi bạn được mời nhận ca.
    </CompactEmpty>}
    {resource.status === 'success' && offerRows.length > 0 && <OperationsTable label="Lời mời đang chờ" rows={offerRows} empty="Chưa có lời mời đang chờ phản hồi." columns={[...baseColumns, {
      key: 'deadline',
      label: 'Hạn phản hồi',
      render: row => time(row.deadline)
    }, {
      key: 'actions',
      label: 'Thao tác',
      render: row => <div className="sitter-offer-card__controls">
        <Button variant="ghost" className="sitter-offer-card__details" onClick={() => setSelected({ kind: 'offer', row })}>
          Xem chi tiết <ChevronRight size={17} aria-hidden="true" />
        </Button>
        {offerActions(row)}
      </div>
    }]} />}
    {pager(resource, offerPages, setOfferPages, 'lời mời')}
    <h2>Ca đã nhận</h2><CompactRow icon={CalendarDays} to="/sitter/schedule">Xem lịch ca làm</CompactRow>{withdrawalResult && <p role="status">{withdrawalResult}</p>}<ListStatus resource={assignments} name="ca đã nhận" />
    {['success', 'empty'].includes(assignments.status) && !assignments.data?.items?.length && <p className="sitter-workspace__empty-note">Chưa có ca đã nhận.</p>}
    {assignments.status === 'success' && assignments.data?.items?.length > 0 && <OperationsTable label="Ca đã nhận" rows={assignments.data?.items ?? []} empty="Chưa có ca đã nhận." columns={[...baseColumns, {
      key: 'actions',
      label: 'Thao tác',
      render: row => <div className="employee-scheduling__actions"><Link className="sitter-workspace-link" to={'/sitter/visits/' + row.id} state={{ mobileBack: '/sitter/invitations' }}>Xem chi tiết</Link>{row.canWithdraw && <Button variant="ghost" disabled={locked} onClick={() => {
          setWithdrawalResult(null);
          setWithdrawalVisit(row.id);
        }}>Rút khỏi buổi</Button>}</div>
    }]} />}
    {pager(assignments, assignmentPages, setAssignmentPages, 'ca')}
    <details onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>Lịch sử lời mời</summary>
      {historyOpen && <><ListStatus resource={history} name="lịch sử lời mời" />
        {['success', 'empty'].includes(history.status) && <OperationsTable label="Lịch sử lời mời" rows={(history.data?.items ?? []).filter(row => row.state !== 'PENDING')} empty="Chưa có lịch sử lời mời ở trang này." columns={[...baseColumns, {
          key: 'actions',
          label: 'Thao tác',
          render: row => <Button variant="secondary" onClick={() => setSelected({
            kind: 'history',
            row
          })}>Xem chi tiết</Button>
        }]} />}{pager(history, historyPages, setHistoryPages, 'lịch sử')}</>}
    </details>
    <Dialog open={Boolean(active)} title={active ? title(active) : 'Chi tiết ca chăm sóc'} onClose={() => { if (selected?.kind === 'linkedOffer') onCloseOffer?.(); setSelected(null); }} className="employee-assignment-dialog" dismissible={!locked}>
      {active && <><p>{time(active.startAt)} – {time(active.endAt)}</p><p>{states[active.state] ?? 'Đang cập nhật'} · {sitterAreaLabel(active)}</p>
        {['assignment', 'linked'].includes(selected.kind) ? <>{active.serviceAddress && <p>{active.serviceAddress}</p>}{googleMapsDirections(active.serviceAddress) && <a href={googleMapsDirections(active.serviceAddress)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Chỉ đường bằng Google Maps</a>}
          {active.state === 'ASSIGNED' && <VisitTravel api={api} visitId={active.id} employee startAt={active.startAt} endAt={active.endAt} />}
          {['ASSIGNED', 'IN_PROGRESS'].includes(active.state) && <AssignedCare api={api} visitId={active.id} />}
          {api.execution && <VisitExecution key={active.id} api={api} visitId={active.id} onChanged={assignments.retry} />}
        </> : <>{active.state === 'PENDING' && <p>Hạn phản hồi: {time(active.deadline)}</p>}{offerActions(active)}</>}
      </>}
    </Dialog>
    {withdrawalVisit && <VisitWithdrawalDialog visitId={withdrawalVisit} api={api} onClose={() => setWithdrawalVisit(null)} onSuccess={withdrawalSaved} />}
  </section>;
}

function ListStatus({ resource, name }) {
  if (resource.status === 'loading') return <p role="status">Đang tải {name}…</p>;
  if (['error', 'forbidden', 'pending'].includes(resource.status)) return <p role="alert">
    Chưa tải được {name}. <Button onClick={resource.retry}>Thử lại</Button>
  </p>;
  return null;
}
