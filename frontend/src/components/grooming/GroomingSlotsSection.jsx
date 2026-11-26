import { useState } from 'react';
import { GroomingChip } from './GroomingChip.jsx';
import { WeekCalendar } from '../calendar/WeekCalendar.jsx';
import { msg152 } from '../../constants/grooming-messages.js';

// Step 3: a day of the seven-day window and a free time slot. A full or pet-conflicting slot is greyed out.
export function GroomingSlotsSection({ options, date, time, slots, hasPets, onDate, onTime, onRetry }) {
  const [focusedConflict, setFocusedConflict] = useState(null);
  const conflictedSlots = slots.status === 'success'
    ? slots.items.filter(slot => slot.state === 'PET_ALREADY_BOOKED' && slot.conflictPetName)
    : [];
  const activeConflict = conflictedSlots.find(slot => slot.startAt === focusedConflict) ?? conflictedSlots[0] ?? null;

  return <section className="grooming-card" aria-labelledby="grooming-slots">
    <h2 id="grooming-slots">3. Chọn giờ hẹn</h2>
    <p>Chỉ hiện giờ có người chăm sóc biết tắm và cắt tỉa đang trong ca ở cửa hàng.</p>
    <WeekCalendar label="Ngày hẹn tại cửa hàng" value={date} min={options.window.firstDate} max={options.window.lastDate}
      onChange={nextDate => { setFocusedConflict(null); onDate(nextDate); }} />
    {!hasPets && <p className="grooming-hint">Chọn thú cưng và dịch vụ để xem giờ hẹn.</p>}
    {hasPets && slots.status === 'loading' && <p role="status" className="grooming-hint">Đang tải giờ hẹn…</p>}
    {hasPets && slots.status === 'error' && <p role="alert" className="grooming-inline">Chưa tải được giờ hẹn. <button type="button" onClick={onRetry}>Thử lại</button></p>}
    {hasPets && slots.status === 'success' && !slots.items.length && <p role="status" className="grooming-hint">Không còn giờ hẹn nào trong ngày này. Hãy chọn ngày khác.</p>}
    {hasPets && slots.status === 'success' && slots.items.length > 0 && <>
      <div className="grooming-chips" role="radiogroup" aria-label="Giờ hẹn">
        {slots.items.map(slot => {
          const isPetBooked = slot.state === 'PET_ALREADY_BOOKED';
          const suffix = slot.state === 'AVAILABLE' ? '' : isPetBooked ? ' · đã có lịch' : ' · đã kín';
          return <GroomingChip key={slot.startAt} type="radio" name="grooming-time" checked={time === slot.startAt && slot.state === 'AVAILABLE'}
            disabled={slot.state !== 'AVAILABLE'} onChange={() => onTime(slot.startAt)}
            onClick={isPetBooked ? () => setFocusedConflict(slot.startAt) : undefined}
            onMouseEnter={isPetBooked ? () => setFocusedConflict(slot.startAt) : undefined}>
            {slot.time}{suffix}
          </GroomingChip>;
        })}
      </div>
      {activeConflict && <p role="alert" className="grooming-inline">{msg152(activeConflict.conflictPetName)}</p>}
    </>}
  </section>;
}
