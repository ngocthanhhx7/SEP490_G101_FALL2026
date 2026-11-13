# Complaints

Complaints implements UC-52 and UC-53 for at-home visits, plus the complaint proposal decision contract of UC-51. The finance source runtime mounts the router when auth, MongoDB and `FINANCE_SOURCES_ENABLED=true` are available. The existing `cases` collection stores complaints. The module uses the booking guard, transaction, scoped media, audit and command storage from the existing runtime. It does not require a data migration.

## Lifecycle and access

- Customer submission targets `VISIT` or `BOOKING`. A visit must count as done. For `STAFF_CLOSED`, the server checks the visit's check-in reference and corresponding READY private photo bound to that visit. A booking must have ended, and an all-cancelled booking needs a positive issued bill. The server checks the seven-day limit and one case per scope until finality.
- Staff and Admin can resolve an `OPEN` case. A money proposal keeps it `OPEN` until an Admin decides. Publishing a result saves `resultDeliveredAt` and a 72-hour `appealUntil` in the same transaction as the in-app notification. An objection clears the cutoff and sets `ESCALATED`. The Admin's final decision sets `RESOLVED` and saves `finalAt`. A result with no objection becomes final at the saved cutoff, which reads expose as `finalAt`.
- Customer projections exclude handling notes, proposal reasons and Staff evidence. Authorized Staff and Admin can read attached private photos via the complaint. Customer and Staff uploads use the existing private-image endpoint and accept PNG/JPEG up to 5 MiB, subject to its per-account quota and the 20-reference limit per set.
- Pet Sitters retain the legacy visit-only GET projection for their assigned visit. Earlier cases keep their IDs and history. A legacy `UNDER_REVIEW` record reads as `OPEN` or `ESCALATED` according to its recorded objection. A legacy closed decision with a recorded time reads as final. Cases with no reliable finality data stay pending for review.

## HTTP interface

All paths below use `/api/v1/complaints`. Writes require a session, CSRF, an `Idempotency-Key` and the current `expectedVersion` for a case update. Submit optionally accepts the version of its booking or visit. Non-owners receive 404 on record access.

| Path | Role and result |
| --- | --- |
| `GET /eligibility/bookings/:bookingId` | Owner. Booking, whole-booking and visit eligibility, reasons, deadlines and versions. A visit includes `customerVisitId` when available so Booking Details can locate its booked row. |
| `POST /` | Owner. `scope`, `bookingId`, `visitId` for a visit, `description` and optional `evidenceRefs`. Returns 201 and MSG128. `POST /visits/:visitId` remains an alias. |
| `GET /`, `GET /:complaintId` | Scoped list and detail. Staff/Admin list supports `state`, `q`, `sort`, `limit`, `cursor` and per-tab counts. |
| `POST /:complaintId/resolution` | Staff/Admin. `handlingNotes`, `customerResult` and optional `proposal {amountVnd,reason,evidenceRefs}`. Returns MSG131 or MSG147. |
| `POST /:complaintId/objections` | Owner. Required `reason`, returns MSG129. |
| `GET /refund-proposals`, `GET /:complaintId/refund-proposal` | Admin. Pending list and proposal detail, including the authoritative bill basis when available. |
| `POST /:complaintId/refund-decision` | Admin. `outcome` of `APPROVE`, `REDUCE` or `REJECT`. `amountVnd` is required to reduce and `reason` is required to reject. |
| `POST /:complaintId/decision` | Admin. `customerResult` and optional `amountVnd` for the final decision on an escalated case. |
| `GET /:complaintId/evidence/:mediaId/content` | Owner for own photos, or Staff/Admin for case evidence. Requires configured private media. |

`VALIDATION_FAILED` with a missing required field maps to MSG01, `COMPLAINT_WINDOW_EXPIRED` to MSG41, `COMPLAINT_ALREADY_OPEN` to MSG42, and `REFUND_CAP_EXCEEDED` to MSG44. An empty management list maps to MSG130 in the UI.

## Booking Payment and JOB-03 handoff

`billState` records whether the complaint is holding the bill. The booking lifecycle state is stored in `booking.state`.

`app.locals.complaintBilling.readBookingComplaintHold({ bookingId, asOf, session? })` provides `hasUnfinalizedComplaints`, effective `billState`, `latestFinalAt` and approved complaint adjustment references. Pass the active MongoDB session to share a transaction. Consumers combine this result with incident finality and the authoritative bill before taking action. An open complaint persists `billState: 'ON_HOLD'` in its own case. The effective hold expires at the recorded finality time. The module leaves `booking.state`, payment deadlines and issued bills to their owners.

The optional billing port is absent from runtime composition. Its transactional `read({bookingId, session})` must return the issued or expected basis before approved amounts, the total of already approved amounts for the booking including incidents, and the verified paid status. For an issued bill it also supplies its current `billTotalVnd`. The port's `applyAdjustment` must durably apply a bill credit or record a refund for accounting, idempotently by reference and in the same session. Until supplied, affected writes return `503 BILLING_SOURCE_UNAVAILABLE`, and detail/eligibility reads identify unavailable data without inventing a bill. Approval fixtures run only in tests.

Employee commission and legacy earning source reads recognize the new complaint records and their finality. Previously written legacy partner ledger locks still need an audited release on the explicit Admin path or a separate expiration integration for a result that became final automatically.
