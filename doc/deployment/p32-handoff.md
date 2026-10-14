# P32 handoff — Refund and financial adjustments

**Work item:** WBS-046 — Refund Processing
**Related UC:** UC-61
**Date:** 14 October 2026 (Asia/Ho_Chi_Minh)
**Branch:** `feature/wbs-046-refund-processing`
**Base:** `develop`

## Delivered scope

- Backend refund state machine for Staff proposals and Admin approve/reject and off-system transfer reconciliation.
- Refund proposals and approvals validate positive safe-integer VND and compare to an injected remaining-capacity port. Approval rechecks the amount and reserves it atomically through the repository adapter.
- Approval is `APPROVED`, never `PAID`. Only an exact manually confirmed transfer with reference, evidence reference, and paid timestamp transitions to `PAID`. Unknown and mismatched transfers remain pending with capacity reserved. Confirmed failure before uncertainty releases the reservation through a separate ledger entry; uncertain transfers cannot release it without reconciliation.
- The service accepts no payOS/bank client. Ledger and event writes are append-only repository operations in the same unit of work as refund state and idempotency record.
- Staff and Admin pages accept injected API/data and render access denied, pending, empty, loading, error, and success states. Route registration and the live read adapter remain with P34.

## Decisions and dependencies

The service fails closed unless its capacity port reports a ready, decision-free capacity bucket. It does not calculate cancellation retention, visit allocation, discounts, rounding, sitter-caused cancellation, or post-payout debt. The relevant open decisions are FIN-02-ALLOC, FIN-02-ROUND, FIN-06-CAUSE, FIN-07-POSTPAY, plus any source-specific P01 decisions. Server adapters must derive the amount from verified net collections and prior adjustments; proposal input never establishes capacity.

P01/P34 must supply the MongoDB model/repositories, real transaction wiring, atomic capacity reservation shared with settlement, unique actor/operation/idempotency indexes, durable immutable audit/ledger/event storage, source authorization, list/read API and route registration. A fixture or isolated repository adapter is not production integration. Actual transfer records must be based on externally checked evidence; there is no automated payout.

## Files and ownership

- `backend/src/services/refunds/`: refund state machine and repository integration contract.
- `backend/src/routes/refunds.routes.js`: Staff and Admin endpoints, exported but not mounted.
- `backend/tests/unit/refund.service.test.js`, `backend/tests/unit/refunds.routes.test.js`: unit/route contract checks with synthetic repositories and sessions.
- `frontend/src/pages/staff/refunds/`, `frontend/src/pages/admin/refunds/`: pages and folder responsibilities.
- `frontend/src/pages/financial/`: shared refund presentation styles.
- `frontend/src/services/refunds-api.js`: injected request adapter.
- `frontend/tests/`: adapter and component contract checks with synthetic API responses.

## Validation and status

Run the configured backend lint, unit tests and integration tests, plus frontend lint, unit tests and build/test checks. Record the actual results in the work-item PR before review. No Figma or production provider evidence is part of this package; runtime integration remains `INTEGRATION_PENDING` until P01/P34 connect real transactional repositories, routes, authenticated session data and the refund list API.

## Git handoff

Assigned contributor/author and PR creator: Nguyễn Ngọc Thành (`thanh`). Assigned reviewer: Phạm Thành Chung (`chung`). Final merger: Nguyễn Ngọc Thành. The reviewer approval remains a separate, real review of the latest PR head; it is not implied by the assignment. Record the actual author/committer identity, GitHub actor, commit SHA, PR URL, review/check results and merge state when known.
