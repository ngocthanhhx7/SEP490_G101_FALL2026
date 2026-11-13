import { useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, Dialog } from '../../components/ui/index.js';
import { bookingChangeDateLabel, bookingChangeError, bookingChangeInputDate, bookingChangeLeadTime, bookingChangePrice,
  bookingChangeSummary, bookingChangeTimeLabel, bookingChangeVisitLabel } from '../../utils/booking-change-format.js';
import './booking-change.css';

const unknownResult = new Set(['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'INVALID_RESPONSE']);

function DateTimeField({ label, type, value, display, onChange }) {
  const id = useId();
  return <label className="booking-change-field" htmlFor={id}>
    <span>{label} *</span>
    <span className="booking-change-field__input">
      <input id={id} className="pwc-control" type={type} value={value} required
        onChange={event => onChange(event.target.value)} />
      <span className="booking-change-field__display" aria-hidden="true">{display}</span>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  </label>;
}

function defaultDate(visit, serverNow) {
  const visitDay = bookingChangeInputDate(visit.startAt);
  const firstNewDay = bookingChangeInputDate(Date.parse(serverNow) + 24 * 3600000);
  return visitDay < firstNewDay ? firstNewDay : visitDay;
}

export function BookingChangeDialog({ booking, options, initialVisitId, api, onClose, onSent }) {
  const formId = useId();
  const selectable = options.visits.filter(visit => visit.canSelect);
  const kept = options.visits.filter(visit => visit.keepsOldTime);
  const first = selectable[0];
  const initialVisit = selectable.find(visit => visit.id === initialVisitId) ?? first;
  const [scope, setScope] = useState(initialVisitId ? 'VISIT' : 'BOOKING');
  const [selectedId, setSelectedId] = useState(initialVisit.id);
  const [date, setDate] = useState(() => defaultDate(initialVisitId ? initialVisit : first, options.serverNow));
  const [times, setTimes] = useState({});
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const operation = useRef(null);
  const selected = selectable.find(visit => visit.id === selectedId) ?? first;
  const single = scope === 'VISIT';
  const slots = single ? [selected.slotNumber] : options.slotNumbers;
  const locked = busy || uncertain;

  function resetFields(visit) {
    setDate(defaultDate(visit, options.serverNow));
    setTimes({});
    setError('');
  }

  function changeScope(value) {
    if (scope === value) return;
    setScope(value);
    resetFields(value === 'VISIT' ? selected : first);
  }

  async function execute() {
    if (inFlight.current || !operation.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await api.submit(options.bookingId, operation.current.body, operation.current.key);
      operation.current = null;
      onSent();
    } catch (error) {
      const retry = unknownResult.has(error.code) || error.status >= 500;
      setUncertain(retry);
      if (!retry) operation.current = null;
      setError(retry ? 'Chưa nhận được xác nhận. Hãy kiểm tra lại cùng yêu cầu.' : bookingChangeError(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (locked || inFlight.current || !date || !slots.length || slots.some(slot => !times[slot])) return;
    const body = single
      ? { scope, visitId: selected.id, startAt: date + 'T' + times[selected.slotNumber] + ':00+07:00' }
      : { scope, firstDay: date, times: slots.map(slot => times[slot]) };
    operation.current = { body, key: globalThis.crypto.randomUUID() };
    void execute();
  }

  return <Dialog open onClose={onClose} dismissible={!locked} className="booking-change-dialog"
    title="Gửi yêu cầu đổi giờ" description={bookingChangeSummary(booking, options)}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={locked}>Quay lại</Button>
      {uncertain ? <Button loading={busy} onClick={execute}>Kiểm tra lại yêu cầu</Button>
        : <Button type="submit" form={formId} loading={busy} disabled={!date || !slots.length || slots.some(slot => !times[slot])}>
          Gửi yêu cầu
        </Button>}
    </>}>
    <form id={formId} onSubmit={submit}>
      <fieldset disabled={locked} className="booking-change-form">
        <div className="booking-change-field">
          <span id={formId + '-scope'}>Đổi giờ cho *</span>
          <div role="group" aria-labelledby={formId + '-scope'} className="booking-change-scope">
            <button type="button" aria-pressed={!single} onClick={() => changeScope('BOOKING')}>Cả lịch đặt</button>
            <button type="button" aria-pressed={single} onClick={() => changeScope('VISIT')}>Một buổi</button>
          </div>
        </div>
        {single ? <label className="booking-change-field">
          <span>Buổi cần đổi *</span>
          <span className="booking-change-field__select">
            <select className="pwc-control" value={selected.id} required onChange={event => {
              const visit = selectable.find(item => item.id === event.target.value);
              if (visit) { setSelectedId(visit.id); resetFields(visit); }
            }}>
              {selectable.map(visit => <option key={visit.id} value={visit.id}>{bookingChangeVisitLabel(visit)}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </label> : kept.length > 0 && <section className="booking-change-kept">
          <strong>Giữ giờ cũ</strong>
          <ul>{kept.map(visit => <li key={visit.id}>{bookingChangeVisitLabel(visit)}</li>)}</ul>
        </section>}
        <div className="booking-change-fields">
          <DateTimeField label={single ? 'Ngày mới' : 'Ngày đầu mới'} type="date" value={date}
            display={bookingChangeDateLabel(date)} onChange={value => { setDate(value); setError(''); }} />
          {slots.map(slot => <DateTimeField key={slot} label={single ? 'Giờ mới' : 'Giờ mới buổi ' + slot}
            type="time" value={times[slot] ?? ''} display={bookingChangeTimeLabel(date, times[slot], single ? selected : null)}
            onChange={value => { setTimes(previous => ({ ...previous, [slot]: value })); setError(''); }} />)}
        </div>
      </fieldset>
      {error && <p className="booking-change-error" role="alert">{error}</p>}
      <div className="booking-change-price">
        <strong>{bookingChangePrice(single ? [selected] : selectable)}</strong>
        <p>{bookingChangeLeadTime} Mỗi buổi chỉ đổi giờ được một lần.</p>
      </div>
      <p className="booking-change-deadline">Nhân viên trả lời trước giờ cũ hoặc giờ mới 6 giờ (giờ nào đến trước). Nếu không có trả lời, buổi giữ giờ cũ và bạn được báo.</p>
    </form>
  </Dialog>;
}
