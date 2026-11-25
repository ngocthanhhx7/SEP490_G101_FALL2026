import { Scissors } from 'lucide-react';
import { Button } from '../ui/index.js';
import { GROOMING_STATUS_LABELS } from '../../constants/grooming-messages.js';
import './grooming-upcoming.css';

function formatAppointmentTime(slot) {
  const [year, month, day] = slot.localDate.split('-');
  return `${slot.startLocalTime} · ${day}/${month}/${year}`;
}

function summarizeGrooming(appointment) {
  const petNames = appointment.pets.map(pet => pet.name).filter(Boolean);
  const serviceNames = [...new Set(appointment.pets.flatMap(pet => pet.services.map(service => service.name)).filter(Boolean))];
  return {
    serviceLabel: serviceNames.length ? serviceNames.join(', ') : 'Dịch vụ spa tại cửa hàng',
    petLabel: petNames.join(', '),
    timeLabel: formatAppointmentTime(appointment.slot),
    statusLabel: GROOMING_STATUS_LABELS[appointment.status] ?? appointment.status
  };
}

export function GroomingUpcomingRow({ appointment, variant = 'desktop', busy = false, inlineError = '', onCancel }) {
  const { serviceLabel, petLabel, timeLabel, statusLabel } = summarizeGrooming(appointment);
  const canTryCancel = appointment.status === 'BOOKED';

  if (variant === 'mobile') {
    return <li className="grooming-upcoming-mobile-row" data-grooming-id={appointment.id}>
      <strong>{serviceLabel} · Tại cửa hàng</strong>
      {petLabel && <p>Thú cưng: {petLabel}</p>}
      <p>
        <time dateTime={appointment.slot.startAt}>{timeLabel}</time> · {statusLabel}
      </p>
      <p className="grooming-upcoming__code">Mã lịch {appointment.code}</p>
      {canTryCancel && <div className="grooming-upcoming-mobile-row__actions">
        <Button variant="secondary" type="button" disabled={busy} onClick={() => onCancel(appointment)}>
          Huỷ lịch
        </Button>
      </div>}
      {inlineError && <p className="grooming-upcoming__inline-error" role="alert">{inlineError}</p>}
    </li>;
  }

  return <li className="customer-home__grooming-item" data-grooming-id={appointment.id}>
    <span className="customer-home__visit-icon customer-home__visit-icon--grooming"><Scissors size={20} aria-hidden="true" /></span>
    <div className="customer-home__grooming-body">
      <strong>{serviceLabel}</strong>
      <p className="customer-home__grooming-meta">
        <span>Tại cửa hàng · {appointment.code}</span>
        {petLabel && <span>Thú cưng: {petLabel}</span>}
      </p>
      <time dateTime={appointment.slot.startAt}>{timeLabel}</time>
      {inlineError && <p className="grooming-upcoming__inline-error" role="alert">{inlineError}</p>}
    </div>
    <span className={`customer-home__status customer-home__status--${appointment.status}`}>{statusLabel}</span>
    <div className="customer-home__grooming-actions">
      {canTryCancel && <Button variant="secondary" type="button" disabled={busy} onClick={() => onCancel(appointment)}>
        Huỷ lịch
      </Button>}
    </div>
  </li>;
}
