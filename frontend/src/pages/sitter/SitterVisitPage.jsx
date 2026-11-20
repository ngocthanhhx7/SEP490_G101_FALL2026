import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';
import { AssignedCare } from './AssignedCare.jsx';
import { VisitExecution } from './VisitExecution.jsx';
import { VisitWithdrawalDialog } from './VisitWithdrawalDialog.jsx';
import { Button } from '../../components/ui/index.js';

export function SitterVisitPage({ api, visitId }) {
  const load = useCallback(({ signal }) => api.execution(visitId, { signal }), [api, visitId]);
  const visit = useApiResource(load);
  const [withdrawal, setWithdrawal] = useState(false);
  const row = visit.data;
  if (visit.status === 'loading') return <p role="status">Đang tải buổi chăm sóc…</p>;
  if (!row) return <section className="pwc-mobile-screen">
    <h1>Chưa mở được buổi chăm sóc</h1>
    <p role="status">{visit.httpStatus === 404 || visit.status === 'forbidden'
      ? 'Buổi không còn khả dụng với tài khoản này.' : 'Máy chủ chưa trả dữ liệu buổi.'}</p>
    <Button onClick={visit.retry}>Thử lại</Button> <Link to="/sitter/schedule">Về ca làm</Link>
  </section>;

  return <section className="employee-scheduling pwc-mobile-screen">
    <h1>{row.serviceName || 'Buổi chăm sóc'}</h1>
    <p>{new Date(row.startAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · Giờ Việt Nam</p>
    {['ASSIGNED','IN_PROGRESS'].includes(row.state) && <AssignedCare api={api} visitId={visitId} />}
    <VisitTravel api={api} visitId={visitId} employee startAt={row.startAt} endAt={row.endAt} />
    <VisitExecution api={api} visitId={visitId} onChanged={visit.retry} />
    {row.state === 'ASSIGNED' && <Button variant="secondary" onClick={() => setWithdrawal(true)}>Kiểm tra điều kiện rút khỏi buổi</Button>}
    {withdrawal && <VisitWithdrawalDialog visitId={visitId} api={api} onClose={() => setWithdrawal(false)}
      onSuccess={() => { setWithdrawal(false); visit.retry(); }} />}
  </section>;
}
