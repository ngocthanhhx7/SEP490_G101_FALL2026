import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { googleMapsDirections } from '../../utils/maps.js';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';
import { AssignedCare } from './AssignedCare.jsx';
import { VisitExecution } from './VisitExecution.jsx';
import { VisitWithdrawalDialog } from './VisitWithdrawalDialog.jsx';
import { Button, Notice } from '../../components/ui/index.js';
import './sitter-workspace.css';

export function SitterVisitPage({ api, visitId }) {
  const load = useCallback(({ signal }) => api.assignedVisitSummary(visitId, { signal }), [api, visitId]);
  const visit = useApiResource(load);
  const [withdrawal, setWithdrawal] = useState(false);
  const [executionReloadKey, setExecutionReloadKey] = useState(0);
  const row = visit.data;
  if (visit.status === 'loading') return <p role="status">Đang tải buổi chăm sóc…</p>;
  if (!row) return <section className="pwc-mobile-screen">
    <h1>Chưa mở được buổi chăm sóc</h1>
    <p role="status">{visit.httpStatus === 404 || visit.status === 'forbidden'
      ? 'Buổi không còn khả dụng với tài khoản này.' : 'Máy chủ chưa trả dữ liệu buổi.'}</p>
    <Button onClick={visit.retry}>Thử lại</Button> <Link data-page-back to="/sitter/schedule">Về ca làm</Link>
  </section>;

  const directions = googleMapsDirections(row.serviceAddress);
  const service = row.serviceDisplayName?.trim() || row.serviceName?.trim();
  const place = { HOME: 'Tại nhà', FACILITY: 'Tại trung tâm', OUTDOOR: 'Ngoài trời' }[row.location];
  return <section className="employee-scheduling pwc-mobile-screen sitter-workspace">
    <div className="sitter-workspace__visit-summary"><h1>{service || 'Chưa rõ dịch vụ'}</h1>
    {place && <span className="sitter-visit-card__place">{place}</span>}
    <p>{new Date(row.startAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · Giờ Việt Nam</p>
    {row.serviceAddress && <p>{row.serviceAddress}</p>}
    {directions && <a href={directions} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="sitter-workspace-link">Chỉ đường bằng Google Maps</a>}</div>
    {row.handoverPending === true && <Notice state="warning" title="Bạn cần xác nhận bàn giao trước khi check-in."
      action={<Link className="sitter-workspace-link" to={'/sitter/visits/' + visitId + '/handover'}>Xác nhận bàn giao</Link>} />}
    {['ASSIGNED','IN_PROGRESS'].includes(row.state) && !row.handoverPending && (
      <AssignedCare api={api} visitId={visitId} defaultOpen onAcknowledged={() => setExecutionReloadKey(value => value + 1)} />
    )}
    {row.state === 'ASSIGNED' && <VisitTravel api={api} visitId={visitId} employee startAt={row.startAt} endAt={row.endAt} />}
    <p><Link to="/contact" state={{ helpFrom: '/sitter/visits/' + visitId }}>Hỗ trợ công việc</Link></p>
    <VisitExecution key={visitId + ':' + executionReloadKey} api={api} visitId={visitId} onChanged={visit.retry} />
    {row.state === 'ASSIGNED' && <Button variant="secondary" onClick={() => setWithdrawal(true)}>Kiểm tra điều kiện rút khỏi buổi</Button>}
    {withdrawal && <VisitWithdrawalDialog visitId={visitId} api={api} onClose={() => setWithdrawal(false)}
      onSuccess={() => { setWithdrawal(false); visit.retry(); }} />}
  </section>;
}
