import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Eye, RefreshCw, Send } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button } from '../../components/ui/index.js';
import { StaffTravelMonitor } from './StaffTravelMonitor.jsx';
import '../../styles/employee-scheduling.css';

const time = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
export function EmployeeDispatchPage({ api, selectedSitter }) {
  const validSelection = !selectedSitter || /^[a-f0-9]{24}$/i.test(selectedSitter);
  const load = useCallback(({ signal }) => api.queue({ signal }), [api]);
  const plansLoad = useCallback(({ signal }) => api.plans({ signal }), [api]);
  const queue = useApiResource(load), plans = useApiResource(plansLoad), [preview, setPreview] = useState(null);
  const [shiftMinutes, setShiftMinutes] = useState(480);
  const [proposal, setProposal] = useState(null);
  const command = useSchedulingCommand(() => { queue.retry(); plans.retry(); });
  const planInput = row => ({ expectedVersion: row.version, shiftMinutes });
  return <section className="employee-scheduling">
    <header><h1>Điều phối ca chăm sóc</h1><Button variant="ghost" title="Tải lại lịch điều phối" aria-label="Tải lại lịch điều phối" onClick={() => { queue.retry(); plans.retry(); }}><RefreshCw size={18} /></Button></header>
    {selectedSitter && <p>{validSelection ? <>Người chăm sóc đã chọn: <Link to={'/staff/sitters/' + selectedSitter}>{selectedSitter}</Link></> : 'Mã người chăm sóc không hợp lệ.'} · <Link to="/staff/dispatch">Bỏ chọn</Link></p>}
    {command.message && <p role="status">{command.message}</p>}
    {command.pending && <Button disabled={command.busy} onClick={command.retry}>Kiểm tra lại yêu cầu</Button>}
    {proposal && <p>Đề xuất chờ khách xác nhận: <Link to={`/account/schedule-proposals/${proposal.id}`}>{proposal.id}</Link></p>}
    <h2>Kế hoạch cần xác nhận</h2>
    <label>Độ dài ca lưu trú (phút)<input type="number" min="60" max="480" step="1" value={shiftMinutes}
      disabled={command.busy || command.pending} onChange={event => { setPreview(null); setShiftMinutes(Number(event.target.value)); }} /></label>
    {plans.status === 'loading' && <p role="status">Đang tải kế hoạch…</p>}
    {['error', 'forbidden'].includes(plans.status) && <p role="alert">Chưa tải được kế hoạch chăm sóc.</p>}
    <ul className="employee-scheduling__rows">{(plans.data?.items || []).map(row => <li key={row.id}>
      <div><h3>Đơn {row.id}</h3><p>{row.customerVisitCount} lượt dịch vụ · {row.paymentState === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}</p></div>
      <Button variant="secondary" disabled={command.busy || command.pending || shiftMinutes < 60 || shiftMinutes > 480 || !Number.isInteger(shiftMinutes)}
        onClick={() => command.execute(async () => { const result = await api.preview(row.id, planInput(row)); setPreview({ ...result.data, input: planInput(row) }); return result; })}><Eye size={18} />Xem ca</Button>
    </li>)}</ul>
    {preview && <section className="employee-scheduling__preview"><h3>Ca của đơn {preview.bookingId}</h3>
      <ol>{preview.shifts.map(row => <li key={row.sequence}>{row.serviceName} · {time(row.startAt)} – {time(row.endAt)}</li>)}</ol>
      <Button disabled={command.busy || command.pending} onClick={() => command.execute(async key => {
        const result = await api.finalize(preview.bookingId, preview.input, key); setPreview(null); return result;
      })}><Check size={18} />Xác nhận kế hoạch</Button>
    </section>}
    <h2>Ca chờ gửi lời mời</h2>
    {queue.status === 'loading' && <p role="status">Đang tải ca…</p>}
    {['error', 'forbidden'].includes(queue.status) && <p role="alert">Chưa tải được các ca cần điều phối.</p>}
    {queue.status === 'success' && !queue.data.items.length && <p>Chưa có ca chờ điều phối.</p>}
    <ul className="employee-scheduling__rows">{(queue.data?.items || []).map(row => <li key={row.id}>
      <div><h3>{row.serviceName}</h3><p>{time(row.startAt)} – {time(row.endAt)}</p><p>{row.areaCode}</p>
        {row.requestedSitterId && <><p>Khách chỉ định: {row.requestedSitterId}</p><details><summary>Đề xuất lịch khác</summary>
          <form onSubmit={event => {
            event.preventDefault(); const data = new window.FormData(event.currentTarget);
            const body = { expectedVersion: row.version, startAt: `${data.get('startAt')}:00+07:00` };
            command.execute(async key => { const result = await api.propose(row.id, body, key); setProposal(result.data); return result; });
          }}>
            <label>Bắt đầu đề xuất<input type="datetime-local" name="startAt" required disabled={command.busy || command.pending} /></label>
            <Button type="submit" disabled={command.busy || command.pending}><Send size={18} />Lập đề xuất</Button>
          </form>
        </details></>}</div>
      {row.pendingInvitation ? <p>Đang chờ phản hồi · {time(row.pendingInvitation.deadline)}</p> :
        <Button disabled={command.busy || command.pending || !validSelection || Boolean(selectedSitter && row.requestedSitterId && row.requestedSitterId !== selectedSitter)}
          onClick={() => command.execute(key => api.invite(row.id, row.version, key, selectedSitter || undefined))}><Send size={18} />{selectedSitter ? 'Mời người đã chọn' : 'Gửi lời mời'}</Button>}
    </li>)}</ul>
    {api.travelVisits && <StaffTravelMonitor api={api} />}
  </section>;
}
