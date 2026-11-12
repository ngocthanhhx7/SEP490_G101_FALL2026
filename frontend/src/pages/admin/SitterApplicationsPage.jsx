import { CursorPagination } from '../../components/ui/Pagination.jsx';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Notice, Select } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterApplicationAdminApi } from '../../services/sitter-application-api.js';
import { formatPhone } from '../../utils/product-format.js';
import './sitter-applications.css';

const STATES = [['', 'Tất cả hồ sơ'], ['PENDING', 'Chờ xem xét'], ['UNDER_REVIEW', 'Đang thẩm định'],
  ['INTERVIEW', 'Phỏng vấn'], ['APPROVED', 'Đã duyệt'], ['REJECTED', 'Đã từ chối']];
const TABS = [['ALL', 'Tất cả'], ['PENDING', 'Chờ duyệt'], ['UNDER_REVIEW', 'Đang thẩm định'],
  ['INTERVIEW', 'Phỏng vấn'], ['APPROVED', 'Đã duyệt'], ['REJECTED', 'Từ chối']];
const EMPLOYMENT = { FULL_TIME: 'Toàn thời gian', PART_TIME: 'Bán thời gian' };
const DATE_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'
});
const TIME_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh'
});
const SEARCH_LABEL = 'Tìm theo tên, số điện thoại hoặc mã';
const EMPTY_MESSAGE = 'Không có đơn ứng tuyển phù hợp.';

function StateLabel({ state, label }) {
  return <span className={`sitter-app-state sitter-app-state--${state.toLowerCase()}`}>{label ?? STATES.find(([value]) => value === state)?.[1] ?? state}</span>;
}

function phoneText(value) {
  if (!value) return '—';
  return formatPhone(value.replace(/^\+84(?=\d{9}$)/u, '0'));
}

function SortButton({ sortOrder, onClick, className }) {
  return <button type="button" className={className} onClick={onClick}>
    Ngày gửi <span aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>
  </button>;
}

