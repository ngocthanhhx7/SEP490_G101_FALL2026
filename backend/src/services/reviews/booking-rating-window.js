export const RATING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// GBR-48: a booking ends when its last visit is finished (completedAt) or, after
// a cancelled visit, when the booking is closed.
export function bookingEndedAt(booking) {
  return booking?.completedAt ?? (booking?.state === 'CLOSED' ? booking.closedAt ?? null : null);
}
