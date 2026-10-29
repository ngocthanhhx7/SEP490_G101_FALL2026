import { useCallback, useState } from 'react';
import { Check, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button } from '../../components/ui/index.js';
import { googleMapsDirections } from '../../utils/maps.js';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';
import '../../styles/employee-scheduling.css';

const time = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const states = { PENDING: 'Chờ phản hồi', ACCEPTED: 'Đã nhận', DECLINED: 'Đã từ chối', EXPIRED: 'Hết hạn', REVOKED: 'Đã thu hồi' };
export function EmployeeInvitationsPage({ api }) {
  const [offerPages, setOfferPages] = useState([]), [assignmentPages, setAssignmentPages] = useState([]);
  const offerCursor = offerPages.at(-1), assignmentCursor = assignmentPages.at(-1);
  const load = useCallback(({ signal }) => api.offers({ signal, cursor: offerCursor }), [api, offerCursor]);
  const assignmentsLoad = useCallback(({ signal }) => api.assignments({ signal, cursor: assignmentCursor }), [api, assignmentCursor]);
  const resource = useApiResource(load), assignments = useApiResource(assignmentsLoad);
  const command = useSchedulingCommand(() => { resource.retry(); assignments.retry(); });
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
    <nav className="employee-scheduling__actions" aria-label="Trang lời mời">
      <Button variant="ghost" aria-label="Trang lời mời trước" title="Trang lời mời trước" disabled={!offerPages.length || resource.status === 'loading'} onClick={() => setOfferPages(rows => rows.slice(0, -1))}><ChevronLeft size={18} /></Button>
      <Button variant="ghost" aria-label="Trang lời mời sau" title="Trang lời mời sau" disabled={!resource.data?.nextCursor || resource.status !== 'success'} onClick={() => setOfferPages(rows => [...rows, resource.data.nextCursor])}><ChevronRight size={18} /></Button>
    </nav>
    <h2>Ca đã nhận</h2>
    {assignments.status === 'loading' && <p role="status">Đang tải ca đã nhận…</p>}
    {['error', 'forbidden'].includes(assignments.status) && <p role="alert">Chưa tải được ca đã nhận.</p>}
    {assignments.status === 'success' && !assignments.data.items.length && <p>Chưa có ca đã nhận.</p>}
    <ul className="employee-scheduling__rows">{(assignments.data?.items || []).map(row => <li key={row.id}><div><h3>{row.serviceName}</h3><p>{time(row.startAt)} – {time(row.endAt)}</p>
      {row.serviceAddress && <p>{row.serviceAddress}</p>}
      {googleMapsDirections(row.serviceAddress) && <a href={googleMapsDirections(row.serviceAddress)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Chỉ đường bằng Google Maps</a>}
      <VisitTravel api={api} visitId={row.id} employee startAt={row.startAt} endAt={row.endAt} />
    </div></li>)}</ul>
    <nav className="employee-scheduling__actions" aria-label="Trang ca đã nhận">
      <Button variant="ghost" aria-label="Trang ca trước" title="Trang ca trước" disabled={!assignmentPages.length || assignments.status === 'loading'} onClick={() => setAssignmentPages(rows => rows.slice(0, -1))}><ChevronLeft size={18} /></Button>
      <Button variant="ghost" aria-label="Trang ca sau" title="Trang ca sau" disabled={!assignments.data?.nextCursor || assignments.status !== 'success'} onClick={() => setAssignmentPages(rows => [...rows, assignments.data.nextCursor])}><ChevronRight size={18} /></Button>
    </nav>
  </section>;
}
