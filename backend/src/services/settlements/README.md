# Weekly settlement boundary (P41 / WBS-N05)

## Integration update, 2026-10-30

The [approved FIN-07/08 addendum](../../../../doc/requirements/finance-decisions-2026-10-30.md)
supersedes the open policy wording below. Operational source adapters and private
evidence integration remain required; the default runtime resolver stays closed.
`earning-accrual.service.js` records a booking ordinal in the completion writer's
transaction, then creates an immutable booking-level fee/tax snapshot, earning,
principal ledger line and outbox record when verified sources become eligible.
Its guarded source port must serialize case/refund producers on the same booking.

`mongo-earning-sources.repository.js` implements the primary collection join for
Booking/Visit, verified Payment, confirmed TaxAssessment, private check-in/out
images and open Case/Refund records. It is read-only except for the shared
Booking.financeGuardVersion guard. It never creates missing primary collections.
The concrete producer mapping and remaining runtime hooks are documented in
`doc/database/earning-source-mapping-v1.md`. It is not registered as a ready
runtime producer until completion/payment/case/refund writers use those hooks.
An absent assessment never means a tax amount of zero. Payment arriving later
cannot change the completion ordinal. Synthetic source fixtures are not runtime
operational adapters.

Submitted requests now support owner-only withdrawal with version/idempotency,
permanent week quota, and transactional audit. Held reservations return to HELD.
Available funds move to HELD on a case/refund lock, and return only after the last
lock is released with an actor recorded. A post-payout hold creates a separate
EarningAdjustment awaiting Admin review with unknown amount; paid ledger lines
remain unchanged. This does not execute adjustment approval or recovery.

Booking earnings do not have a visit id. The old sparse compound visit index
also indexed null visits because sitterId always exists. Fresh storage uses
`earning_visit_owner_v2`, unique only for string visit ids. Existing storage needs
operator review: `--apply --retire-legacy-visit-index` explicitly retires only the
known sparse `sitterId_1_visitId_1` after the replacement is verified. Unknown
indexes are preserved and cause failure. No production provisioning was performed.

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

`createApp` registers `settlementRequestRuntimeModule` when auth is enabled.
Production money operations remain BLOCKED_BY_DECISION until P27/P30/P31/P32
producers provide Earning/FinancialLock/Evidence records and P51 resolves policy.
Transactions require the Mongo replica-set topology already enforced by P02;
serial in-memory tests do not prove Mongo races or production constraints.

`readOwn` must return only `{ balances: { accrued, pending, held, available,
reserved, paid }, earnings, requests: [publicRequest], quotaUsed, decisionIds }`.
Each earning item is an owner-scoped row with its `id`, optional `visitId`,
`earningPeriodKey`, and disjoint `accruedVnd`, `pendingVnd`, `heldVnd`,
`availableVnd`, `reservedVnd`, and `paidVnd` buckets. Rows with only pending,
held, reserved, or paid money remain visible so the sitter can distinguish an
unavailable balance from missing data; only positive available rows are eligible
for a new request. Balances derive from immutable ledger entries, never from
summing requests. Amounts are nonnegative safe integer VND. Return no raw ledger
metadata, private case notes, bank details or other users' earnings.

Missing/unresolved policy fails with DECISION_REQUIRED. FIN-07-ELIG defines
earning/holds; FIN-07-POSTPAY defines post-payout refund adjustments; FIN-08-EDIT
defines request edits/transfer safety. Never silently deduct later earnings or
rewrite paid entries. Rejected/withdrawn requests consume quota permanently for
that week; release does not restore quota. Withdrawal/edit commands stay unexposed
until the corresponding decision is closed. The policy resolver is a trusted
server port with versioned decisions, never a client-provided flag.

The sitter route `/sitter/settlements` and role navigation use the authenticated
same-origin API client with session CSRF. Read responses consult the policy port
and expose open decision IDs; a healthy ledger does not imply an approved policy.
Per-earning ledger totals must match all persisted buckets and accrued principal.
Missing/inconsistent lines fail closed rather than show a partial balance.
All sitter projection queries run in one Mongo snapshot transaction. Until a
paged historical projection is supplied, reads are explicitly bounded to 1000
earnings, 1000 requests and 10000 ledger lines per sitter. Exceeding any bound
returns SETTLEMENT_HISTORY_LIMIT (503), never partial balances or truncated history.

Mongo runtime disables automatic indexes. Explicit additive provisioning is
`node --env-file-if-exists=.env scripts/migrations/settlement-storage.js --apply`
from `backend/` in an authorized local/test environment; omit `--apply` for a
credential-free dry run. The command refuses NODE_ENV=production. It creates
collections/indexes and never drops or rewrites existing data/indexes. Mutations
verify required unique indexes and return SETTLEMENT_STORAGE_NOT_READY if absent.
Any previously created experimental settlement indexes must be reviewed before
reuse; the command does not silently replace old unique transfer/evidence indexes.
Transfer reference ownership is unique per request through SettlementTransferClaim;
separate immutable attempts permit UNKNOWN to CONFIRMED with the same references.
Lock writers must use `lockEarning` inside a transaction, touching the same earning
as reservation writers; inserting only a FinancialLock row does not serialize them.

## Weekly commission, 2026-10-16

weekly-commission.js calculates the user-approved progressive fee per completed
booking: 1–5 10%, 6–10 9%, 11–20 8%, 21+ 7%, Vietnam Monday reset. It requires
complete authoritative snapshots, rejects duplicate/mixed-owner/unsafe amounts,
and applies user-approved half-up VND rounding per booking with exact BigInt
arithmetic. The platform bears any odd VND when sharing tax cost equally.
The tax split is preview-only from confirmed tax amounts, never a hard-coded
statutory rate or earning eligibility. See the P41 commission/tax addendum.
