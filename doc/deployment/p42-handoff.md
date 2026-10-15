# P42 handoff — directed sitter booking proposal

```text
Pxx / task / WBS: P42 / Customer-selected sitter and schedule proposal / WBS-N03, WBS-N04
Code scope: directed proposal service, Customer route adapter and proposal screen
Status: INTEGRATION_PENDING
Branch/worktree: current feature worktree; base develop snapshot 526852b
```

## Delivered

- `backend/src/services/directed-proposal.service.js` now exposes the P42
  booking-proposal alias, server-owned booking context hook, expiry and
  multi-visit payment gate, per-proposal serialization and confirmation replay
  support.
- `backend/src/routes/directed-proposal.routes.js` provides Customer-scoped
  create/read/confirm endpoints. It never accepts a customer id or client
  supplied price/pet/payment snapshot.
- `frontend/src/services/directed-booking-proposal-api.js` validates DTOs and
  sends CSRF-protected idempotent commands.
- `frontend/src/pages/customer/DirectedBookingProposalPage.jsx` presents the
  visit, pet and price snapshots and does not show an offer until the server
  acknowledges confirmation.

## Decisions and open gates

- A directed proposal is `PENDING_CUSTOMER_CONFIRMATION`; confirming it is
  separate from sitter acceptance and assignment.
- The repository must recheck availability and compare the expected version in
  one atomic command. The process-local lock only reduces duplicate work in a
  single Node process.
- Multi-visit bookings require `PAID` or `VERIFIED` before an offer is sent.
  The payment provider and booking repository still need runtime wiring.
- P34 must register the router and the final Customer route. No production
  MongoDB model, payment provider, offer repository or end-to-end flow was
  changed by this package.

## Checks

- Backend directed proposal unit suite: passed (6 tests).
- Scoped backend and frontend ESLint for the P42 files: passed.
- Full repository lint is not clean because existing unrelated backend files
  report `wireId` unused and `structuredClone` undefined in
  `booking-change-cancellation.service.js`.
- No real database, payment provider or sitter offer dispatch was exercised.
