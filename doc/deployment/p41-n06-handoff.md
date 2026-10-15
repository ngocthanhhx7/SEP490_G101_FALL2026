# P41 / WBS-N06 — Admin settlement review and transfer record

EXT-SETTLEMENT. Branch `feature/wbs-n06-settlement-review-and-transfer-record`.
Contributor/author/committer/publishing account: Nguyễn Ngọc Thành / ngocthanhhx7;
agent-assisted implementation. Assigned independent reviewer: Phạm Thành Chung /
Chunggrizzy11. Leader performs final merge only after real approval and gates.

## Delivered

- [Admin service contract](../../backend/src/services/settlements/admin-README.md)
  and [HTTP module](../../backend/src/routes/admin-settlements.routes.js): bounded
  request review, optimistic version, idempotency, required policy versions,
  approval/rejection, manual transfer reference/evidence recording and ledger events.
- [Admin page](../../frontend/src/pages/admin/AdminSettlementsPage.jsx) and
  [API adapter](../../frontend/src/services/admin-settlement-api.js): loading, empty,
  forbidden, error, decision pending, disabled actions, uncertain command replay,
  paged records and explicit separation of Approved / TransferPending / Paid.
- The shared [Mongo settlement adapter](../../backend/src/services/settlements/mongo-settlement.repository.js)
  and [schema](../../backend/src/models/settlement.model.js) now provide durable
  CAS/state transitions, unique transfer/evidence references, ownership checks,
  reservation holds, immutable ledger lines, events and outbox rows. The admin
  runtime factory remains fail-closed until P34 registration and P51 policy closure.
- No shared schema, app/route registration, manifest or lockfile changes. P34
  supplies authenticated createApiClient with CSRF and an Admin role route/layout.
  WBS-N07 aggregate payroll report/dashboard remains P28 scope.

## Decision / dependency gates

[P51 financial contract](../requirements/p51-financial-contract-v1.md) applies.
FIN-07-ELIG, FIN-07-POSTPAY and FIN-08-EDIT are still open. Missing/unresolved policy
blocks mutations. Rejection releases only untransferred submitted reservations;
request-week quota is retained. Unknown/mismatched transfer holds reservation for
reconciliation; no wallet, payout provider, automatic release or future earning
deduction. Paid correction/refund requires separately approved immutable adjustment.

P34 must register both runtime factories and provide policy/eligibility rechecks.
WBS-N05 supplies weekly submission, but N06 is an independent module export and
uses the same durable aggregate port. P27/P30 care/case eligibility and P31/P32
money integrations have not been verified here.
The shared app composition hook ignores a factory's deliberate `null`/`undefined`
fail-closed result while still rejecting malformed non-null modules.
Status: INTEGRATION_PENDING / MONEY_BLOCKED_BY_DECISION. These are genuine merge
gates, not a request for routine permission. Keep PR draft, no approval claimed.

## Checks executed

- Backend lint passed; targeted Jest 11 cases passed across service and HTTP modules:
  role/CSRF/extra-field boundaries, approve not paid, rejection quota, uncertain/
  mismatched transfer, concurrent transfer double, atomic rollback, invalid time,
  unresolved decision and private projection.
- Frontend lint passed; targeted Jest 5 cases passed: pending, forbidden/empty,
  decision gate, uncertain retry key and approved/paid forms. Vite build passed
  for registered application; unregistered new page is exercised via Jest import.
- Transactional doubles do not verify Mongo uniqueness, bank evidence, provider,
  actual payout or integrated care/refund/complaint flow. No CI status inferred.
- A local MongoDB 8.0.34 replica-set probe synchronized indexes, created an
  earning and reservation, wrote a settlement request plus ledger/event/outbox,
  read scoped balances, and confirmed duplicate week claim returns `null`. This
  is synthetic adapter evidence, not CI, load, provider, or bank verification.
- P04 shared tokens used. CSS cards/fields fit narrow layouts with 44px controls;
  local synthetic browser harness verified a 360px frame without horizontal
  overflow (345px usable content with scrollbar), labeled reference entry and
  Tab focus to evidence field. Physical touch and Figma fidelity are unverified. Brand
  tokens currently describe themselves as provisional. No fake visual approval.

Files live only under backend/, frontend/, doc/. Dependencies/build outputs and
local credentials/helpers/prompts are ignored and excluded from staging.
