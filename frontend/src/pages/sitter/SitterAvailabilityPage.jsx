import { Copy, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Notice, Select } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import './sitter-availability.css';
import { timelineMinute } from '../../components/calendar/CalendarTimeline.jsx';
import { WeekCalendar } from '../../components/calendar/WeekCalendar.jsx';
import { addCalendarDays, calendarDateLabel, vietnamDate } from '../../utils/calendar-date.js';
import { SitterDayOriginForm } from './SitterDayOriginForm.jsx';

const DAYS = [
  { value: 1, label: 'Thứ Hai' }, { value: 2, label: 'Thứ Ba' }, { value: 3, label: 'Thứ Tư' },
  { value: 4, label: 'Thứ Năm' }, { value: 5, label: 'Thứ Sáu' }, { value: 6, label: 'Thứ Bảy' },
  { value: 7, label: 'Chủ Nhật' }
];

const maxWindows = 14;
const weekdayOf = date => new Date(date + 'T12:00:00Z').getUTCDay() || 7;

function windowBlock(row, key, onOpen) {
  if (!row.startLocalTime || !row.endLocalTime || row.startLocalTime === row.endLocalTime) return [];
  const start = timelineMinute(row.startLocalTime);
  const end = timelineMinute(row.endLocalTime);
  return [{ key, start, end: end < start ? 1440 : end,
    label: row.startLocalTime + '–' + row.endLocalTime + (end < start ? ' hôm sau' : ''),
    detail: row.workLocation === 'SHOP' ? 'Tại cửa hàng' : 'Tại nhà khách',
    kind: row.workLocation === 'SHOP' ? 'shop' : 'work', onOpen }];
}

const formatSitterCalendarDate = date => calendarDateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' });

export function getSitterCalendarRange(now = new Date()) {
  const fromLocalDate = vietnamDate(now);
  return { fromLocalDate, toLocalDate: addCalendarDays(fromLocalDate, 30) };
}

