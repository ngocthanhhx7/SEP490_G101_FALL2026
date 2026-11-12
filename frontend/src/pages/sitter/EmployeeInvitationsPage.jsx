import { CursorPagination } from '../../components/ui/Pagination.jsx';
import { useCallback, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button, Dialog } from '../../components/ui/index.js';
import { OperationsTable, OperationsBadge } from '../../components/common/OperationsWorkspace.jsx';
import { googleMapsDirections } from '../../utils/maps.js';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';
import { AssignedCare } from './AssignedCare.jsx';
import { VisitWithdrawalDialog } from './VisitWithdrawalDialog.jsx';
import { VISIT_WITHDRAWAL_MESSAGES } from '../../constants/visit-withdrawal-messages.js';
import { VisitExecution } from './VisitExecution.jsx';
import '../../styles/employee-scheduling.css';
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
  api
}) {
  const [offerPages, setOfferPages] = useState([]),
    [assignmentPages, setAssignmentPages] = useState([]),
    [historyPages, setHistoryPages] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false),
    [selected, setSelected] = useState(null),
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
  const command = useSchedulingCommand(() => {
    resource.retry();
    assignments.retry();
    if (historyOpen) history.retry();
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
    return <CursorPagination page={pages.length + 1} label={label} hasNext onFirst={() => setPages([])} onPrevious={() => setPages(rows => rows.slice(0, -1))} onNext={() => setPages(rows => [...rows, data.data.nextCursor])} previousDisabled={!pages.length || data.status === 'loading'} nextDisabled={!data.data?.nextCursor || data.status !== 'success'} previousLabel={'Trang ' + label + ' trước'} nextLabel={'Trang ' + label + ' sau'} />;
  }
  function offerActions(row) {
    return row.state === 'PENDING' && row.canRespond ? <div className="employee-scheduling__actions"><Button disabled={locked} onClick={() => command.execute(key => acceptOffer(row, key))}><Check size={16} />Nhận việc</Button><Button variant="secondary" disabled={locked} onClick={() => command.execute(key => api.respond(row.id, 'declines', row.version, key))}><X size={16} />Từ chối</Button></div> : null;
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
    render: row => row.areaLabel ?? row.areaCode
  }, {
    key: 'state',
    label: 'Trạng thái',
    render: row => <OperationsBadge>{row.state === 'PENDING' && !row.canRespond ? 'Hết hạn' : states[row.state] ?? 'Đang cập nhật'}</OperationsBadge>
  }];
  const offerRows = (resource.data?.items ?? []).filter(row => row.state === 'PENDING');
  const active = (selected && (selected.kind === 'assignment' ? assignments.data?.items : selected.kind === 'history' ? history.data?.items : resource.data?.items)?.find(row => row.id === selected.row.id)) ?? selected?.row;
  return <section className="employee-scheduling employee-invitations">
    <header><div><h1>Lời mời và ca chăm sóc</h1><p>Phản hồi lời mời, theo dõi ca đã nhận và mở chi tiết khi cần thực hiện.</p></div><Button variant="ghost" aria-label="Tải lại lời mời" onClick={() => {
        resource.retry();
        assignments.retry();
        if (historyOpen) history.retry();
      }}><RefreshCw size={18} /></Button></header>
    {command.message && <p role="status">{command.message}</p>}{command.pending && <Button disabled={command.busy} onClick={command.retry}>Kiểm tra lại yêu cầu</Button>}
    <h2>Lời mời đang chờ</h2>{resource.status === 'loading' && <p role="status">Đang tải lời mời…</p>}{['error', 'forbidden'].includes(resource.status) && <p role="alert">Chưa tải được lời mời của bạn.</p>}
    <OperationsTable label="Lời mời đang chờ" rows={offerRows} empty="Chưa có lời mời đang chờ phản hồi." columns={[...baseColumns, {
      key: 'deadline',
      label: 'Hạn phản hồi',
      render: row => time(row.deadline)
    }, {
      key: 'actions',
      label: 'Thao tác',
      render: row => <><Button variant="secondary" onClick={() => setSelected({
          kind: 'offer',
          row
        })}>Xem chi tiết</Button>{offerActions(row)}</>
    }]} />
    {pager(resource, offerPages, setOfferPages, 'lời mời')}
    <h2>Ca đã nhận</h2>{withdrawalResult && <p role="status">{withdrawalResult}</p>}{assignments.status === 'loading' && <p role="status">Đang tải ca đã nhận…</p>}{['error', 'forbidden'].includes(assignments.status) && <p role="alert">Chưa tải được ca đã nhận.</p>}
    <OperationsTable label="Ca đã nhận" rows={assignments.data?.items ?? []} empty="Chưa có ca đã nhận." columns={[...baseColumns, {
      key: 'actions',
      label: 'Thao tác',
      render: row => <div className="employee-scheduling__actions"><Button variant="secondary" onClick={() => setSelected({
          kind: 'assignment',
          row
        })}>Xem chi tiết</Button>{row.canWithdraw && <Button variant="ghost" disabled={locked} onClick={() => {
          setWithdrawalResult(null);
          setWithdrawalVisit(row.id);
        }}>Rút khỏi buổi</Button>}</div>
    }]} />
    {pager(assignments, assignmentPages, setAssignmentPages, 'ca')}
    <details onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>Lịch sử lời mời</summary>
      {historyOpen && <><OperationsTable label="Lịch sử lời mời" rows={(history.data?.items ?? []).filter(row => row.state !== 'PENDING')} empty="Chưa có lịch sử lời mời ở trang này." columns={[...baseColumns, {
          key: 'actions',
          label: 'Thao tác',
          render: row => <Button variant="secondary" onClick={() => setSelected({
            kind: 'history',
            row
          })}>Xem chi tiết</Button>
        }]} />{pager(history, historyPages, setHistoryPages, 'lịch sử')}</>}
    </details>
    <Dialog open={Boolean(active)} title={active ? title(active) : 'Chi tiết ca chăm sóc'} onClose={() => setSelected(null)} className="employee-assignment-dialog" dismissible={!locked}>
      {active && <><p>{time(active.startAt)} – {time(active.endAt)}</p><p>{states[active.state] ?? 'Đang cập nhật'} · {active.areaLabel ?? active.areaCode}</p>
        {selected.kind === 'assignment' ? <>{active.serviceAddress && <p>{active.serviceAddress}</p>}{googleMapsDirections(active.serviceAddress) && <a href={googleMapsDirections(active.serviceAddress)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Chỉ đường bằng Google Maps</a>}
          <VisitTravel api={api} visitId={active.id} employee startAt={active.startAt} endAt={active.endAt} />
          {['ASSIGNED', 'IN_PROGRESS'].includes(active.state) && <AssignedCare api={api} visitId={active.id} />}
          {api.execution && <VisitExecution key={active.id} api={api} visitId={active.id} onChanged={assignments.retry} />}
        </> : <>{active.state === 'PENDING' && <p>Hạn phản hồi: {time(active.deadline)}</p>}{offerActions(active)}</>}
      </>}
    </Dialog>
    {withdrawalVisit && <VisitWithdrawalDialog visitId={withdrawalVisit} api={api} onClose={() => setWithdrawalVisit(null)} onSuccess={withdrawalSaved} />}
  </section>;
}
