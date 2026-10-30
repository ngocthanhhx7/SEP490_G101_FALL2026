import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Send } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button } from '../../components/ui/index.js';
import { StaffTravelMonitor } from './StaffTravelMonitor.jsx';
import '../../styles/employee-scheduling.css';

const time = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const reviewLabel = code => ({
  NO_ELIGIBLE_SITTER: 'Chưa có người chăm sóc đủ điều kiện nhận ca.',
  STAFF_REVIEW_REQUIRED: 'Các lời mời đã bị từ chối hoặc hết hạn.',
  DIRECTED_SCHEDULE_REVIEW_REQUIRED: 'Người được khách chỉ định chưa thể nhận ca.',
  TRAVEL_REVIEW_REQUIRED: 'Cần xác minh khả năng di chuyển.',
  DAY_ORIGIN_MISSING: 'Chưa có điểm xuất phát cho ngày làm việc.',
  DISPATCH_SEARCH_LIMIT: 'Số lượng hồ sơ vượt giới hạn tìm tự động. Cần điều phối kiểm tra.',
  SHIFT_START_REACHED: 'Đã đến giờ nhưng chưa có người nhận ca. Cần liên hệ khách để sắp xếp lại.'
}[code] ?? 'Cần kiểm tra và sắp xếp người nhận ca.');
export function EmployeeDispatchPage({ api, selectedSitter }) {
  const validSelection = !selectedSitter || /^[a-f0-9]{24}$/i.test(selectedSitter);
  const load = useCallback(({ signal }) => api.queue({ signal }), [api]);
  const queue = useApiResource(load);
  const [proposal, setProposal] = useState(null);
  const command = useSchedulingCommand(() => queue.retry());
  return <section className="employee-scheduling">
    <header><h1>Điều phối ca chăm sóc</h1><Button variant="ghost" title="Tải lại lịch điều phối" aria-label="Tải lại lịch điều phối" onClick={queue.retry}><RefreshCw size={18} /></Button></header>
    {selectedSitter && <p>{validSelection ? <>Người chăm sóc đã chọn: <Link to={'/staff/sitters/' + selectedSitter}>{selectedSitter}</Link></> : 'Mã người chăm sóc không hợp lệ.'} · <Link to="/staff/dispatch">Bỏ chọn</Link></p>}
    {command.message && <p role="status">{command.message}</p>}
    {command.pending && <Button disabled={command.busy} onClick={command.retry}>Kiểm tra lại yêu cầu</Button>}
    {proposal && <p>Đề xuất chờ khách xác nhận: <Link to={`/account/schedule-proposals/${proposal.id}`}>{proposal.id}</Link></p>}
    <h2>Ca cần điều phối</h2>
    {queue.status === 'loading' && <p role="status">Đang tải ca…</p>}
    {['error', 'forbidden'].includes(queue.status) && <p role="alert">Chưa tải được các ca cần điều phối.</p>}
    {queue.status === 'success' && !queue.data.items.length && <p>Chưa có ca chờ điều phối.</p>}
    <ul className="employee-scheduling__rows">{(queue.data?.items || []).map(row => <li key={row.id}>
      <div><h3>{row.serviceName}</h3><p>{time(row.startAt)} – {time(row.endAt)}</p><p>{row.areaCode}</p>
        {row.reviewCode && <p role="status">{reviewLabel(row.reviewCode)}</p>}
        {row.requestedSitterId && <><p>Khách chỉ định: {row.requestedSitterId}</p>{row.dispatchState === 'NEEDS_STAFF' && <details><summary>Đề xuất lịch khác</summary>
          <form onSubmit={event => {
            event.preventDefault(); const data = new window.FormData(event.currentTarget);
            const body = { expectedVersion: row.version, startAt: `${data.get('startAt')}:00+07:00` };
            command.execute(async key => { const result = await api.propose(row.id, body, key); setProposal(result.data); return result; });
          }}>
            <label>Bắt đầu đề xuất<input type="datetime-local" name="startAt" required disabled={command.busy || command.pending} /></label>
            <Button type="submit" disabled={command.busy || command.pending}><Send size={18} />Lập đề xuất</Button>
          </form>
        </details>}</>}</div>
      {row.pendingInvitation ? <p>{row.pendingInvitationCount ?? 1} lời mời đang chờ phản hồi · {time(row.pendingInvitation.deadline)}</p> : row.dispatchState === 'NEEDS_STAFF' ?
        <Button disabled={command.busy || command.pending || !validSelection || Boolean(selectedSitter && row.requestedSitterId && row.requestedSitterId !== selectedSitter)}
          onClick={() => command.execute(key => api.invite(row.id, row.version, key, selectedSitter || undefined))}><Send size={18} />{selectedSitter ? 'Mời người đã chọn' : 'Thử tìm lại'}</Button> : <p>Hệ thống đang tìm người nhận ca</p>}
    </li>)}</ul>
    {api.travelVisits && <StaffTravelMonitor api={api} />}
  </section>;
}