function newOperationKey() {
  const source = globalThis.crypto;
  if (!source?.getRandomValues) throw new Error('Secure operation keys are unavailable');
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function messageFor(error) {
  if (error?.code === 'CONTRACT_REQUIRED') return 'Chưa có hợp đồng đã được Admin xác minh bao phủ ngày áp dụng. Hãy liên hệ Admin để xác minh hợp đồng, sau đó lưu lại lịch.';
  if (error?.code === 'SITTER_NOT_ELIGIBLE') return 'Tài khoản Pet Sitter chưa đủ điều kiện hoạt động. Hãy liên hệ Admin kiểm tra trạng thái hồ sơ.';
  if (error?.code === 'AVAILABILITY_WINDOW_OVERLAP') return 'Hai khung giờ bị trùng. Kiểm tra cả phần qua nửa đêm của ngày trước.';
  if (error?.status === 422) return 'Kiểm tra ngày áp dụng và các khung giờ đã nhập trước khi lưu lại.';
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
  const [today] = useState(() => vietnamDate(now));
  const [view, setView] = useState(() => typeof api?.listCalendar === 'function' ? 'calendar' : 'hours');
  const [originOpened, setOriginOpened] = useState(false);
  const [calendarDay, setCalendarDay] = useState(today);
  const [editorDay, setEditorDay] = useState(today);
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
  const nextWindowId = useRef(0);

  useEffect(() => {
    if (!resource.data || typeof resource.data !== 'object') return;
    setWindows((resource.data.workingWindows ?? []).map((window, index) => ({ ...window, rowId: `saved-${index}` })));
    const contractStart = resource.data.registrationContract?.state === 'UPCOMING'
      ? vietnamDate(new Date(resource.data.registrationContract.effectiveAt)) : today;
    setEffectiveFrom([resource.data.effectiveFrom ?? today, contractStart, today].sort().at(-1));
  }, [resource.data, today]);

  const currentVersion = Number.isSafeInteger(resource.data?.expectedVersion) ? resource.data.expectedVersion : 0;
  const pendingAcknowledgement = commandStatus?.state === 'pending';
  const fieldsDisabled = saving || pendingAcknowledgement;
  const normalizedWindows = useMemo(() => windows.map(({ weekday, startLocalTime, endLocalTime, workLocation }) => ({
    weekday: Number(weekday), startLocalTime, endLocalTime, ...(workLocation === 'SHOP' ? { workLocation } : {})
  })), [windows]);

  function changeWindow(rowId, field, value) {
    setWindows(rows => rows.map(row => row.rowId === rowId ? { ...row, [field]: field === 'weekday' ? Number(value) : value } : row));
    operation.current = null;
    setCommandStatus(null);
  }

  function focusWindow(rowId) {
    globalThis.requestAnimationFrame?.(() => {
      globalThis.document.getElementById('availability-' + rowId)?.querySelector('input[type="time"]')?.focus();
    });
  }

  function addWindow(weekday, startLocalTime = '09:00', endLocalTime = '17:00') {
    const row = { rowId: `new-${nextWindowId.current++}`, weekday, startLocalTime, endLocalTime };
    setWindows(rows => [...rows, row]);
    operation.current = null;
    setCommandStatus(null);
    focusWindow(row.rowId);
  }

  function draftEvents(date) {
    const weekday = weekdayOf(date);
    const previous = weekday === 1 ? 7 : weekday - 1;
    return windows.flatMap(window => {
      const opener = () => focusWindow(window.rowId);
      if (weekday === window.weekday) return windowBlock(window, window.rowId, opener);
      if (previous !== window.weekday || !window.endLocalTime || window.endLocalTime === '00:00'
        || window.endLocalTime >= window.startLocalTime) return [];
      return windowBlock({ ...window, startLocalTime: '00:00' }, window.rowId, opener);
    });
  }

  function copyToEmptyWeekdays(dayWindows, targetDays) {
    const newRows = targetDays.flatMap(({ value }) => dayWindows.map(row => ({
      ...row, rowId: `new-${nextWindowId.current++}`, weekday: value
    })));
    setWindows(rows => [...rows, ...newRows]);
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
  const calendarEntry = calendarEntries.find(entry => entry.localDate === calendarDay);
  const markedDays = new Set(calendarEntries.filter(entry => entry.available && !entry.isDayOff).map(entry => entry.localDate));
  const emptyWeekdays = DAYS.filter(({ value }) => value <= 5 && !windows.some(window => window.weekday === value));
  return <section className="sitter-availability">
    <header className="sitter-availability__header">
      <h1 data-duplicate-title>Giờ nhận việc</h1>
      {resource.data?.registrationContract?.state === 'UPCOMING' && <Notice state="pending" title="Hợp đồng đã ký, sắp có hiệu lực">
        Đăng ký lịch áp dụng từ {vietnamDate(new Date(resource.data.registrationContract.effectiveAt))}. Ca chăm sóc vẫn phải nằm trong thời hạn hợp đồng và năng lực đã được xác minh.
      </Notice>}

      <nav className="sitter-availability__jump" aria-label="Cài đặt lịch">
        {[['calendar', 'Lịch đã lưu'], ['hours', 'Chỉnh giờ hằng tuần'], ...(api?.getOrigins ? [['origin', 'Điểm xuất phát']] : [])].map(([key, label]) =>
          <button type="button" key={key} aria-pressed={view === key} onClick={() => {
            setView(key);
            if (key === 'origin') setOriginOpened(true);
          }}>{label}</button>)}
      </nav>
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

    <section hidden={view !== 'calendar'} className="sitter-availability__calendar" aria-labelledby="sitter-calendar-heading">
      <header className="sitter-availability__calendar-heading">
        <div>
          <h2 id="sitter-calendar-heading">Lịch trong 31 ngày</h2>
          <p>{formatSitterCalendarDate(calendarRange.fromLocalDate)} – {formatSitterCalendarDate(calendarRange.toLocalDate)}</p>
        </div>
        <span className="sitter-availability__version">Giờ Việt Nam</span>
      </header>
      {calendarResource.status === 'loading' && <Notice state="loading" title="Đang tải lịch ngày">Đang lấy ngày có thể nhận việc trong múi giờ Sitter.</Notice>}
      {calendarResource.status === 'pending' && <Notice state="pending" title="Lịch ngày đang chờ tích hợp">API lịch ngày chưa được kết nối. Chưa có ngày rảnh nào được xác nhận.</Notice>}
      {calendarResource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền xem lịch ngày">Chỉ Sitter đang đăng nhập được xem lịch của mình.</Notice>}
      {calendarResource.status === 'error' && <Notice state="error" title="Không tải được lịch ngày"
        action={<Button variant="secondary" onClick={calendarResource.retry}>Thử lại</Button>}>Lịch ngày chưa được tải.</Notice>}
      {calendarResource.status === 'empty' && <Notice state="empty" title="Chưa có ngày rảnh để hiển thị">Hãy kiểm tra lại sau khi lịch được kết nối.</Notice>}
      {calendarResource.status === 'success' && <>
        <WeekCalendar monthOverview label="Lịch trong 31 ngày" value={calendarDay} today={today} min={calendarRange.fromLocalDate}
          max={calendarRange.toLocalDate} markedDays={markedDays} markLabel="có thể nhận việc" onChange={setCalendarDay}
          timeline={{ label: 'Khung giờ đã lưu', eventsFor: date => {
            const row = calendarEntries.find(entry => entry.localDate === date);
            if (row?.isDayOff) return [{ key: date, start: 0, end: 1440, label: 'Ngày nghỉ đã duyệt', kind: 'off' }];
            return row?.available ? row.windows?.flatMap((window, index) => windowBlock(window, index)) : [];
          } }} />
        {calendarEntry ? <div className="sitter-availability__calendar-day" aria-live="polite">
          <div className="sitter-availability__calendar-day-heading">
            <time dateTime={calendarEntry.localDate}>{formatSitterCalendarDate(calendarEntry.localDate)}</time>
            <span className={calendarEntry.isDayOff ? 'sitter-availability__calendar-state sitter-availability__calendar-state--off'
              : calendarEntry.available ? 'sitter-availability__calendar-state sitter-availability__calendar-state--available'
                : 'sitter-availability__calendar-state'}>
              {calendarEntry.isDayOff ? 'Ngày nghỉ đã duyệt' : calendarEntry.available ? 'Có thể nhận việc' : 'Không nhận việc'}
            </span>
          </div>
          {calendarEntry.available && !calendarEntry.isDayOff && calendarEntry.windows?.length > 0 && <ul className="sitter-availability__calendar-windows">
            {calendarEntry.windows.map((window, index) => <li key={`${window.weekday}-${window.startLocalTime}-${index}`}>
              {window.startLocalTime}–{window.endLocalTime}
            </li>)}
          </ul>}
        </div> : <p className="sitter-availability__no-day" role="status">Chưa có dữ liệu lịch cho ngày này.</p>}
      </>}
      {typeof api?.listCalendar !== 'function' && <p className="sitter-availability__integration-note">
        INTEGRATION_PENDING: P34 cần kết nối API lịch ngày có giới hạn 31 ngày.
      </p>}
    </section>

    <section hidden={view !== 'hours'} className="sitter-availability__panel" aria-labelledby="sitter-hours-heading">
      <div className="sitter-availability__panel-heading">
        <div><h2 id="sitter-hours-heading" tabIndex={-1}>Giờ có thể nhận việc</h2>
          <p>Lịch lặp hằng tuần. Giờ kết thúc sớm hơn giờ bắt đầu được tính sang ngày hôm sau.</p></div>
        <span className="sitter-availability__version">{windows.length}/{maxWindows} khung giờ</span>
      </div>
      <form onSubmit={submit}>
        <div className="sitter-availability__actions">
          <Input label="Áp dụng từ ngày" type="date" value={effectiveFrom} min={today}
            onChange={event => { setEffectiveFrom(event.target.value); operation.current = null; setCommandStatus(null); }} required disabled={fieldsDisabled} />
          <Button type="submit" loading={saving} loadingLabel="Đang lưu…" disabled={typeof api?.saveAvailability !== 'function'}>
            {pendingAcknowledgement ? 'Kiểm tra yêu cầu' : 'Lưu lịch'}
          </Button>
        </div>
        <p className="sitter-availability__edit-hint">Bấm ô giờ để thêm khung một tiếng. Bấm một khung đã có để chỉnh giờ và nơi làm việc.</p>
        <WeekCalendar recurring label="Chỉnh lịch lặp hằng tuần" today={today} value={editorDay} onChange={setEditorDay}
          timeline={{
            label: 'Thêm khung giờ trên lịch', eventsFor: draftEvents,
            canPick: () => !fieldsDisabled && windows.length < maxWindows,
            onPick: (date, hour) => {
              setEditorDay(date);
              const nextHour = String((Number(hour.slice(0, 2)) + 1) % 24).padStart(2, '0') + hour.slice(2);
              addWindow(weekdayOf(date), hour, nextHour);
            }
          }} />
        <div className="sitter-availability__window-list">
          {DAYS.map(({ value, label }) => {
            const dayWindows = windows.filter(window => window.weekday === value);
            const canCopy = dayWindows.length > 0 && emptyWeekdays.length > 0
              && windows.length + dayWindows.length * emptyWeekdays.length <= maxWindows;
            return <section key={value} className="sitter-availability__weekday" aria-label={label}>
              <div className="sitter-availability__weekday-header">
                <h3>{label}</h3>
                {!dayWindows.length && <span>Không nhận việc</span>}
                {canCopy && <Button variant="ghost" title="Chép sang các ngày thứ Hai đến thứ Sáu chưa có giờ"
                  onClick={() => copyToEmptyWeekdays(dayWindows, emptyWeekdays)} disabled={fieldsDisabled}
                  aria-label={`Chép giờ ${label} sang ngày trong tuần chưa có lịch`}><Copy size={16} aria-hidden="true" /> Chép giờ</Button>}
                <Button variant="ghost" onClick={() => addWindow(value)} disabled={fieldsDisabled || windows.length >= maxWindows}
                  aria-label={`Thêm khung giờ ${label}`}><Plus size={17} aria-hidden="true" /> Thêm giờ</Button>
              </div>
              {dayWindows.map((window, index) => <fieldset className="sitter-availability__window" id={'availability-' + window.rowId} key={window.rowId}>
                <legend>Khung giờ {index + 1}</legend>
                <Select label="Ngày trong tuần" value={window.weekday}
                  onChange={event => changeWindow(window.rowId, 'weekday', event.target.value)} disabled={fieldsDisabled}>
                  {DAYS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
                </Select>
                <Input label="Bắt đầu" type="time" value={window.startLocalTime}
                  onChange={event => changeWindow(window.rowId, 'startLocalTime', event.target.value)} required disabled={fieldsDisabled} />
                <Input label="Kết thúc" type="time" value={window.endLocalTime}
                  onChange={event => changeWindow(window.rowId, 'endLocalTime', event.target.value)} required disabled={fieldsDisabled} />
                <Select label="Nơi làm việc" value={window.workLocation ?? 'HOME'}
                  onChange={event => changeWindow(window.rowId, 'workLocation', event.target.value)} disabled={fieldsDisabled}>
                  <option value="HOME">Chăm sóc tại nhà khách</option><option value="SHOP">Tại cửa hàng</option>
                </Select>
                <Button variant="ghost" className="sitter-availability__remove" aria-label={`Xóa khung giờ ${index + 1} ${label}`}
                  onClick={() => removeWindow(window.rowId)} disabled={fieldsDisabled}>Xóa</Button>
              </fieldset>)}
            </section>;
          })}
        </div>
        {typeof api?.saveAvailability !== 'function' && <p className="sitter-availability__integration-note">
          INTEGRATION_PENDING: route, phiên CSRF và API lưu lịch do P34 tích hợp.
        </p>}
      </form>
    </section>

    {originOpened && api?.getOrigins && <div hidden={view !== 'origin'}><SitterDayOriginForm api={api} /></div>}
    <details className="sitter-availability__safety"><summary>Khi thay đổi lịch</summary>
      <p>Lịch rảnh chỉ giúp tìm ứng viên; thao tác lưu không tạo booking hoặc offer. Buổi đã xác nhận không bị xóa. Nếu lịch mới ảnh hưởng buổi đã nhận, Staff cần xử lý theo chính sách.</p>
      <p>Hợp đồng ghi thời gian tối thiểu: toàn thời gian 40 giờ/tuần, bán thời gian 20 giờ/tuần. Lịch nhận việc không dùng để chấm công hoặc tự động trừ lương.</p>
      <p>Ngày nghỉ và khu vực phục vụ được lưu như các phần cấu hình riêng; cập nhật giờ không thay đổi hai phần đó.</p>
    </details>
  </section>;
}

export default SitterAvailabilityPage;