export function SitterApplicationsPage({ api = sitterApplicationAdminApi }) {
  const [stateFilter, setStateFilter] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState([]);
  const [overview, setOverview] = useState({});
  const load = useCallback(async ({ signal }) => {
    const result = await api.list({ signal, state: stateFilter, search, employmentType, serviceArea, sortOrder, cursor });
    if (!signal.aborted && result.data) {
      setOverview({ summary: result.data.summary, serviceAreas: result.data.serviceAreas });
    }
    return result;
  }, [api, stateFilter, search, employmentType, serviceArea, sortOrder, cursor]);
  const resource = useApiResource(load);
  const data = resource.data;
  const { summary, serviceAreas = [] } = resource.status === 'loading' ? overview : data ?? {};

  function firstPage() { setCursor(''); setHistory([]); }
  function filter(setter, value) { setter(value); firstPage(); }
  function reset() { setStateFilter('ALL'); setSearch(''); setEmploymentType(''); setServiceArea(''); firstPage(); }
  function toggleSort() { setSortOrder(previous => previous === 'asc' ? 'desc' : 'asc'); firstPage(); }
  function nextPage() { setHistory(previous => [...previous, cursor]); setCursor(data.nextCursor); }
  function previousPage() { setCursor(history.at(-1)); setHistory(previous => previous.slice(0, -1)); }

  return <main className="sitter-app-admin sitter-app-list" aria-labelledby="sitter-app-admin-title">
    <header className="sitter-app-admin__header">
      <div>
        <h1 id="sitter-app-admin-title">Đơn ứng tuyển</h1>
        <p>Đơn gửi từ form ứng tuyển người chăm sóc. Mở một đơn để duyệt hoặc từ chối.</p>
      </div>
      <Button variant="secondary" onClick={resource.retry}>Làm mới danh sách</Button>
    </header>
    <section className="sitter-app-overview" aria-label="Tổng quan toàn bộ hồ sơ">
      {TABS.map(([value, label]) => <button type="button" key={value} aria-pressed={stateFilter === value}
        onClick={() => filter(setStateFilter, value)}>
        <span>{label}</span>{' '}<strong>{(value === 'ALL' ? summary?.total : summary?.byState?.[value]) ?? '—'}</strong>
      </button>)}
    </section>
    <section className="sitter-app-admin__filters" aria-label="Bộ lọc hồ sơ">
      <label className="sitter-app-admin__search" htmlFor="sitter-app-search"><span className="pwc-visually-hidden">{SEARCH_LABEL}</span>
        <input id="sitter-app-search" type="search" maxLength={50} placeholder={SEARCH_LABEL} value={search}
          onChange={event => filter(setSearch, event.target.value)} />
      </label>
      <Select label="Khu vực phục vụ" value={serviceArea} onChange={event => filter(setServiceArea, event.target.value)}>
        <option value="">Tất cả khu vực phục vụ</option>
        {serviceAreas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
      </Select>
      <Select label="Hình thức làm việc" value={employmentType} onChange={event => filter(setEmploymentType, event.target.value)}>
        <option value="">Tất cả hình thức</option>
        {Object.entries(EMPLOYMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <Button variant="ghost" onClick={reset}>Xóa bộ lọc</Button>
    </section>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải hồ sơ">Đang đọc danh sách từ máy chủ.</Notice>}
    {resource.status === 'pending' && <Notice state="pending" title="Yêu cầu đang xử lý">Máy chủ chưa xác nhận trạng thái danh sách.</Notice>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền">Chỉ Admin được xem và xét duyệt hồ sơ ứng tuyển.</Notice>}
    {resource.status === 'error' && <Notice state="error" title="Tải danh sách thất bại">Chưa thể tải hồ sơ. Kiểm tra phiên đăng nhập rồi thử lại.
      <Button variant="secondary" onClick={resource.retry}>Thử lại</Button></Notice>}
    {resource.status === 'success' && <section className="sitter-app-directory" aria-label="Danh sách hồ sơ ứng tuyển">
      <div className="sitter-app-directory__heading">
        <p>{Number.isSafeInteger(data.totalMatching) ? `${data.totalMatching} hồ sơ phù hợp` : `${data.applications.length} hồ sơ trên trang`}</p>
        <SortButton sortOrder={sortOrder} onClick={toggleSort} className="sitter-app-sort sitter-app-sort--mobile" />
      </div>
      {data.searchIncomplete && <Notice state="pending" title="Đang tìm trong hồ sơ">
        Kết quả chưa bao phủ toàn bộ hồ sơ. Chọn Trang sau để tiếp tục tìm hoặc thu hẹp bộ lọc.
      </Notice>}
      {!data.applications.length ? <Notice state="empty" title={data.searchIncomplete ? 'Chưa tìm thấy trong phần hồ sơ vừa kiểm tra.' : EMPTY_MESSAGE} />
        : <table className="sitter-app-table">
          <caption className="pwc-visually-hidden">Danh sách đơn ứng tuyển người chăm sóc</caption>
          <thead><tr>
            <th scope="col">Mã</th>
            <th scope="col">Họ tên</th>
            <th scope="col">Số điện thoại</th>
            <th scope="col">Khu vực phục vụ</th>
            <th scope="col" aria-sort={sortOrder === 'asc' ? 'ascending' : 'descending'}>
              <SortButton sortOrder={sortOrder} onClick={toggleSort} className="sitter-app-sort" />
            </th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Xem</th>
          </tr></thead>
          <tbody>{data.applications.map(application => <tr key={application.id}>
            <td data-label="Mã">{application.applicationCode ?? '—'}</td>
            <td data-label="Họ tên"><strong>{application.displayName}</strong></td>
            <td data-label="Số điện thoại">{phoneText(application.phoneNumber)}</td>
            <td data-label="Khu vực phục vụ">{application.workAreas.join(', ') || '—'}</td>
            <td data-label="Ngày gửi"><time dateTime={application.createdAt}>
              {DATE_FORMAT.format(new Date(application.createdAt))} {TIME_FORMAT.format(new Date(application.createdAt))}
            </time></td>
            <td data-label="Trạng thái">
              <StateLabel state={application.state} label={TABS.find(([value]) => value === application.state)?.[1]} />
              {application.state === 'REJECTED' && application.reapplyAt && <small>
                Nộp lại từ <time dateTime={application.reapplyAt}>{DATE_FORMAT.format(new Date(application.reapplyAt))}</time>
              </small>}
            </td>
            <td data-label="Xem"><Link className="sitter-app-open" to={`/admin/sitter-applications/${application.id}`}
              aria-label={`Xem hồ sơ ${application.displayName}`}>Xem</Link></td>
          </tr>)}</tbody>
        </table>}
      <CursorPagination page={history.length + 1} label="hồ sơ" hasNext={Boolean(data.nextCursor)}
        onFirst={firstPage} onPrevious={previousPage} onNext={nextPage}
        previousDisabled={!history.length} nextDisabled={!data.nextCursor}
        previousLabel="Trang trước" nextLabel="Trang sau" />
    </section>}
    {resource.status === 'empty' && <Notice state="empty" title={EMPTY_MESSAGE} />}
  </main>;
}
export { StateLabel };
