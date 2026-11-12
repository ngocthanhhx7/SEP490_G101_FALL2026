export function readStaffBooking(request, bookingId, { signal } = {}) {
  return request(`/staff/bookings/${encodeURIComponent(bookingId)}`, { signal });
}
