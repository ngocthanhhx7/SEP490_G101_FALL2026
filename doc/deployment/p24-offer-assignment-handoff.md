# P24 — Offer, assignment, withdrawal and reassignment handoff

## Scope

- WBS-031 My Assignments: `backend/src/services/sitter-offer.service.js`, `frontend/src/pages/sitter/SitterAssignmentsPage.jsx` and the Sitter operations adapter.
- WBS-032 Reassign Pet Sitter: `backend/src/services/visit-reassignment.service.js` and the `POST /visits/{id}/reassignments` route contract.
- WBS-059 Visit Details (Pet Sitter): `backend/src/services/sitter-visit.service.js`, `SitterVisitDetailsPage.jsx` and the bounded visit/access-note projections.
- WBS-060 Withdraw from Visit: `backend/src/services/visit-withdrawal.service.js` and the operational withdrawal UI/route contract.

All four WBS items are assigned to Đoàn Tiến Đạt (`doantd11`); Đặng Văn Hải (`Haidvhe181849`) is the independent reviewer and Nguyễn Ngọc Thành (`ngocthanhhx7`) is the final merger. Each WBS item is published on its assigned feature branch; the service files are intentionally dependency-injected so P34 can register each route without duplicating policy logic.

## Decisions implemented

- Offer deadlines are checked again inside the atomic accept/decline command. Acceptance rechecks current sitter eligibility, suspension/status, payment/direct dispatch gates supplied by the repository, and sitter-day slot occupancy. A stale/expired/revoked offer cannot become an assignment.
- Offer and visit projections are bounded to service, area, schedule and pet summary. They never include address, contact, payment or private home-access fields.
- Reassignment keeps the persisted visit schedule, revokes the old assignment through the repository transaction, sets `handoverRequired`, and emits operational notification/audit intents. It does not mutate payout or auto-reschedule the visit.
- Private access notes are available only to the current assigned sitter from `startAt - 60 minutes` (inclusive) until checkout. A replacement sitter receives `HANDOVER_REQUIRED` until the handover record is confirmed. Access is revoked immediately after checkout.
- Self-withdrawal is allowed when `startAt - now >= 60 minutes`; at 59:59 it returns `WITHDRAWAL_WINDOW_CLOSED` with `route: STAFF`. The command records an assignment transition only and never requests payout or changes the schedule.

## Checks

Focused backend and frontend unit/integration checks cover deadline expiry races, suspended/ineligible/occupied replacement sitters, reassignment idempotency, the 60:00/59:59 withdrawal boundary, check-in protection, handover-before-access, private-note ownership/window, bounded projections and ambiguous UI writes. Run the configured checks from the handoff commit and record their real output in the PR.

## Integration pending

P34 must map the repository ports to Mongo/Mongoose transactions, eligibility/occupancy guards, CAS/version records, unique idempotency keys, audit/outbox and authenticated CSRF middleware, then register `sitterOperationsModule`. P26/P42 must provide the durable handover/check-in/out and notification adapters. The fixture ports and page tests in P24 do not prove database, scheduler, provider or end-to-end integration.
