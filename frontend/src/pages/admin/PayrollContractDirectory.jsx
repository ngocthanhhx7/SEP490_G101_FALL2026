import { useCallback, useId, useState } from 'react';
import { OperationsBadge, OperationsTable } from '../../components/common/OperationsWorkspace.jsx';
import { money } from '../../components/payroll/PayrollDetails.jsx';
import { Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';

const tabs = [['ACTIVE', 'Đang hiệu lực'], ['ENDED', 'Đã kết thúc'], ['ALL', 'Tất cả']];
const types = { FULL_TIME: 'Toàn thời gian', PART_TIME: 'Bán thời gian' };
const displayDate = value => value ? value.split('-').reverse().join('/') : '—';
const columns = [
  { key: 'employeeName', label: 'Người chăm sóc', render: row => <>{row.employeeName} <small>{row.employeeCode}</small>
    {row.status === 'UPCOMING' && <OperationsBadge tone="warning">Đã ký, chờ hiệu lực</OperationsBadge>}</> },
  { key: 'employmentType', label: 'Loại hợp đồng', render: row => types[row.employmentType] },
  { key: 'monthlyBaseVnd', label: 'Lương tháng', render: row => money(row.monthlyBaseVnd) },
  { key: 'effectiveOn', label: 'Từ ngày', render: row => displayDate(row.effectiveOn) },
  { key: 'endsOn', label: 'Đến ngày', render: row => displayDate(row.endsOn) },
];

export function PayrollContractDirectory({ api, revision }) {
  const id = useId();
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState({ tab: 'ACTIVE', search: '', employmentType: '', page: 1 });
  const load = useCallback(async ({ signal }) => ({
    data: await api.listContracts({ ...query, signal })
  }), [api, query]);
  // Mounting a fresh resource on acknowledged saves refetches the current filters and page.
  return <ContractResults key={revision} id={id} load={load} query={query} setQuery={setQuery}
    searchInput={searchInput} setSearchInput={setSearchInput} />;
}

function ContractResults({ id, load, query, setQuery, searchInput, setSearchInput }) {
  const { tab, employmentType, page } = query;
  const resource = useApiResource(load);
  const counts = resource.data?.counts;
  const statusCount = counts?.[tab.toLowerCase()] ?? 0;
  const lastPage = Math.max(1, Math.ceil(statusCount / (resource.data?.pageSize ?? 20)));
  const updateQuery = change => setQuery(current => ({ ...current, page: 1, ...change }));
  const selectTab = (event, index) => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, Home: -index, End: tabs.length - 1 - index };
    if (!Object.hasOwn(offsets, event.key)) return;
    event.preventDefault();
    const [next] = tabs[(index + offsets[event.key] + tabs.length) % tabs.length];
    updateQuery({ tab: next });
    event.currentTarget.parentElement.querySelector(`[data-contract-tab="${next}"]`)?.focus();
  };

  return <section aria-labelledby={id + '-heading'} className="payroll-contract-directory">
    <h2 id={id + '-heading'}>Danh sách hợp đồng</h2>
    <div className="payroll-contract-directory__tabs" role="tablist" aria-label="Trạng thái hợp đồng">
      {tabs.map(([value, label], index) => <button key={value} type="button" role="tab"
        id={id + '-' + value} aria-controls={id + '-results'} data-contract-tab={value} tabIndex={tab === value ? 0 : -1}
        aria-selected={tab === value} onClick={() => updateQuery({ tab: value })} onKeyDown={event => selectTab(event, index)}>
        {label} ({counts?.[value.toLowerCase()] ?? '—'})
      </button>)}
    </div>
    <form className="payroll-contract-directory__filters" onSubmit={event => {
      event.preventDefault();
      updateQuery({ search: searchInput.trim() });
    }}>
      <label className="payroll-field"><span>Tìm hợp đồng</span>
        <input type="search" placeholder="Tên, mã hoặc SĐT đầy đủ" maxLength={100} value={searchInput}
          onChange={event => setSearchInput(event.target.value)} />
      </label>
      <button type="submit">Tìm hợp đồng</button>
      <label className="payroll-field"><span>Loại hợp đồng</span>
        <select value={employmentType} onChange={event => updateQuery({ employmentType: event.target.value })}>
          <option value="">Tất cả loại hợp đồng</option>
          {Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </form>
    <div role="tabpanel" id={id + '-results'} aria-labelledby={id + '-' + tab} aria-busy={resource.status === 'loading'}>
      {resource.status === 'loading' && <p role="status">Đang tải danh sách hợp đồng…</p>}
      {resource.status !== 'loading' && resource.status !== 'success' && <Notice state="error" title="Chưa tải được hợp đồng"
        action={<button type="button" onClick={resource.retry}>Thử tải lại hợp đồng</button>} />}
      {resource.status === 'success' && <>
        <OperationsTable label="Hợp đồng người chăm sóc" columns={columns} rows={resource.data.items} empty="Không có hợp đồng phù hợp." />
        {(lastPage > 1 || page > 1) && <nav aria-label="Phân trang hợp đồng" className="payroll-contract-directory__pages">
          <button type="button" disabled={page <= 1} onClick={() => updateQuery({ page: page - 1 })}>Trang trước</button>
          <span>Trang {page} / {Math.max(page, lastPage)}</span>
          <button type="button" disabled={page >= lastPage} onClick={() => updateQuery({ page: page + 1 })}>Trang sau</button>
        </nav>}
      </>}
    </div>
  </section>;
}
