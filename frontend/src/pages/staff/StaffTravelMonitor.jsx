import { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button } from '../../components/ui/index.js';
import { OperationsTable } from '../../components/common/OperationsWorkspace.jsx';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';

export function StaffTravelMonitor({ api }) {
  const [pages, setPages] = useState([]),
    cursor = pages.at(-1);
  const load = useCallback(({ signal }) => api.travelVisits({ cursor, signal }), [api, cursor]);
  const resource = useApiResource(load);
  return (
    <section className="ops-section">
      <header>
        <h2>Ca đang đến điểm chăm sóc</h2>
        <Button
          variant="ghost"
          title="Tải lại ca di chuyển"
          aria-label="Tải lại ca di chuyển"
          onClick={resource.retry}
        >
          <RefreshCw size={18} />
        </Button>
      </header>
      {resource.status === 'loading' && <p role="status">Đang tải hành trình…</p>}
      {['error', 'forbidden', 'pending'].includes(resource.status) && (
        <p role="status">Chưa tải được các ca di chuyển.</p>
      )}
      <OperationsTable
        label="Các ca đang di chuyển"
        rows={resource.data?.items ?? []}
        empty="Chưa có ca trong thời gian di chuyển."
        columns={[
          { key: 'serviceName', label: 'Dịch vụ' },
          { key: 'areaCode', label: 'Khu vực' },
          {
            key: 'startAt',
            label: 'Giờ bắt đầu',
            render: (row) => new Date(row.startAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          },
          { key: 'sitter', label: 'Người chăm sóc', render: (row) => row.sitterName || row.sitterId },
          {
            key: 'travel',
            label: 'Hành trình',
            render: (row) => (
              <details>
                <summary>Xem hành trình</summary>
                <VisitTravel api={api} visitId={row.id} startAt={row.startAt} endAt={row.endAt} />
              </details>
            ),
          },
        ]}
      />
      <nav className="employee-scheduling__actions" aria-label="Trang ca di chuyển">
        <Button
          variant="ghost"
          title="Trang ca di chuyển trước"
          aria-label="Trang ca di chuyển trước"
          disabled={!pages.length || resource.status === 'loading'}
          onClick={() => setPages((rows) => rows.slice(0, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <Button
          variant="ghost"
          title="Trang ca di chuyển sau"
          aria-label="Trang ca di chuyển sau"
          disabled={!resource.data?.nextCursor || resource.status !== 'success'}
          onClick={() => setPages((rows) => [...rows, resource.data.nextCursor])}
        >
          <ChevronRight size={18} />
        </Button>
      </nav>
    </section>
  );
}
