import { Button } from '../../../components/ui/index.js';
import { OperationsTable } from '../../../components/common/OperationsWorkspace.jsx';
import { useVisitBoardPages } from '../../../hooks/useVisitBoardPages.js';
import { formatBookingRef, formatClosureDay, formatClosureTime } from '../../../utils/visit-closure-format.js';
import { VISIT_STATE_LABELS } from '../../../utils/visit-board-format.js';

// "All visits": from 00:00 today in time order, or the newest first including past visits while searching.
export function AllVisitsTable({ api, filters, workAreas, onWorkflow }) {
  const { first, items, next, moreStatus, loadMore } = useVisitBoardPages(api, 'all', filters);
  const areaOf = code => workAreas.find(area => area.code === code)?.label ?? code ?? '—';

  if (first.status === 'loading') return <p role="status">Đang tải các buổi…</p>;
  if (first.status !== 'success' && first.status !== 'empty') {
    return <p role="alert" className="visit-board__error">Chưa tải được danh sách buổi. <Button variant="ghost" onClick={first.retry}>Thử lại</Button></p>;
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
        ...(api.visitWorkflow ? [{ key: 'workflow', label: 'Chăm sóc', render: row => <Button variant="ghost" onClick={()=>onWorkflow?.(row.id)}>Xem quy trình</Button> }] : []),
        { key: 'state', label: 'Trạng thái', render: row => VISIT_STATE_LABELS[row.state] ?? row.state }
      ]} />
    {moreStatus === 'error' && <p role="alert" className="visit-board__error">Chưa tải thêm được. Thử lại.</p>}
    {next && <Button variant="secondary" loading={moreStatus === 'loading'} onClick={loadMore}>Tải thêm</Button>}
  </>;
}
