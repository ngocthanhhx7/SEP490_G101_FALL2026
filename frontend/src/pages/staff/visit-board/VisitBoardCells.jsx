import { OperationsBadge } from '../../../components/common/OperationsWorkspace.jsx';
import { formatBookingRef, formatClosureDay, formatClosureSlot, formatClosureTime } from '../../../utils/visit-closure-format.js';
import { VISIT_STATE_LABELS } from '../../../utils/visit-board-format.js';

const locations = { HOME: 'Tại nhà', FACILITY: 'Tại trung tâm', OUTDOOR: 'Ngoài trời' };

export function VisitBoardSummary({ row }) {
  const from = row.startAt && Number.isFinite(Date.parse(row.startAt)) ? formatClosureDay(row.startAt) : null;
  const to = row.endAt && Number.isFinite(Date.parse(row.endAt)) ? formatClosureDay(row.endAt) : null;
  const location = Object.hasOwn(locations, row.location) ? locations[row.location] : null;
  const slot = !from || !to ? null : from === to ? formatClosureSlot(row.startAt, row.endAt)
    : `${from} · ${formatClosureTime(row.startAt)} → ${to} · ${formatClosureTime(row.endAt)}`;
  return <div className="visit-board__summary">
    <strong>{row.serviceDisplayName || row.serviceName || 'Chưa rõ dịch vụ'}</strong>
    {slot && <small>{slot}</small>}
    {(row.petNames?.length > 0 || location) && <div className="visit-board__visit-meta">
      {row.petNames?.length > 0 && <span>{row.petNames.join(', ')}</span>}
      {location && <OperationsBadge tone="info">{location}</OperationsBadge>}
    </div>}
  </div>;
}

export function VisitBoardCustomer({ row }) {
  return <><span>{row.customerName ?? 'Chưa có tên'}</span>
    {(row.bookingCode || row.bookingId) && <small>Mã lịch · <span>{formatBookingRef(row)}</span></small>}
  </>;
}

export function VisitBoardStatus({ row }) {
  if (row.state === 'SCHEDULED' && (row.unassignedOverdue ?? row.reviewCode === 'SHIFT_START_REACHED'))
    return <OperationsBadge tone="danger">Quá giờ, chưa phân công</OperationsBadge>;
  const tone = { ASSIGNED: 'info', IN_PROGRESS: 'info', COMPLETED: 'success', SCHEDULED: 'warning' }[row.state];
  return <OperationsBadge tone={tone}>{VISIT_STATE_LABELS[row.state] ?? 'Cần đối chiếu'}</OperationsBadge>;
}
