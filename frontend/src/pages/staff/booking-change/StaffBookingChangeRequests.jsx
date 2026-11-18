import { useCallback, useMemo, useState } from 'react';
import { OperationsBadge, OperationsTable } from '../../../components/common/OperationsWorkspace.jsx';
import { Button, CursorPagination } from '../../../components/ui/index.js';
import { useSession } from '../../../contexts/SessionContext.jsx';
import { useApiResource } from '../../../hooks/useApiResource.js';
import { createStaffBookingChangeApi } from '../../../services/staff-booking-change-api.js';
import { staffBookingChangeMessages, staffChangeMoment, staffChangeRange, staffChangeScope } from '../../../utils/staff-booking-change-format.js';
import { StaffBookingChangeDialog } from './StaffBookingChangeDialog.jsx';

export function StaffBookingChangeRequests({ bookingId, enabled = true, refreshRevision = 0, onDecision }) {
  const { status, getCsrfToken } = useSession({ optional: true });
  if (status !== 'authenticated') return null;
  return <AuthenticatedRequests bookingId={bookingId} enabled={enabled} refreshRevision={refreshRevision}
    onDecision={onDecision} getCsrfToken={getCsrfToken} />;
}

function AuthenticatedRequests({ bookingId, enabled, refreshRevision, onDecision, getCsrfToken }) {
  // Remount pagination on manual refresh while keeping an open decision dialog intact.
  const [requestId, setRequestId] = useState(null);
  const [message, setMessage] = useState(null);
  const [decisionRevision, setDecisionRevision] = useState(0);
  const api = useMemo(() => createStaffBookingChangeApi({ getCsrfToken }), [getCsrfToken]);

  function close(refresh) {
    setRequestId(null);
    if (refresh) setDecisionRevision(revision => revision + 1);
  }

  return <>
    {message && <p role="status" className="staff-change-success">{message}</p>}
    {enabled && <RequestTable key={refreshRevision + ':' + decisionRevision} api={api} bookingId={bookingId}
      onOpen={id => { setMessage(null); setRequestId(id); }} />}
    {requestId && <StaffBookingChangeDialog key={requestId} api={api} requestId={requestId} onClose={close}
      onDecision={result => {
        setMessage(staffBookingChangeMessages[result.messageCode]);
        close(true);
        onDecision?.();
      }} />}
  </>;
}

function RequestTable({ api, bookingId, onOpen }) {
  const [cursors, setCursors] = useState([null]);
  const cursor = cursors.at(-1);
  const load = useCallback(({ signal }) => api.list({ bookingId, cursor, signal }), [api, bookingId, cursor]);
  const list = useApiResource(load);
  const rows = list.data?.items ?? [];
  const next = list.data?.nextCursor;
  if (list.status === 'loading' && cursors.length === 1) return null;
  if (list.httpStatus === 404) return null;
  if (!['success', 'loading'].includes(list.status)) return <p role="alert" className="staff-change-error">
    Chưa tải được yêu cầu đổi giờ. <Button variant="secondary" onClick={list.retry}>Thử lại</Button>
  </p>;
  if (!rows.length && !next && cursors.length === 1) return null;

  return <section className="staff-change-requests">
    <OperationsTable label="Yêu cầu đổi giờ" rows={rows} empty={list.status === 'loading' ? 'Đang tải yêu cầu…' : 'Trang này không còn yêu cầu chờ duyệt.'}
      columns={[
        { key: 'booking', label: 'Lịch đặt', render: row => <div className="staff-change-booking"><strong>{row.bookingCode ?? 'Lịch đặt'}</strong>
          <small>{row.scope === 'VISIT' && row.items[0]
            ? staffChangeRange(row.items[0].oldStartAt, row.items[0].oldEndAt)
            : staffChangeScope(row.scope) + ' · ' + row.items.length + ' buổi'}</small></div> },
        { key: 'customerName', label: 'Khách hàng' },
        { key: 'reason', label: 'Lý do', render: () => <OperationsBadge tone="warning">Yêu cầu đổi giờ chờ duyệt</OperationsBadge> },
        { key: 'deadline', label: 'Hạn duyệt', render: row => staffChangeMoment(row.expiresAt) },
        { key: 'action', label: 'Thao tác', render: row => <Button variant="ghost" onClick={() => onOpen(row.id)}>Xem yêu cầu</Button> }
      ]} />
    {(next || cursors.length > 1) && <CursorPagination page={cursors.length} label="yêu cầu đổi giờ" hasNext={Boolean(next)}
      disabled={list.status === 'loading'} onFirst={() => setCursors([null])}
      onPrevious={() => setCursors(previous => previous.slice(0, -1))}
      onNext={() => setCursors(previous => [...previous, next])} />}
  </section>;
}
