# P41 / WBS-N05 — Weekly settlement request and ledger

EXT-SETTLEMENT. Branch `feature/wbs-n05-weekly-settlement-request-and-ledger`.
Contributor/author/committer and publishing account: Đặng Văn Hải / Haidvhe181849;
agent-assisted implementation. Assigned reviewer: Nguyễn Hữu Anh Nhật / anhnhat432.
Leader: Nguyễn Ngọc Thành. Assignment is not approval.

## Delivered boundary

- [Service and transactional port contract](../../backend/src/services/settlements/README.md):
  Vietnam Monday calendar keys, independent earning identity, atomic quota/reserve/
  ledger command orchestration, idempotent replay and ownership/role gates.
- [HTTP module](../../backend/src/routes/settlement-requests.routes.js) uses P06 session,
  CSRF and role middleware. No body owner/amount/week accepted. P34 registration pending.
- [Sitter page](../../frontend/src/pages/sitter/WeeklySettlementPage.jsx) and
  [API adapter](../../frontend/src/services/settlement-api.js): ledger balances,
  selection/history, empty/error/loading/forbidden/decision-pending and uncertain
  retry retaining the same key. No successful mock fallback.
- [Durable Mongo adapter](../../backend/src/services/settlements/mongo-settlement.repository.js)
  and [schema](../../backend/src/models/settlement.model.js) now enforce unique
  week/earning/command/evidence keys, conditional reservations, CAS transitions,
  immutable ledger lines, events, and outbox rows in a replica-set transaction.
  `settlementRequestRuntimeModule` is provided for P34 registration and fails closed
  while the unresolved P51 policy decisions remain unresolved.
- The sitter read projection keeps disjoint pending/held/available/reserved/paid
  earning buckets, including rows that are not currently requestable; malformed
  persisted bucket values fail closed. The page disables non-available rows so a
  pending or held earning cannot be submitted as a new settlement request.

## Decisions and dependencies

[P51 v1](../requirements/p51-financial-contract-v1.md) governs this module. Rejection/
withdrawal retains weekly quota; Approved is not Paid; transfer is recorded outside
the system. FIN-07-ELIG, FIN-07-POSTPAY and FIN-08-EDIT remain open. Missing policy
resolver blocks writes; no commission, wallet, automatic payout or debt offset.
After refund on already paid earnings, retain immutable history and reconciliation
hold; do not deduct future settlement automatically. P51 must close adjustment rules.

P34 must register the durable runtime factory. P27/P30 supply care/case eligibility,
P31/P32 supply verified paid/refund allocations. No synthetic fixture establishes
these integrations. Status: INTEGRATION_PENDING / MONEY_BLOCKED_BY_DECISION.
The shared app composition hook now ignores a factory's deliberate `null`/
`undefined` fail-closed result while still rejecting malformed non-null modules.

## Evidence

Backend targeted Jest: 16 passing cases (Vietnam Sunday/Monday and year boundaries,
concurrent requests on serialized transactional double, replay across week, foreign/
held earning, rollback on ledger failure, auth and idempotency collision, full
bucket projection, and malformed persisted bucket fail-closed checks).
Frontend targeted Jest: 3 passing cases (pending, decision/quota, timeout key replay).
Frontend lint and Vite build passed. Build checks the registered application;
new page JSX is covered by its Jest import, not registered in runtime yet.
No Mongo concurrency test or end-to-end money/provider verification was performed.
A local MongoDB 8.0.34 replica-set probe created the indexes, earning, reservation,
request, ledger/event/outbox records and scoped balances; a duplicate week claim
returned `null`. This is synthetic adapter evidence, not CI, load, or provider
verification.
A local synthetic browser harness verified 360px frame layout without horizontal
overflow (345px usable content with scrollbar), Space checkbox selection and
Tab/Enter submit reaching FIXTURE_ONLY error. CSS uses auto-fit panels and 44px controls; device
touch verification and Figma fidelity remain pending. Existing P04 tokens are
provisional, not a verified Figma specification.

PR must remain draft while these financial and integration gates are open; no
approval or merge claimed. P34 owns route/manifest changes. WBS-N06 adds Admin
review/transfer in its own contributor branch, without modifying shared schema.

## Current branch verification (2026-10-15)

- Live head: `7351d95238d2235ee66827cdc87ceb2b3bd143e1`; base `develop`:
  `f02321e5f82ee7ad522494c0247b94209db6c1a7`.
- Full backend Jest run on this head: **63 suites / 567 tests passed**.
- GitHub reports only a Vercel Preview Comments success for this head; no CI
  workflow result or reviewer approval is inferred. The assigned reviewer remains
  `anhnhat432`, and the existing review is `COMMENTED` on an older head.
