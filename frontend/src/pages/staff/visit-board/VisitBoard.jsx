import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/index.js';
import { useApiResource } from '../../../hooks/useApiResource.js';
import { CloseVisitDialog } from '../CloseVisitDialog.jsx';
import { CLOSURE_SUCCESS_MESSAGE } from '../../../utils/visit-closure-format.js';
import { REASON_LABELS } from '../../../utils/visit-board-format.js';
import { AllVisitsTable } from './AllVisitsTable.jsx';
import { NeedsActionTable } from './NeedsActionTable.jsx';
import './visit-board.css';

const SEARCH_DELAY_MS = 300;
const SEARCH_MIN_LENGTH = 2;
const NO_BOARD = async () => ({ data: null });
const NO_FILTERS = Object.freeze({});
const count = value => (Number.isInteger(value) ? ` (${value})` : '');

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function Tab({ id, tab, onTab, children }) {
  const active = tab === id;
  return <button type="button" role="tab" aria-selected={active} className={active ? 'is-active' : undefined} onClick={() => onTab(id)}>{children}</button>;
}

// Staff visit board (R3 10.1.1): the tabs, the shared search and filters, and the two lists that are new in this slice.
// The "Buổi hôm nay" tab is the existing section of the page; the page decides what to show for it.
// openableIds: ids of the visits whose dispatch dialog the page can open; without it every visit counts as openable.
export function VisitBoard({ api, tab, onTab, todayTotal, workAreas = [], openableIds, onOpenDispatch, onChanged, onState }) {
  const hasBoard = typeof api.visitBoard === 'function';
  const [text, setText] = useState('');
  const [areaCode, setAreaCode] = useState('');
  const [reason, setReason] = useState('');
  const query = useDebounced(text.trim().replace(/\s+/gu, ' '), SEARCH_DELAY_MS);
  const filters = useMemo(() => ({
    ...(query.length >= SEARCH_MIN_LENGTH ? { search: query } : {}),
    ...(areaCode ? { areaCode } : {}),
    ...(reason ? { reason } : {})
  }), [query, areaCode, reason]);
  const filtering = Object.keys(filters).length > 0;
  const [notice, setNotice] = useState(null);
  const [closing, setClosing] = useState(null);

  // The tab count comes from this list and ignores search and filters (the API computes it that way).
  // The list is also loaded on the other tabs for that count, without the filters that belong to them.
  const needsFilters = tab === 'needs' ? filters : NO_FILTERS;
  const loadNeeds = useCallback(({ signal }) => api.visitBoard({ tab: 'needs-action', ...needsFilters }, { signal }), [api, needsFilters]);
  const needs = useApiResource(hasBoard ? loadNeeds : NO_BOARD);
  const needsRows = useMemo(() => (hasBoard && needs.status === 'success' ? needs.data.items : []), [hasBoard, needs.status, needs.data]);

  // Tell the page which visits this list already shows and whether it is filtering, so it can hide the legacy table.
  useEffect(() => {
    onState?.({ ids: new Set(needsRows.map(row => row.id)), filtering: hasBoard && tab === 'needs' && filtering });
  }, [needsRows, hasBoard, tab, filtering]);

  function afterClosed() {
    setClosing(null); setNotice(CLOSURE_SUCCESS_MESSAGE);
    needs.retry(); onChanged?.();
  }
  function onAction(row, action) {
    setNotice(null);
    if (action.kind === 'dispatch') onOpenDispatch?.(row.id);
    else if (action.kind === 'close') setClosing(row.id);
    else if (action.kind === 'withdrawal') document.getElementById('withdrawal-requests')?.scrollIntoView?.({ block: 'start' });
  }

  return <section className="visit-board" aria-label="Danh sách buổi chăm sóc">
    <div role="tablist" aria-label="Danh sách buổi" className="visit-board__tabs">
      <Tab id="needs" tab={tab} onTab={onTab}>Cần xử lý{count(needs.data?.counts?.needsAction)}</Tab>
      <Tab id="today" tab={tab} onTab={onTab}>Buổi hôm nay{count(todayTotal)}</Tab>
      {hasBoard && <Tab id="all" tab={tab} onTab={onTab}>Tất cả buổi</Tab>}
    </div>
    {hasBoard && tab !== 'today' && <div className="ops-toolbar visit-board__filters">
      <input type="search" aria-label="Tìm buổi" placeholder="Tìm theo tên khách, người chăm sóc, mã lịch đặt" value={text} maxLength={50}
        onChange={event => setText(event.target.value)} />
      <select aria-label="Khu vực phục vụ" value={areaCode} onChange={event => setAreaCode(event.target.value)}>
        <option value="">Tất cả khu vực phục vụ</option>
        {workAreas.map(area => <option key={area.code} value={area.code}>{area.label}</option>)}
      </select>
      <select aria-label="Lý do" value={reason} onChange={event => setReason(event.target.value)}>
        <option value="">Tất cả lý do</option>
        {Object.entries(REASON_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
      {text.trim().length === 1 && <small className="ops-muted">Nhập ít nhất 2 ký tự để tìm.</small>}
    </div>}
    {notice && <p role="status" className="visit-board__notice">{notice}</p>}
    {hasBoard && tab === 'needs' && <NeedsActionTable list={needs} rows={needsRows} filtering={filtering} api={api} openableIds={openableIds} onAction={onAction} />}
    {hasBoard && tab === 'all' && <AllVisitsTable api={api} filters={filters} workAreas={workAreas} />}
    {closing && <CloseVisitDialog visitId={closing} api={api} onClose={() => setClosing(null)} onClosed={afterClosed} />}
  </section>;
}
