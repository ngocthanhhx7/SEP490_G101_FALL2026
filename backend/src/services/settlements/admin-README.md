# WBS-N06 Admin settlement review and transfer

`createApp` registers `adminSettlementRuntimeModule` with the durable Mongo adapter
when authentication is enabled. The
adapter is shared with WBS-N05 and uses the same settlement request aggregate,
ledger/outbox and financial-lock collections. Production is still
BLOCKED_BY_DECISION until P51 resolves the policy and
the private-media layer records Admin-owned evidence. This module never invokes
a payment provider or performs a bank transfer.

All command repository calls, state CAS, financial reservation changes, immutable
ledger and audit/outbox event append plus command result commit atomically through
`unitOfWork.run`. Rollback and transaction retries are mandatory. Mongo unique
transfer/evidence references prevent allocating one bank record to two
settlements; evidence ownership is checked against the Admin actor and request.
The policy resolver must revalidate earnings, case/refund holds and versions inside
the transaction with the same allocation locks as P32/P30.

`listPayroll({ cursor, limit: 50 })` returns a bounded page of settlement requests,
nextCursor and unresolved decisionIds. Public projection excludes bank details,
transfer evidence/private notes. This is request review; the WBS-N07 aggregate
payroll reporting/dashboard belongs to P28.

Decision SUBMITTED -> APPROVED keeps reservation; approval is not paid. Rejection
releases only SUBMITTED/untransferred reservations atomically and never deletes
the request-week claim. Reject/edit/withdraw after approval is not exposed.
CONFIRMED requires exact safe integer VND amount, reference, private evidence ref,
offset-qualified paidAt between submission and server time. Unknown or mismatched
amount becomes TRANSFER_PENDING with reservation intact. There is no automatic
retry bank transfer, failed-transfer release or uncertain reservation release.
Confirmed reconciliation may resolve TRANSFER_PENDING with the same evidence.

FIN-07-ELIG / FIN-07-POSTPAY / FIN-08-EDIT must be closed by P51 with policyVersion
and decisionVersion before resolver permits real commands. Refund after payout
requires separate approved adjustment and reconciliation; do not overwrite PAID
or auto-debit later earnings. Tests use explicit synthetic policy only.

The protected `/admin/settlements` frontend route and Admin navigation supply a
same-origin client with the current session CSRF token. Read responses expose the
policy resolver's unresolved decision IDs even when payroll storage is healthy.
Transfer snapshots include the required server `recordedAt`. Missing request IDs
return 404; malformed cursors return 422 rather than an internal error.

Reference ownership is stored in SettlementTransferClaim with unique kind/reference;
each owner is a single request. Immutable SettlementTransfer attempts can reuse
the owner's bank/evidence references for reconciliation, while other requests are
rejected atomically. Existing experimental unique reference indexes require review
before reuse; additive provisioning never drops indexes or rewrites attempts.

Mongo runtime uses autoIndex=false. From backend, run
`node --env-file-if-exists=.env scripts/migrations/settlement-storage.js` for a dry
run; `--apply` provisions additive storage only in an authorized local/test
environment and refuses NODE_ENV=production. Monetary commands verify all required
unique indexes and fail with SETTLEMENT_STORAGE_NOT_READY when absent.
FinancialLock producers must use the transaction-scoped `lockEarning` port so they
write the same earning as settlement reservations and cannot race via write skew.
Approval readiness also conditionally touches Earning.version within its transaction,
so a newly committed case/refund lock forces retry and a fresh hold check. Same-role
session identity changes remount the frontend page and clear prior payroll/forms.
The shared sitter projection uses one snapshot and explicit 1000 earning/request,
10000 ledger line caps; larger histories return SETTLEMENT_HISTORY_LIMIT (503).
