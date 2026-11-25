# Visit Schedule (`UC-28`)

`VisitSchedulePage.jsx` renders the customer-only day-by-day visit schedule at `/account/bookings/:bookingId/visits`.
It reads the owner-scoped booking details from `createServiceBasketApi().booking()`, groups visits by `Asia/Ho_Chi_Minh` date via `utils/visit-schedule-format.js`, highlights today, displays moved-visit original times (`GBR-22`), keeps cancelled visits and cancelled bookings non-interactive, and links each active visit card to Visit Status Tracker (`UC-78`).
