import { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button } from '../../components/ui/index.js';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';

export function StaffTravelMonitor({ api }) {
  const [pages, setPages] = useState([]), cursor = pages.at(-1);
  const load = useCallback(({ signal }) => api.travelVisits({ cursor, signal }), [api, cursor]);
  const resource = useApiResource(load);
  return <section><header><h2>Ca đang đến điểm chăm sóc</h2>
    <Button variant="ghost" title="Tải lại ca di chuyển" aria-label="Tải lại ca di chuyển" onClick={resource.retry}><RefreshCw size={18} /></Button></header>
    {resource.status === 'loading' && <p role="status">Đang tải hành trình…</p>}
    {['error', 'forbidden', 'pending'].includes(resource.status) && <p role="status">Chưa tải được các ca di chuyển.</p>}
    {resource.status === 'success' && !resource.data.items.length && <p>Chưa có ca trong thời gian di chuyển.</p>}
    <ul className="employee-scheduling__rows">{(resource.data?.items || []).map(row => <li key={row.id}><div>
      <h3>{row.serviceName}</h3><p>{row.areaCode} · {new Date(row.startAt).toLocaleString('vi-VN')}</p>
      <p>Nhân viên: {row.sitterName || row.sitterId}</p><VisitTravel api={api} visitId={row.id} startAt={row.startAt} endAt={row.endAt} />
    </div></li>)}</ul>
    <nav className="employee-scheduling__actions" aria-label="Trang ca di chuyển">
      <Button variant="ghost" title="Trang ca di chuyển trước" aria-label="Trang ca di chuyển trước" disabled={!pages.length || resource.status === 'loading'} onClick={() => setPages(rows => rows.slice(0, -1))}><ChevronLeft size={18} /></Button>
      <Button variant="ghost" title="Trang ca di chuyển sau" aria-label="Trang ca di chuyển sau" disabled={!resource.data?.nextCursor || resource.status !== 'success'} onClick={() => setPages(rows => [...rows, resource.data.nextCursor])}><ChevronRight size={18} /></Button>
    </nav>
  </section>;
}
