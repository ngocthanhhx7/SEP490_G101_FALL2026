import { Button } from '../../../components/ui/index.js';
import { OperationsTable } from '../../../components/common/OperationsWorkspace.jsx';
import { useVisitBoardPages } from '../../../hooks/useVisitBoardPages.js';
import { ReassignLink, VisitBoardCustomer, VisitBoardStatus, VisitBoardSummary, canReassign } from './VisitBoardCells.jsx';

// "All visits": from 00:00 today in time order, or the newest first including past visits while searching.
export function AllVisitsTable({ api, filters, workAreas, onWorkflow, returnTo }) {
  const { first, items, next, moreStatus, loadMore } = useVisitBoardPages(api, 'all', filters);
  const areaOf = code => workAreas.find(area => area.code === code)?.label ?? 'Chưa rõ khu vực';

  if (first.status === 'loading') return <p role="status">Đang tải các buổi…</p>;
  if (first.status !== 'success' && first.status !== 'empty') {
    return <p role="alert" className="visit-board__error">Chưa tải được danh sách buổi. <Button variant="ghost" onClick={first.retry}>Thử lại</Button></p>;
  }

  return <>
    <p className="ops-muted">{filters.visitId ? 'Buổi chăm sóc từ thông báo xác nhận bàn giao.' : filters.search
      ? 'Kết quả tìm kiếm gồm cả các buổi đã qua, buổi mới nhất trước.'
      : 'Các buổi từ 00:00 hôm nay trở đi, theo giờ bắt đầu.'}</p>
    <OperationsTable label="Tất cả buổi" rows={items} empty="Không có buổi nào khớp."
      columns={[
        { key: 'visit', label: 'Buổi chăm sóc', render: row => <VisitBoardSummary row={row} /> },
        { key: 'customer', label: 'Khách hàng', render: row => <VisitBoardCustomer row={row} /> },
        { key: 'area', label: 'Khu vực', render: row => areaOf(row.areaCode) },
        { key: 'sitter', label: 'Người chăm sóc', render: row => row.sitterName ?? (row.state === 'SCHEDULED' ? 'Chưa phân công' : '—') },
        { key: 'state', label: 'Trạng thái', render: row => <VisitBoardStatus row={row} /> },
        ...(api.visitWorkflow ? [{ key: 'workflow', label: 'Thao tác', render: row => <div className="visit-board__actions">
          <Button variant="ghost" onClick={() => onWorkflow?.(row.id)}>Xem quy trình</Button>
          {canReassign(row) && <ReassignLink row={row} returnTo={returnTo} />}</div> }] : [])
      ]} />
    {moreStatus === 'error' && <p role="alert" className="visit-board__error">Chưa tải thêm được. Thử lại.</p>}
    {next && <Button variant="secondary" loading={moreStatus === 'loading'} onClick={loadMore}>Tải thêm</Button>}
  </>;
}
