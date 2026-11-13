import { Button } from '../../../components/ui/index.js';
import { OperationsBadge, OperationsTable } from '../../../components/common/OperationsWorkspace.jsx';
import { formatBookingRef, formatClosureSlot } from '../../../utils/visit-closure-format.js';
import { REASON_LABELS, actionFor, formatReasonTime } from '../../../utils/visit-board-format.js';
import { ContactCell } from './ContactCell.jsx';

function ReasonCell({ row }) {
  const [main, ...others] = row.reasons;
  return <>
    <OperationsBadge tone={main.late ? 'danger' : 'warning'}>{REASON_LABELS[main.code]}</OperationsBadge>
    {others.length > 0 && <small className="visit-board__others">{others.map(item => REASON_LABELS[item.code]).join(' · ')}</small>}
  </>;
}

function TimeCell({ row }) {
  const main = row.reasons[0];
  return <span className={main.late ? 'visit-board__late' : undefined}>{formatReasonTime(main)}</span>;
}

export const OUTSIDE_QUEUE_NOTE = 'Buổi nằm ngoài 50 ca đầu của hàng đợi. Xử lý các ca sớm hơn rồi tải lại.';

function ActionCell({ row, api, openableIds, onAction }) {
  const action = actionFor(row);
  if (!action) return '—';
  if (action.kind === 'call') return <ContactCell row={row} label={action.label} party={action.party} api={api} />;
  // The dispatch dialog only opens for the rows the page loaded, so a visit beyond them is locked with the reason.
  const locked = action.kind === 'dispatch' && openableIds && !openableIds.has(row.id);
  const noteId = `outside-queue-${row.id}`;
  return <>
    <button type="button" disabled={locked} aria-describedby={locked ? noteId : undefined} onClick={() => onAction(row, action)}>{action.label}</button>
    {locked && <small id={noteId} className="visit-board__locked">{OUTSIDE_QUEUE_NOTE}</small>}
  </>;
}

// One row per visit; every reason of the visit is kept, the most urgent one leads.
export function NeedsActionTable({ list, rows, filtering, api, openableIds, onAction }) {
  if (list.status === 'loading') return <p role="status">Đang tải các buổi cần xử lý…</p>;
  if (list.status !== 'success' && list.status !== 'empty') {
    return <p role="alert" className="visit-board__error">Chưa tải được danh sách cần xử lý. <Button variant="ghost" onClick={list.retry}>Thử lại</Button></p>;
  }
  return <>
    <OperationsTable label="Buổi cần xử lý" rows={rows}
      empty={filtering ? 'Không có buổi nào khớp.' : 'Không có buổi nào cần xử lý.'}
      columns={[
        { key: 'visit', label: 'Buổi', render: row => <><strong>{formatBookingRef(row)}</strong><small>{formatClosureSlot(row.startAt, row.endAt)}</small></> },
        { key: 'customer', label: 'Khách hàng', render: row => row.customerName ?? 'Chưa có tên' },
        { key: 'reason', label: 'Lý do', render: row => <ReasonCell row={row} /> },
        { key: 'time', label: 'Thời gian', render: row => <TimeCell row={row} /> },
        { key: 'sitter', label: 'Người chăm sóc', render: row => row.sitterName ?? '—' },
        { key: 'action', label: 'Thao tác', render: row => <ActionCell row={row} api={api} openableIds={openableIds} onAction={onAction} /> }
      ]} />
    {list.data?.counts?.needsActionLimited && <p className="ops-muted">Đang hiển thị các buổi gần giờ nhất ở mỗi lý do. Xử lý rồi tải lại để xem tiếp.</p>}
  </>;
}
