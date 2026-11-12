import { CursorPagination } from '../../components/ui/Pagination.jsx';
import { useCallback, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button } from '../../components/ui/index.js';
import { googleMapsDirections } from '../../utils/maps.js';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';
import { AssignedCare } from './AssignedCare.jsx';
import { VisitWithdrawalDialog } from './VisitWithdrawalDialog.jsx';
import { VISIT_WITHDRAWAL_MESSAGES } from '../../constants/visit-withdrawal-messages.js';
import { VisitExecution } from './VisitExecution.jsx';
import '../../styles/employee-scheduling.css';

const time = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const states = { PENDING: 'Chờ phản hồi', ACCEPTED: 'Đã nhận', DECLINED: 'Đã từ chối', EXPIRED: 'Hết hạn', REVOKED: 'Đã thu hồi' };
export function EmployeeInvitationsPage({ api }) {
  const [offerPages, setOfferPages] = useState([]), [assignmentPages, setAssignmentPages] = useState([]);
  const [withdrawalVisit, setWithdrawalVisit] = useState(null);
  const [withdrawalResult, setWithdrawalResult] = useState(null);
  const offerCursor = offerPages.at(-1), assignmentCursor = assignmentPages.at(-1);
  const load = useCallback(({ signal }) => api.offers({ signal, cursor: offerCursor }), [api, offerCursor]);
  const assignmentsLoad = useCallback(({ signal }) => api.assignments({ signal, cursor: assignmentCursor }), [api, assignmentCursor]);
  const resource = useApiResource(load), assignments = useApiResource(assignmentsLoad);
  const command = useSchedulingCommand(() => { resource.retry(); assignments.retry(); });
  function withdrawalSaved(result) {
    setWithdrawalResult(result.mode === 'EARLY' ? VISIT_WITHDRAWAL_MESSAGES.MSG57(result.startAt) : VISIT_WITHDRAWAL_MESSAGES.MSG56);
    setWithdrawalVisit(null);
    resource.retry();
    assignments.retry();
  }
  return <section className="employee-scheduling">
    <header><h1>Lời mời nhận việc</h1><Button variant="ghost" title="Tải lại lời mời" aria-label="Tải lại lời mời" onClick={() => { resource.retry(); assignments.retry(); }}><RefreshCw size={18} /></Button></header>
    {resource.status === 'loading' && <p role="status">Đang tải lời mời…</p>}
    {['error', 'forbidden'].includes(resource.status) && <p role="alert">Chưa tải được lời mời của bạn.</p>}
    {command.message && <p role="status">{command.message}</p>}
    {command.pending && <Button disabled={command.busy} onClick={command.retry}>Kiểm tra lại yêu cầu</Button>}
    {resource.status === 'success' && !resource.data.items.length && <p>Chưa có lời mời.</p>}
    <ul className="employee-scheduling__rows">{(resource.data?.items || []).map(row => <li key={row.id}>
      <div><h2>{row.serviceName}</h2><p>{time(row.startAt)} – {time(row.endAt)}</p><p>{row.areaCode} · {row.pets.map(pet => pet.name).join(', ')}</p>
        <p>{row.state === 'PENDING' && !row.canRespond ? 'Hết hạn' : states[row.state]} · Hạn phản hồi: {time(row.deadline)}</p></div>
      {row.canRespond && <div className="employee-scheduling__actions">
        <Button disabled={command.busy || command.pending} onClick={() => command.execute(key => api.respond(row.id, 'acceptances', row.version, key))}><Check size={18} />Nhận việc</Button>
        <Button variant="secondary" disabled={command.busy || command.pending} onClick={() => command.execute(key => api.respond(row.id, 'declines', row.version, key))}><X size={18} />Từ chối</Button>
      </div>}
    </li>)}</ul>
    <CursorPagination page={offerPages.length + 1} label="lời mời" hasNext onFirst={() => setOfferPages([])}
 onPrevious={() => setOfferPages(rows => rows.slice(0, -1))} onNext={() => setOfferPages(rows => [...rows, resource.data.nextCursor])}
 previousDisabled={!offerPages.length || resource.status === 'loading'} nextDisabled={!resource.data?.nextCursor || resource.status !== 'success'}
 previousLabel={"Trang lời mời trước"} nextLabel={"Trang lời mời sau"} />
    <h2>Ca đã nhận</h2>
    {withdrawalResult && <p className="employee-scheduling__withdrawal-result" role="status">{withdrawalResult}</p>}
    {assignments.status === 'loading' && <p role="status">Đang tải ca đã nhận…</p>}
    {['error', 'forbidden'].includes(assignments.status) && <p role="alert">Chưa tải được ca đã nhận.</p>}
    {assignments.status === 'success' && !assignments.data.items.length && <p>Chưa có ca đã nhận.</p>}
    <ul className="employee-scheduling__rows">{(assignments.data?.items || []).map(row => <li key={row.id}><div><h3>{row.serviceName}</h3><p>{time(row.startAt)} – {time(row.endAt)}</p>
      <p>{({ ASSIGNED: 'Đã nhận ca', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Đã hoàn thành' })[row.state] ?? row.state}</p>
      {row.serviceAddress && <p>{row.serviceAddress}</p>}
      {googleMapsDirections(row.serviceAddress) && <a href={googleMapsDirections(row.serviceAddress)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Chỉ đường bằng Google Maps</a>}
      <VisitTravel api={api} visitId={row.id} employee startAt={row.startAt} endAt={row.endAt} />
      {['ASSIGNED', 'IN_PROGRESS'].includes(row.state) && <AssignedCare api={api} visitId={row.id} />}
      {api.execution && <VisitExecution api={api} visitId={row.id} onChanged={assignments.retry} />}
    </div>{row.canWithdraw && <Button variant="secondary" disabled={command.busy || command.pending}
      onClick={() => { setWithdrawalResult(null); setWithdrawalVisit(row.id); }}>Rút khỏi buổi</Button>}</li>)}</ul>
    <CursorPagination page={assignmentPages.length + 1} label="ca đã nhận" hasNext onFirst={() => setAssignmentPages([])}
 onPrevious={() => setAssignmentPages(rows => rows.slice(0, -1))} onNext={() => setAssignmentPages(rows => [...rows, assignments.data.nextCursor])}
 previousDisabled={!assignmentPages.length || assignments.status === 'loading'} nextDisabled={!assignments.data?.nextCursor || assignments.status !== 'success'}
 previousLabel={"Trang ca trước"} nextLabel={"Trang ca sau"} />
    {withdrawalVisit && <VisitWithdrawalDialog visitId={withdrawalVisit} api={api}
      onClose={() => setWithdrawalVisit(null)} onSuccess={withdrawalSaved} />}
  </section>;
}
