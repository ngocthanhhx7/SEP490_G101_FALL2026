# P41 / WBS-N05 — Weekly settlement request and ledger

EXT-SETTLEMENT. Branch `feature/wbs-n05-weekly-settlement-request-and-ledger`.
Contributor/author: Đặng Văn Hải / Haidvhe181849; agent-assisted implementation.
Assigned independent reviewer: Nguyễn Hữu Anh Nhật / anhnhat432. Leader performs
final merge after real approval and all gates; assignment is not approval.

## Delivered runtime boundary

- [Service and Mongo repository](../../backend/src/services/settlements/README.md)
  enforce Vietnam Monday calendar weeks, independent earning identity, ownership,
  safe integer VND, transaction-scoped quota/reservation/ledger/event/outbox and
  idempotent command results. Rejected requests retain their weekly claim.
- `createApp` mounts the authenticated [runtime factory](../../backend/src/routes/settlement-runtime.js).
  GET/POST `/api/v1/settlement-requests` use actual session, sitter role and CSRF gates.
  The default resolver returns DECISION_REQUIRED before monetary mutations.
- [Frontend route](../../frontend/src/routes/AppRoutes.jsx) registers
  `/sitter/settlements` in the protected sitter layout/navigation and supplies the
  same-origin API adapter with the current session CSRF token. Component default
  pending adapters are standalone seams, not the application route.
- The sitter page shows pending/held/available/reserved/paid rows and balances.
  Non-available rows cannot be selected. Open policy IDs disable submission;
  uncertain retries within the mounted page retain their logical command key.
- Reads and money transitions reject inconsistent per-earning ledger buckets.
  Settlement does not fabricate origin ledger entries from balance fields;
  upstream producers must supply the immutable earning history.
- Sitter reads use a single snapshot transaction. Queries fetch at most 1001
  earnings/requests and 10001 ledger lines to detect the explicit history cap;
  above 1000 earnings/requests or 10000 ledger lines, SETTLEMENT_HISTORY_LIMIT
  rejects the whole projection. A paged archival view remains future work.
- Same-role identity switches remount the page by session user ID, clearing
  previous private rows/selections and command keys before loading the new scope.
- Shared FinancialLock writers touch the same earning inside the transaction to
  serialize against reservation writers. Direct insertion of an unrelated lock
  document does not provide this concurrency guarantee.
- Mongo uses autoIndex=false. Explicit [additive provisioning](../../backend/scripts/migrations/settlement-storage.js)
  creates storage/indexes; the default script mode is a credential-free dry run.
  `--apply` is limited to authorized non-production environments. Required unique
  indexes are verified before writes; missing indexes fail closed. Existing old
  experimental indexes require review; no index/data is dropped automatically.

## Decisions and dependencies

[P51](../requirements/p51-financial-contract-v1.md) leaves FIN-07-ELIG,
FIN-07-POSTPAY and FIN-08-EDIT open. No response in this audit supplied the missing
commission/rate, earning availability/hold/evidence rules, post-payout adjustment
policy or allowed edit/withdrawal transitions. A request to continue work is not
approval of invented financial values. All real money mutations remain blocked.
No wallet, provider payout, future earning deduction or real transfer is performed.

P27/P30 must supply care/case eligibility; P31/P32 supply verified paid/refund
allocations and common locking. P41 does not claim these producers are integrated.
Status: RUNTIME_ROUTES_REGISTERED / MONEY_BLOCKED_BY_DECISION / UPSTREAM_PENDING.
The PR remains draft while these gates are open. WBS-N06 adds Admin review and
manual transfer recording using the same durable aggregate; merge it after N05,
preserving both default app modules and both frontend routes.

## Verification scope

Local MongoDB 8.0.34 replica-set tests run with autoIndex=false and explicitly
provisioned indexes. They cover concurrent devices, same-command replay, weekly
quota rollback, active case lock, partial ledger rejection, missing unique index,
real persisted session/CSRF and default runtime DECISION_REQUIRED. These are
synthetic records and policy fixtures; they do not prove real provider, bank,
care/refund producer, Figma or physical touch integration. No live environment
provisioning, external email/SMS or staging/production deployment occurred.

Final local check counts are reported in the PR audit. Historical head-only
verification and older COMMENTED reviews do not establish current approval.
