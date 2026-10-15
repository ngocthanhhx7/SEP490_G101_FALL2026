# P41 / WBS-N06 — Admin settlement review and transfer record

EXT-SETTLEMENT. Branch `feature/wbs-n06-settlement-review-and-transfer-record`.
Contributor/author: Nguyễn Ngọc Thành / ngocthanhhx7; agent-assisted implementation.
Assigned independent reviewer: Phạm Thành Chung / Chunggrizzy11. Leader performs
final merge after real approval and all gates; assignment is not approval.

## Delivered runtime boundary

- [Admin service](../../backend/src/services/settlements/admin-README.md) and
  [HTTP module](../../backend/src/routes/admin-settlements.routes.js) support bounded
  cursor pagination, Admin-only review, expected-version CAS, atomic idempotency,
  approval/rejection and manual transfer recording. Approval never means Paid.
- `createApp` mounts the authenticated [runtime factory](../../backend/src/routes/admin-settlement-runtime.js).
  GET/POST `/api/v1/admin/settlements` use real sessions/roles/CSRF. The default
  resolver rejects real money writes with the unresolved decision IDs.
- [Frontend routes](../../frontend/src/routes/AppRoutes.jsx) register
  `/admin/settlements` and Admin navigation with a same-origin session CSRF API.
  The component's standalone pending adapter is not the runtime route.
- Transfer snapshots now include server recordedAt required by the durable schema.
  Missing requests return 404; invalid/tampered cursors return 422. Private bank
  evidence/notes are excluded from public projections.
- Approval readiness conditionally writes the shared Earning.version, ensuring
  a case/refund hold committed during approval forces a retry and recheck.
  Frontend pages are keyed by session user ID to clear private rows and commands
  when switching directly between identities with the same role.
- SettlementTransferClaim owns bank/evidence references uniquely across requests.
  Immutable transfer attempts may reuse references for the same request, allowing
  UNKNOWN to CONFIRMED reconciliation while retaining both attempts. Confirmed
  exact amounts debit reservation once; unknown/mismatch retains reservation.
- Shared repository/schema include N05 corrections: complete disjoint earning
  rows, per-earning ledger conservation validation, no fabricated origin ledger,
  transaction-scoped shared earning locks, required-index readiness checks and
  explicit additive [storage provisioning](../../backend/scripts/migrations/settlement-storage.js).
  Default provisioning is dry-run; --apply refuses NODE_ENV=production. Existing
  experimental unique reference indexes require review; no silent index/data drop.

## Decisions and dependencies

[P51](../requirements/p51-financial-contract-v1.md) still leaves FIN-07-ELIG,
FIN-07-POSTPAY and FIN-08-EDIT open. This audit did not receive a commission/rate,
availability/hold/evidence policy, debt policy or permitted edit/withdrawal rules.
Continuing technical work does not close those decisions. Real monetary mutations
remain DECISION_REQUIRED; post-payout corrections cannot overwrite Paid or deduct
future earnings. No payment provider/bank operation is invoked by this module.

N05 supplies sitter submission and the same durable aggregate. When merging N06
onto develop after N05, preserve both runtime factories/default modules, frontend
role wrappers/navigation/routes and the shared storage fixes. P27/P30 eligibility,
P31/P32 verified allocations/common locking and private-media evidence producers
remain unverified integrations. P28 owns WBS-N07 aggregate payroll reporting.
Status: RUNTIME_ROUTES_REGISTERED / MONEY_BLOCKED_BY_DECISION / UPSTREAM_PENDING.
Keep PR draft while these gates remain open; no approval or merge is claimed.

## Verification scope

Local MongoDB 8.0.34 replica-set tests use autoIndex=false and explicit additive
provisioning. They verify required transfer timestamp, immutable UNKNOWN/CONFIRMED
reconciliation with identical references, unique cross-request ownership rollback,
concurrent same-command replay, one paid ledger movement, missing-request/cursor
errors, real persisted session/CSRF and default runtime DECISION_REQUIRED.
Frontend tests verify real protected route/API/navigation, Staff denial and the
existing pending/error/retry forms. Fixtures are synthetic; no actual bank,
provider, upstream care/refund/evidence, Figma or physical touch claim is made.
No live environment provisioning, external email/SMS or deployment occurred.

Final local counts are reported in the PR audit. Historical head-only results
and older COMMENTED reviews do not establish latest-head approval.
