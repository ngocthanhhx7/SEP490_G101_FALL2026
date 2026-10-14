import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Notice, Select } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import './sitter-availability.css';

const DAYS = [
  { value: 1, label: 'Thứ Hai' }, { value: 2, label: 'Thứ Ba' }, { value: 3, label: 'Thứ Tư' },
  { value: 4, label: 'Thứ Năm' }, { value: 5, label: 'Thứ Sáu' }, { value: 6, label: 'Thứ Bảy' },
  { value: 7, label: 'Chủ Nhật' }
];

function localDateInSitterZone(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addLocalCalendarDays(localDate, count) {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + count));
  return date.toISOString().slice(0, 10);
}

export function getSitterCalendarRange(now = new Date()) {
  const fromLocalDate = localDateInSitterZone(now);
  return { fromLocalDate, toLocalDate: addLocalCalendarDays(fromLocalDate, 30) };
}

function formatSitterCalendarDate(localDate) {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: 'numeric', month: 'long'
  }).format(date);
}

function newOperationKey() {
  const source = globalThis.crypto;
  if (!source?.getRandomValues) throw new Error('Secure operation keys are unavailable');
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function messageFor(error) {
  if (error?.code === 'CONFIRMED_VISIT_CONFLICT') {
    return 'Lịch có buổi đã xác nhận. Lịch cũ vẫn được giữ nguyên; Staff cần xem và xử lý xung đột trước khi thay đổi.';
  }
  if (error?.code === 'VERSION_CONFLICT') return 'Lịch đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.';
  if (error?.code === 'DEADLINE_PASSED') return 'Ngày bắt đầu đã qua theo giờ Asia/Saigon. Hãy chọn ngày hôm nay hoặc ngày sau.';
  if (error?.status === 403 || error?.code === 'FORBIDDEN') return 'Máy chủ không cho phép tài khoản này thay đổi lịch.';
  return 'Không thể lưu lịch lúc này. Lịch hiện tại chưa được xác nhận là đã thay đổi.';
}

export function SitterAvailabilityPage({ api, createOperationKey = newOperationKey, now = new Date() }) {
  const load = useCallback(({ signal }) => {
    if (typeof api?.getAvailability !== 'function') return Promise.resolve({ data: null, pending: true });
    return api.getAvailability({ signal });
  }, [api]);
  const resource = useApiResource(load);
  const [today] = useState(() => localDateInSitterZone(now));
  const [calendarRange] = useState(() => getSitterCalendarRange(now));
  const loadCalendar = useCallback(({ signal }) => {
    if (typeof api?.listCalendar !== 'function') return Promise.resolve({ data: null, pending: true });
    return api.listCalendar({ ...calendarRange, signal });
  }, [api, calendarRange]);
  const calendarResource = useApiResource(loadCalendar);
  const [windows, setWindows] = useState([]);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [saving, setSaving] = useState(false);
  const [commandStatus, setCommandStatus] = useState(null);
  const operation = useRef(null);

  useEffect(() => {
    if (!resource.data || typeof resource.data !== 'object') return;
    setWindows((resource.data.workingWindows ?? []).map((window, index) => ({ ...window, rowId: `saved-${index}` })));
    setEffectiveFrom(resource.data.effectiveFrom || today);
  }, [resource.data, today]);

  const currentVersion = Number.isSafeInteger(resource.data?.expectedVersion) ? resource.data.expectedVersion : 0;
  const pendingAcknowledgement = commandStatus?.state === 'pending';
  const fieldsDisabled = saving || pendingAcknowledgement;
  const normalizedWindows = useMemo(() => windows.map(({ weekday, startLocalTime, endLocalTime }) => ({
    weekday: Number(weekday), startLocalTime, endLocalTime
  })), [windows]);

  function changeWindow(rowId, field, value) {
    setWindows(rows => rows.map(row => row.rowId === rowId ? { ...row, [field]: field === 'weekday' ? Number(value) : value } : row));
    operation.current = null;
    setCommandStatus(null);
  }

  function addWindow() {
    setWindows(rows => [...rows, { rowId: `new-${Date.now()}-${rows.length}`, weekday: 1,
      startLocalTime: '09:00', endLocalTime: '17:00' }]);
    operation.current = null;
    setCommandStatus(null);
  }

  function removeWindow(rowId) {
    setWindows(rows => rows.filter(row => row.rowId !== rowId));
    operation.current = null;
    setCommandStatus(null);
  }

  async function submit(event) {
    event.preventDefault();
    if (typeof api?.saveAvailability !== 'function' || saving) return;
    setCommandStatus(null);
    setSaving(true);
    const command = {
      zone: 'Asia/Ho_Chi_Minh', effectiveFrom, expectedVersion: currentVersion,
      workingWindows: normalizedWindows
    };
    const fingerprint = JSON.stringify(command);
    try {
      if (!operation.current || operation.current.fingerprint !== fingerprint) {
        operation.current = { fingerprint, key: createOperationKey() };
      }
      const result = await api.saveAvailability({ ...command, idempotencyKey: operation.current.key });
      if (result?.pending || result?.status === 202) {
        setCommandStatus({ state: 'pending', message: 'Máy chủ đang xử lý yêu cầu. Lịch chưa được xác nhận là đã lưu; dùng cùng nút để hỏi lại với cùng mã yêu cầu.' });
      } else {
        operation.current = null;
        setCommandStatus({ state: 'success', message: 'Máy chủ đã xác nhận thay đổi lịch.' });
        resource.retry();
        calendarResource.retry();
      }
    } catch (error) {
      if (error?.status === 403 || error?.code === 'FORBIDDEN') {
        setCommandStatus({ state: 'forbidden', code: error?.code, message: messageFor(error) });
      } else if (!error?.status || error?.code === 'NETWORK_ERROR' || error?.code === 'TIMEOUT') {
        setCommandStatus({ state: 'pending', message: '\u004b\u0068\u00f4\u006e\u0067 nh\u1eadn \u0111\u01b0\u1ee3c x\u00e1c nh\u1eadn t\u1eeb m\u00e1y ch\u1ee7. H\u00e3y ki\u1ec3m tra l\u1ea1i c\u00f9ng y\u00eau c\u1ea7u; l\u1ecbch ch\u01b0a \u0111\u01b0\u1ee3c x\u00e1c minh l\u00e0 \u0111\u00e3 thay \u0111\u1ed5i.' });
      } else {
        setCommandStatus({ state: 'error', code: error?.code, message: messageFor(error) });
      }
    } finally {
      setSaving(false);
    }
  }

  if (resource.status === 'loading') return <section className="sitter-availability"><Notice state="loading" title="Đang tải lịch làm việc">Đang lấy lịch của Sitter đang đăng nhập.</Notice></section>;
  if (resource.status === 'forbidden') return <section className="sitter-availability"><Notice state="forbidden" title="Không có quyền truy cập">Chỉ Sitter được phép xem lịch của chính mình.</Notice></section>;
  if (resource.status === 'error') return <section className="sitter-availability"><Notice state="error" title="Không tải được lịch"
    action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Lịch chưa được tải; không có dữ liệu Customer trong màn hình này.</Notice></section>;
  if (resource.status === 'pending') return <section className="sitter-availability"><Notice state="pending" title="Lịch đang chờ tích hợp">API lịch Sitter chưa được kết nối. Dữ liệu mẫu không xác nhận quyền truy cập hay thay đổi đã lưu.</Notice></section>;

  const isEmpty = resource.status === 'empty' || !resource.data;
  const refreshAction = commandStatus?.code === 'VERSION_CONFLICT'
    ? <Button variant="secondary" onClick={() => { operation.current = null; resource.retry(); }}>Tải lại lịch</Button>
    : undefined;
  const calendarEntries = Array.isArray(calendarResource.data) ? calendarResource.data : [];
  return <section className="sitter-availability">
    <header className="sitter-availability__header">
      <p className="sitter-availability__eyebrow">Khu vực Sitter</p>
      <h1>Lịch làm việc</h1>
      <p>Chọn giờ có thể nhận việc theo ngày trong tuần. Giờ được nhập và đọc theo <strong>Asia/Saigon</strong>.</p>
    </header>

    {isEmpty && <Notice state="empty" title="Bạn chưa khai báo giờ làm việc">
      Thêm các khung giờ lặp hằng tuần. Ngày nghỉ và khu vực phục vụ được quản lý riêng.
    </Notice>}
    {commandStatus && <Notice state={commandStatus.state} title={commandStatus.state === 'success' ? 'Đã cập nhật lịch' :
      commandStatus.state === 'pending' ? 'Đang chờ máy chủ' : commandStatus.state === 'forbidden' ? 'Không được phép thay đổi' : 'Chưa lưu được lịch'} action={refreshAction}>
      {commandStatus.message}
    </Notice>}
    {resource.data?.conflictCount > 0 && <Notice state="warning" title="Cần Staff xử lý xung đột">
      Có buổi đã xác nhận bị ảnh hưởng. Lịch và phân công hiện tại vẫn được giữ nguyên.
    </Notice>}

    <section className="sitter-availability__calendar" aria-labelledby="sitter-calendar-heading">
      <header className="sitter-availability__calendar-heading">
        <div>
          <h2 id="sitter-calendar-heading">Lịch trong 31 ngày</h2>
          <p>{formatSitterCalendarDate(calendarRange.fromLocalDate)} – {formatSitterCalendarDate(calendarRange.toLocalDate)}</p>
        </div>
        <span className="sitter-availability__version">Asia/Saigon</span>
      </header>
      {calendarResource.status === 'loading' && <Notice state="loading" title="Đang tải lịch ngày">Đang lấy ngày có thể nhận việc trong múi giờ Sitter.</Notice>}
      {calendarResource.status === 'pending' && <Notice state="pending" title="Lịch ngày đang chờ tích hợp">API lịch ngày chưa được kết nối. Chưa có ngày rảnh nào được xác nhận.</Notice>}
      {calendarResource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền xem lịch ngày">Chỉ Sitter đang đăng nhập được xem lịch của mình.</Notice>}
      {calendarResource.status === 'error' && <Notice state="error" title="Không tải được lịch ngày"
        action={<Button variant="secondary" onClick={calendarResource.retry}>Thử lại</Button>}>Lịch ngày chưa được tải.</Notice>}
      {calendarResource.status === 'empty' && <Notice state="empty" title="Chưa có ngày rảnh để hiển thị">Hãy kiểm tra lại sau khi lịch được kết nối.</Notice>}
      {calendarResource.status === 'success' && <ol className="sitter-availability__calendar-list">
        {calendarEntries.map(entry => <li className="sitter-availability__calendar-day" key={entry.localDate}>
          <div className="sitter-availability__calendar-day-heading">
            <time dateTime={entry.localDate}>{formatSitterCalendarDate(entry.localDate)}</time>
            <span className={entry.isDayOff ? 'sitter-availability__calendar-state sitter-availability__calendar-state--off'
              : entry.available ? 'sitter-availability__calendar-state sitter-availability__calendar-state--available'
                : 'sitter-availability__calendar-state'}>
              {entry.isDayOff ? 'Ngày nghỉ đã duyệt' : entry.available ? 'Có thể nhận việc' : 'Không nhận việc'}
            </span>
          </div>
          {entry.available && !entry.isDayOff && entry.windows?.length > 0 && <ul className="sitter-availability__calendar-windows">
            {entry.windows.map((window, index) => <li key={`${window.weekday}-${window.startLocalTime}-${index}`}>
              {window.startLocalTime}–{window.endLocalTime}
            </li>)}
          </ul>}
        </li>)}
      </ol>}
      {typeof api?.listCalendar !== 'function' && <p className="sitter-availability__integration-note">
        INTEGRATION_PENDING: P34 cần kết nối API lịch ngày có giới hạn 31 ngày.
      </p>}
    </section>

    <section className="sitter-availability__panel" aria-labelledby="sitter-hours-heading">
      <div className="sitter-availability__panel-heading">
        <div><h2 id="sitter-hours-heading">Giờ có thể nhận việc</h2>
          <p>Khoảng qua nửa đêm được tính sang ngày kế tiếp. Khoảng trùng nhau sẽ bị máy chủ từ chối.</p></div>
        <span className="sitter-availability__version">Phiên bản lịch: {currentVersion}</span>
      </div>
      <form onSubmit={submit}>
        <div className="sitter-availability__window-list">
          {windows.map((window, index) => <fieldset className="sitter-availability__window" key={window.rowId}>
            <legend>Khung giờ {index + 1}</legend>
            <Select label="Ngày trong tuần" value={window.weekday}
              onChange={event => changeWindow(window.rowId, 'weekday', event.target.value)} disabled={fieldsDisabled}>
              {DAYS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
            </Select>
            <Input label="Bắt đầu" type="time" value={window.startLocalTime}
              onChange={event => changeWindow(window.rowId, 'startLocalTime', event.target.value)} required disabled={fieldsDisabled} />
            <Input label="Kết thúc" type="time" value={window.endLocalTime}
              onChange={event => changeWindow(window.rowId, 'endLocalTime', event.target.value)} required disabled={fieldsDisabled} />
            <Button variant="ghost" className="sitter-availability__remove" aria-label={`Xóa khung giờ ${index + 1}`}
              onClick={() => removeWindow(window.rowId)} disabled={fieldsDisabled}>Xóa</Button>
          </fieldset>)}
        </div>
        <div className="sitter-availability__actions">
          <Button variant="secondary" onClick={addWindow} disabled={fieldsDisabled}>Thêm khung giờ</Button>
          <Input label="Áp dụng từ ngày" type="date" value={effectiveFrom}
            onChange={event => { setEffectiveFrom(event.target.value); operation.current = null; setCommandStatus(null); }} required disabled={fieldsDisabled} />
          <Button type="submit" loading={saving} loadingLabel="Đang lưu…" disabled={typeof api?.saveAvailability !== 'function'}>
            {pendingAcknowledgement ? 'Kiểm tra yêu cầu' : 'Lưu lịch'}
          </Button>
        </div>
        {typeof api?.saveAvailability !== 'function' && <p className="sitter-availability__integration-note">
          INTEGRATION_PENDING: route, phiên CSRF và API lưu lịch do P34 tích hợp.
        </p>}
      </form>
    </section>

    <section className="sitter-availability__safety" aria-labelledby="sitter-hours-safety-heading">
      <h2 id="sitter-hours-safety-heading">Thay đổi an toàn</h2>
      <p>Lịch rảnh chỉ giúp tìm ứng viên; thao tác lưu không tạo booking hoặc offer. Buổi đã xác nhận không bị xóa. Nếu lịch mới ảnh hưởng buổi đã nhận, Staff cần xử lý theo chính sách.</p>
      <p>Ngày nghỉ và khu vực phục vụ được lưu như các phần cấu hình riêng; cập nhật giờ không thay đổi hai phần đó.</p>
    </section>
  </section>;
}

export default SitterAvailabilityPage;
