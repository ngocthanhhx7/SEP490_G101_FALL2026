import { useCallback, useState } from 'react';
import { OperationsBadge, OperationsTable } from '../../components/common/OperationsWorkspace.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button } from '../../components/ui/index.js';
import { CloseVisitDialog } from './CloseVisitDialog.jsx';
import { CLOSURE_REASON_LABEL, CLOSURE_SUCCESS_MESSAGE, formatBookingRef, formatClosureSlot, formatOverdue } from '../../utils/visit-closure-format.js';
import './visit-closure.css';

// Needs-action rows for "not checked out 2 hours after the end" (GBR-24). Hidden when the API is not wired.
export function VisitClosurePanel({ api, onChanged, initialVisitId, canVerify = false }) {
  const load = useCallback(async ({ signal }) => api.closableVisits ? api.closableVisits({ signal }) : { data: { items: [] } }, [api]);
  const list = useApiResource(load);
  const [selected, setSelected] = useState(/^[a-f0-9]{24}$/i.test(initialVisitId ?? '') ? initialVisitId : null);
  const [notice, setNotice] = useState(null);
  const rows = list.data?.items ?? [];
  if (!api.closableVisits || (!rows.length && !notice && !selected && list.status !== 'error')) return null;
  return <div className="visit-closure-panel">
    <h3>Chưa check-out</h3>
    {notice && <p role="status" className="visit-closure-panel__notice">{notice}</p>}
    {list.status === 'error' && <p role="alert">Chưa tải được các buổi chưa check-out. <Button variant="ghost" onClick={list.retry}>Thử lại</Button></p>}
    {!!rows.length && <OperationsTable label="Buổi chưa check-out" rows={rows} columns={[
      { key: 'visit', label: 'Buổi', render: row => <><strong>{formatBookingRef(row)}</strong><small>{formatClosureSlot(row.startAt, row.endAt)}</small></> },
      { key: 'customer', label: 'Khách hàng', render: row => row.customerName ?? 'Chưa có tên' },
      { key: 'reason', label: 'Lý do', render: row => <OperationsBadge tone="danger">{row.state === 'STAFF_CLOSED' ? 'Chờ quản trị xác minh' : CLOSURE_REASON_LABEL}</OperationsBadge> },
      { key: 'time', label: 'Thời gian', render: row => <span className="visit-closure-panel__late">{formatOverdue(row.overdueMs)}</span> },
      { key: 'sitter', label: 'Người chăm sóc', render: row => row.sitterName ?? '—' },
      { key: 'action', label: 'Thao tác', render: row => <button type="button" onClick={() => { setNotice(null); setSelected(row.id); }}>{row.state === 'STAFF_CLOSED' ? 'Đối chiếu buổi' : 'Đóng buổi'}</button> }
    ]} />}
    {list.data?.hasMore && <p className="ops-muted">Đang hiển thị 50 buổi cũ nhất.</p>}
    {selected && <CloseVisitDialog key={selected} visitId={selected} api={api} canVerify={canVerify} onClose={() => setSelected(null)}
      onClosed={() => { setSelected(null); setNotice(CLOSURE_SUCCESS_MESSAGE); list.retry(); onChanged?.(); }} />}
  </div>;
}
