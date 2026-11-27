import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button, Dialog } from '../../components/ui/index.js';
import { RATING_SAVED } from '../../constants/booking-messages.js';
import { VerifiedVisitRating } from './VerifiedVisitRating.jsx';

// GBR-48: one rating for each pet sitter who finished a visit of the booking,
// until the rating deadline that the server returns for an ended booking.
export function BookingSitterRatings({ api, booking }) {
  const [open, setOpen] = useState(null), [rated, setRated] = useState([]);
  const deadline = booking.ratingDeadlineAt;
  if (!deadline || new Date() > new Date(deadline)) return null;
  const finished = (booking.careShifts ?? []).filter(row => row.sitterId && row.state === 'COMPLETED');
  const waiting = [...new Map(finished.map(row => [row.sitterId, row])).values()]
    .filter(row => !booking.ratedSitterIds?.includes(row.sitterId) && !rated.includes(row.sitterId));
  if (!waiting.length && !rated.length) return null;
  return <section aria-label="Đánh giá sau lịch đặt">
    {waiting.map(row => <p key={row.sitterId}>
      <Button type="button" onClick={() => setOpen(row)}><Star size={16} />Đánh giá người chăm sóc{row.sitterName ? `: ${row.sitterName}` : ''}</Button>
    </p>)}
    {rated.length > 0 && <p role="status">{RATING_SAVED}</p>}
    <Dialog open={Boolean(open)} onClose={() => setOpen(null)} title="Đánh giá người chăm sóc" closeLabel="Để sau">
      {open && <VerifiedVisitRating key={open.sitterId} api={api} visit={open} deadline={deadline}
        onSaved={() => { setRated(current => [...current, open.sitterId]); setOpen(null); }} />}
    </Dialog>
  </section>;
}
