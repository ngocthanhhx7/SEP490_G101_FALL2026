import { useCallback, useState } from 'react';
import { Button } from '../../../components/ui/index.js';
import { OperationsTable } from '../../../components/common/OperationsWorkspace.jsx';
import { useApiResource } from '../../../hooks/useApiResource.js';
import { formatBookingRef, formatClosureDay, formatClosureTime } from '../../../utils/visit-closure-format.js';
import { VISIT_STATE_LABELS } from '../../../utils/visit-board-format.js';

// "All visits": from 00:00 today in time order, or the newest first including past visits while searching.
export function AllVisitsTable({ api, filters, workAreas }) {
  const load = useCallback(({ signal }) => api.visitBoard({ tab: 'all', ...filters }, { signal }), [api, filters]);
  const first = useApiResource(load);
  const [extra, setExtra] = useState({ owner: null, items: [], cursor: null, status: 'idle' });
  // Pages loaded with "Tải thêm" belong to the first page they were loaded after; a new first page drops them.
  const mine = extra.owner === first.data ? extra : { items: [], cursor: null, status: 'idle' };
  const areaOf = code => workAreas.find(area => area.code === code)?.label ?? code ?? '—';

  if (first.status === 'loading') return <p role="status">Đang tải các buổi…</p>;
  if (first.status !== 'success' && first.status !== 'empty') {
    return <p role="alert" className="visit-board__error">Chưa tải được danh sách buổi. <Button variant="ghost" onClick={first.retry}>Thử lại</Button></p>;
  }
  const items = [...(first.data?.items ?? []), ...mine.items];
  const next = mine.owner === undefined ? first.data?.nextCursor : mine.cursor;

  async function loadMore() {
    const owner = first.data;
    const keep = { owner, items: mine.items, cursor: next };
    setExtra({ ...keep, status: 'loading' });
    try {
      const result = await api.visitBoard({ tab: 'all', ...filters, cursor: next });
      setExtra({ owner, items: [...mine.items, ...result.data.items], cursor: result.data.hasMore ? result.data.nextCursor : null, status: 'idle' });
    } catch {
      setExtra({ ...keep, status: 'error' });
    }
  }

  return <>
    <p className="ops-muted">{filters.search
      ? 'Kết quả tìm kiếm gồm cả các buổi đã qua, buổi mới nhất trước.'
      : 'Các buổi từ 00:00 hôm nay trở đi, theo giờ bắt đầu.'}</p>
    <OperationsTable label="Tất cả buổi" rows={items} empty="Không có buổi nào khớp."
      columns={[
        { key: 'time', label: 'Giờ', render: row => <><strong>{formatClosureTime(row.startAt)} – {formatClosureTime(row.endAt)}</strong><small>{formatClosureDay(row.startAt)}</small></> },
        { key: 'booking', label: 'Lịch đặt', render: row => <><strong>{formatBookingRef(row)}</strong><small>{row.customerName ?? 'Chưa có tên'}</small></> },
        { key: 'service', label: 'Dịch vụ', render: row => row.serviceName ?? '—' },
        { key: 'area', label: 'Khu vực', render: row => areaOf(row.areaCode) },
        { key: 'sitter', label: 'Người chăm sóc', render: row => row.sitterName ?? '—' },
        { key: 'state', label: 'Trạng thái', render: row => VISIT_STATE_LABELS[row.state] ?? row.state }
      ]} />
    {mine.status === 'error' && <p role="alert" className="visit-board__error">Chưa tải thêm được. Thử lại.</p>}
    {next && <Button variant="secondary" loading={mine.status === 'loading'} onClick={loadMore}>Tải thêm</Button>}
  </>;
}
