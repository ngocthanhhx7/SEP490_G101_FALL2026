import { Button } from '../../../components/ui/index.js';
import { OperationsBadge, OperationsTable } from '../../../components/common/OperationsWorkspace.jsx';
import { REASON_LABELS, actionFor, formatReasonTime } from '../../../utils/visit-board-format.js';
import { ContactCell } from './ContactCell.jsx';
import { ReassignLink, VisitBoardCustomer, VisitBoardSummary, canReassign } from './VisitBoardCells.jsx';

// R3 10.1.1: "Reassign or Cancel" for the visits whose pet sitter did not show, withdrew late or has not confirmed the handover.
const REASSIGN_REASONS = ['WITHDRAWAL_UNDER_12H', 'NOT_CHECKED_IN_30M', 'HANDOVER_NOT_CONFIRMED_1H'];

function ReasonCell({ row }) {
  const [main, ...others] = row.reasons;
  const overdue = row.unassignedOverdue ?? (main.code === 'NO_SITTER_24H' && main.late);
  const details = overdue ? row.reasons.filter(reason => reason.code !== 'NO_SITTER_24H') : others;
  return <>
    <OperationsBadge tone={overdue || main.late ? 'danger' : 'warning'}>{overdue
      ? 'Đã qua giờ hẹn, chưa có người nhận' : REASON_LABELS[main.code]}</OperationsBadge>
    {details.length > 0 && <small className="visit-board__others">{details.map(item => REASON_LABELS[item.code]).join(' · ')}</small>}
  </>;
}

function TimeCell({ row }) {
  const main = row.reasons[0];
  return <span className={main.late ? 'visit-board__late' : undefined}>{formatReasonTime(main)}</span>;
}

export const OUTSIDE_QUEUE_NOTE = 'Buổi nằm ngoài 50 ca đầu của hàng đợi. Xử lý các ca sớm hơn rồi tải lại.';

function ActionCell({ row, api, openableIds, onAction, returnTo }) {
  const action = actionFor(row), reassign = canReassign(row) && row.reasons.some(reason => REASSIGN_REASONS.includes(reason.code));
  if (!action) return reassign ? <ReassignLink row={row} returnTo={returnTo} /> : '—';
  if (action.kind === 'call') return <><ContactCell row={row} label={action.label} party={action.party} api={api} />{reassign && <ReassignLink row={row} returnTo={returnTo} />}</>;
  // The dispatch dialog only opens for the rows the page loaded, so a visit beyond them is locked with the reason.
  const locked = action.kind === 'dispatch' && !api.dispatchDetails && openableIds && !openableIds.has(row.id);
  const noteId = `outside-queue-${row.id}`;
  return <>
    <button type="button" disabled={locked} aria-describedby={locked ? noteId : undefined} onClick={() => onAction(row, action)}>{action.label}</button>
    {locked && <small id={noteId} className="visit-board__locked">{OUTSIDE_QUEUE_NOTE}</small>}
    {reassign && <ReassignLink row={row} returnTo={returnTo} />}
  </>;
}

// One row per visit; every reason of the visit is kept, the most urgent one leads.
export function NeedsActionTable({ list, rows, filtering, api, workAreas, openableIds, onAction, returnTo }) {
  if (list.status === 'loading') return <p role="status">Đang tải các buổi cần xử lý…</p>;
  if (list.status !== 'success' && list.status !== 'empty') {
    return <p role="alert" className="visit-board__error">Chưa tải được danh sách cần xử lý. <Button variant="ghost" onClick={list.retry}>Thử lại</Button></p>;
  }
  return <>
    <OperationsTable label="Buổi cần xử lý" rows={rows}
      empty={filtering ? 'Không có buổi nào khớp.' : 'Không có buổi nào cần xử lý.'}
      columns={[
        { key: 'visit', label: 'Buổi chăm sóc', render: row => <VisitBoardSummary row={row} /> },
        { key: 'customer', label: 'Khách hàng', render: row => <VisitBoardCustomer row={row} /> },
        { key: 'reason', label: 'Lý do', render: row => <ReasonCell row={row} /> },
        { key: 'time', label: 'Thời gian', render: row => <TimeCell row={row} /> },
        { key: 'area', label: 'Khu vực', render: row => workAreas.find(area => area.code === row.areaCode)?.label ?? 'Chưa rõ khu vực' },
        { key: 'sitter', label: 'Người chăm sóc', render: row => row.sitterName ?? (row.state === 'SCHEDULED' ? 'Chưa phân công' : '—') },
        { key: 'action', label: 'Thao tác', render: row => <ActionCell row={row} api={api} openableIds={openableIds} onAction={onAction} returnTo={returnTo} /> }
      ]} />
    {list.data?.counts?.needsActionLimited && <p className="ops-muted">Đang hiển thị các buổi gần giờ nhất ở mỗi lý do. Xử lý rồi tải lại để xem tiếp.</p>}
  </>;
}
