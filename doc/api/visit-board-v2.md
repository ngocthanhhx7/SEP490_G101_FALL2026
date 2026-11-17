# Operational visit board

Staff/Admin only, authenticated private no-store responses. Existing CSRF and
Idempotency-Key requirements apply to decisions. Customer and sitter cannot read
operational lists, private contact directories or decision screens.

- `GET /api/v1/employee-scheduling/visit-board`: `tab=needs-action|all`, optional
  `search` (2–50 characters), `areaCode`, `reason`, `cursor`. Both tabs return up
  to 50 rows, `nextCursor`, `hasMore`, `asOf` and exact unfiltered Needs action
  counts. Cursors bind actor/tab/search/area/reason and reference time; expire
  after 15 minutes. Refresh to include newly actionable work. No per-reason
  500-row truncation or 20-person search truncation. Query deadline failures are
  errors, never silently partial lists.
- `GET /api/v1/employee-scheduling/visits/:id/dispatch`: authoritative scoped
  detail for a scheduled dispatch visit, independent of the first queue page.
  Ineligible booking/payment states are unavailable; read does not assign anyone.
- `GET /api/v1/employee-scheduling/visits/:id/withdrawal-review`: current pending
  late withdrawal details and visit version. Stale/no-longer-pending returns409.
- `POST /api/v1/employee-scheduling/visits/:id/withdrawal-decisions`: body contains
  `expectedVersion`, `decision` (`RELEASE` or `REJECT`), and mandatory `reason`
  (maximum 1000 characters). Same-key replay returns its committed result;
  different content conflicts. Check-in/concurrent decisions conflict atomically.

Release removes the current assignment, records the previous employee for
handover/replacement, revokes pending offers and returns to dispatch. A directed
booking retains the named employee until an explicit customer-confirmed
replacement; no implicit alternative or customer cancellation. Reject keeps the
assignment. Neither decision changes prices, taxes, payments or employee base
wages. Operational decisions/events/notifications use existing collections.
