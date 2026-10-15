# Weekly settlement boundary (P41 / WBS-N05)

`week.js` calculates half-open Vietnam calendar weeks using UTC+07:00. The key
is the local Monday date, including across years. It is independent of earningPeriodKey.
`settlement.service.js` owns sitter reads and atomic request orchestration. It does
not calculate commissions or create wallet/bank transfers.

`mongo-settlement.repository.js` and `settlement.model.js` provide the durable
Mongo adapter: a replica-set transaction writes the week claim, conditional
earning reservations, immutable ledger lines, state event, outbox row and command
result together. Unique `(sitterId, requestWeekKey)`, earning IDs, command keys,
transfer references and evidence references are database constraints. Active
`FinancialLock` rows are checked for both refund/case/allocation and settlement
operations, so a stale in-memory caller cannot move a held earning.

Production is still INTEGRATION_PENDING until P34 registers
`settlementRequestRuntimeModule`, upstream P27/P30/P31/P32 producers create the
Earning/FinancialLock/Evidence records, and P51 policy decisions are resolved.
Transactions require the Mongo replica-set topology already enforced by P02;
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
