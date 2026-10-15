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

## Decisions and dependencies

[P51 v1](../requirements/p51-financial-contract-v1.md) governs this module. Rejection/
withdrawal retains weekly quota; Approved is not Paid; transfer is recorded outside
the system. FIN-07-ELIG, FIN-07-POSTPAY and FIN-08-EDIT remain open. Missing policy
resolver blocks writes; no commission, wallet, automatic payout or debt offset.
After refund on already paid earnings, retain immutable history and reconciliation
hold; do not deduct future settlement automatically. P51 must close adjustment rules.

P01/P34 must supply durable repository, unique indexes, shared refund/case earning
locks, snapshot/CAS transactions and outbox. P27/P30 supply care/case eligibility,
P31/P32 supply verified paid/refund allocations. No synthetic fixture establishes
these integrations. Status: INTEGRATION_PENDING / MONEY_BLOCKED_BY_DECISION.

## Evidence

Backend targeted Jest: 13 passing cases (Vietnam Sunday/Monday and year boundaries,
concurrent requests on serialized transactional double, replay across week, foreign/
held earning, rollback on ledger failure, auth and idempotency collision).
Frontend targeted Jest: 3 passing cases (pending, decision/quota, timeout key replay).
Frontend lint and Vite build passed. Build checks the registered application;
new page JSX is covered by its Jest import, not registered in runtime yet.
No Mongo concurrency test or end-to-end money/provider verification was performed.
A local synthetic browser harness verified 360px frame layout without horizontal
overflow (345px usable content with scrollbar), Space checkbox selection and
Tab/Enter submit reaching FIXTURE_ONLY error. CSS uses auto-fit panels and 44px controls; device
touch verification and Figma fidelity remain pending. Existing P04 tokens are
provisional, not a verified Figma specification.

PR must remain draft while these financial and integration gates are open; no
approval or merge claimed. P34 owns route/manifest changes. WBS-N06 adds Admin
review/transfer in its own contributor branch, without modifying shared schema.
