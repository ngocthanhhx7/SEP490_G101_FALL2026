# Weekly settlement boundary (P41 / WBS-N05)

`week.js` calculates half-open Vietnam calendar weeks using UTC+07:00. The key
is the local Monday date, including across years. It is independent of earningPeriodKey.
`settlement.service.js` owns sitter reads and atomic request orchestration. It does
not calculate commissions or create wallet/bank transfers.

Production is INTEGRATION_PENDING. P01/P34 must implement the injected repository
and unitOfWork with retryable transactions: unique `(sitterId, requestWeekKey)`
claims (never deleted on rejection/withdrawal), actor/operation/key idempotency
with fingerprint, and conditional reservation of every selected earning by its
global earning ID. Reservation must check owner, availability, hold/refund/case
locks and policy versions in the same transaction as state, ledger and outbox.
Refund uses the same allocation/earning locks. All-or-nothing rollback is required;
serial in-memory tests do not prove Mongo races or production constraints.

`readOwn` must return only `{ balances: { accrued, available, reserved, paid },
earnings: [{ id, sitterId, earningPeriodKey, availableVnd }], requests: [publicRequest],
quotaUsed, decisionIds }`. Balances derive from immutable ledger entries, never
from summing requests. Amounts are nonnegative safe integer VND. Return no raw
ledger metadata, private case notes, bank details or other users' earnings.

Missing/unresolved policy fails with DECISION_REQUIRED. FIN-07-ELIG defines
earning/holds; FIN-07-POSTPAY defines post-payout refund adjustments; FIN-08-EDIT
defines request edits/transfer safety. Never silently deduct later earnings or
rewrite paid entries. Rejected/withdrawn requests consume quota permanently for
that week; release does not restore quota. Withdrawal/edit commands stay unexposed
until the corresponding decision is closed. The policy resolver is a trusted
server port with versioned decisions, never a client-provided flag.
