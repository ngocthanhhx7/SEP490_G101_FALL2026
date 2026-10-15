# WBS-N06 Admin settlement review and transfer

Admin service and HTTP module remain export-only, while
`adminSettlementRuntimeModule` composes the durable Mongo adapter for P34. The
adapter is shared with WBS-N05 and uses the same settlement request aggregate,
ledger/outbox and financial-lock collections. Production is still
INTEGRATION_PENDING until P34 registers the module, P51 resolves the policy, and
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
