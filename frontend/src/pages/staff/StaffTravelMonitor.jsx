import { CursorPagination } from '../../components/ui/Pagination.jsx';
import { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
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
      <CursorPagination page={pages.length + 1} label="ca di chuyển" hasNext onFirst={() => setPages([])}
 onPrevious={() => setPages((rows) => rows.slice(0, -1))} onNext={() => setPages((rows) => [...rows, resource.data.nextCursor])}
 previousDisabled={!pages.length || resource.status === 'loading'} nextDisabled={!resource.data?.nextCursor || resource.status !== 'success'}
 previousLabel={"Trang ca di chuyển trước"} nextLabel={"Trang ca di chuyển sau"} />
    </section>
  );
}
