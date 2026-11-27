export function readStaffBooking(request, bookingId, { signal } = {}) {
  return request(`/staff/bookings/${encodeURIComponent(bookingId)}`, { signal });
}

export function recordVisitPickup(request, bookingId, visitId, action) {
  return request(`/staff/bookings/${encodeURIComponent(bookingId)}/visits/${encodeURIComponent(visitId)}/pickup/${encodeURIComponent(action)}`, { method: 'POST' });
}
