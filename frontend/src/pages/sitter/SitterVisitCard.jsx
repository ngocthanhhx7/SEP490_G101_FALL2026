import { ArrowRight, Clock3, PawPrint } from 'lucide-react';
import { Link } from 'react-router-dom';
import './sitter-workspace.css';

const clock = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', day: 'numeric', month: 'numeric' });
const labels = { ASSIGNED: 'Đã nhận ca', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Đã hoàn thành',
  STAFF_CLOSED: 'Đã đóng ca', CANCELLED: 'Đã hủy', SUPERSEDED: 'Đã thay thế' };

export function SitterVisitCard({ visit, back, primary = false }) {
  const start = new Date(visit.startsAt);
  const end = visit.endsAt ? new Date(visit.endsAt) : null;
  const validStart = visit.startsAt && Number.isFinite(start.getTime());
  const validEnd = end && Number.isFinite(end.getTime());
  const sameDay = validStart && validEnd && day.format(start) === day.format(end);
  const service = visit.serviceDisplayName?.trim() || visit.serviceName?.trim();
  const place = { HOME: 'Tại nhà', FACILITY: 'Tại trung tâm', OUTDOOR: 'Ngoài trời' }[visit.location];
  return <article className="sitter-visit-card">
    <div className="sitter-visit-card__top">
      <h3>{service || 'Chưa rõ dịch vụ'}</h3>
      <span className="sitter-visit-card__status" data-state={visit.state}>{labels[visit.state] ?? 'Đang cập nhật'}</span>
    </div>
    {validStart && <div className="sitter-visit-card__meta">
      <Clock3 size={17} aria-hidden="true" />
      <span><time dateTime={visit.startsAt}>{clock.format(start)} · {day.format(start)}</time>
        {validEnd && <> – <time dateTime={visit.endsAt}>{clock.format(end)}{!sameDay && ' · ' + day.format(end)}</time></>}
      </span>
    </div>}
    {visit.petNames?.length > 0 && <div className="sitter-visit-card__meta"><PawPrint size={17} aria-hidden="true" /><span>{visit.petNames.join(', ')}</span></div>}
    {visit.state === 'ASSIGNED' && visit.handoverPending === true &&
      <Link className="sitter-workspace-link" to={'/sitter/visits/' + visit.id + '/handover'}>Cần xác nhận bàn giao</Link>}
    <div className="sitter-visit-card__footer">
      {place && <span className="sitter-visit-card__place">{place}</span>}
      <Link className={primary ? 'pwc-compact-cta' : 'sitter-workspace-link'} to={'/sitter/visits/' + visit.id} state={{ mobileBack: back }}>
        {visit.state === 'IN_PROGRESS' ? 'Tiếp tục ca' : 'Xem buổi chăm sóc'} <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </div>
  </article>;
}
