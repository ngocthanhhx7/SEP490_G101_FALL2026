# Missing checkout and completion review

Owner clarification, 16 November 2026: reminders assist the assigned employee;
time passing never proves completion or attendance. The monitor runs independently
of automatic dispatch whenever employee scheduling is enabled.

## Timing and delivery

- Five minutes before the scheduled end: remind the assigned sitter to finish
  the actual work, report and checkout evidence.
- Fifteen minutes after the end without checkout: remind the sitter again.
- Two hours after the end: mark `COMPLETION_REVIEW_REQUIRED` (Cần xác minh kết thúc)
  and notify the sitter, active Staff and Admin.

Each phase persists one bounded marker on the existing visit and writes its
existing scheduling event and in-app notifications in the same transaction.
Workers recheck state and the scheduled end before writing. Restarts, visit
version changes and concurrent workers cannot duplicate a phase. Processing is
bounded to 100 visits per phase per minute, ordered by end/id; delivered visits
are excluded so later batches progress. No additional collection or TTL is used.
The additive `state/endAt/_id` index supports the scan. Release must inspect its
explain plan on a restored database before provisioning; runtime does not create it.

Sitter notifications link to `/sitter/invitations?visitId=...`; the owned execution
endpoint opens the visit directly, independently of assignment pagination.
Staff/Admin notifications open their dispatch workspace with `closureId`.

## Operational close and factual verification

`POST /employee-scheduling/visits/:id/closures` remains Staff/Admin, CSRF protected,
version checked and durably idempotent. It requires an actual check-in, missing
checkout, at least two hours past the scheduled end and a reason. Both presence
and absence of a check-in photo now produce `STAFF_CLOSED`, pending verification.
Neither proves a performed service or authorizes a free charge, lost salary or refund.
The immutable original check-in/photo facts and missing checkout are preserved.

`GET /employee-scheduling/visits/:id/closure` reads either an overdue active visit
or a closed visit. `closable-visits` includes unverified closed visits. The legacy
panel shows at most 50 oldest rows; direct notification links address other rows,
and the Visit Board supplies queue pagination in its dependent change.

`POST /employee-scheduling/visits/:id/closure-verifications` is Admin only, with
CSRF, current account checks, expected version and idempotency. Required fields:
`expectedVersion`, `reason`, `outcome`, `evidenceReference`. Outcomes:

- `SERVICE_PERFORMED`: also requires `actualEndedAt` (UTC ISO timestamp) and an
  explicit `reportsComplete` boolean. Actual end cannot precede check-in, exceed
  24 hours after it or lie in the future. The Admin form labels Vietnam time and
  converts it explicitly; it never pre-fills a guessed end from the schedule.
- `NO_SERVICE`: accepts no actual end/report flag. It records a factual conclusion
  and marks financial reconciliation required; no payment/refund is manufactured.

An evidence reference identifies material the Admin has actually checked; it is
not a claim of automated validation of an external telephone call or document.
The verification records actor, time, reason and outcome in the existing visit
and scheduling audit. Conflicting conclusions serialize; an uncertain response
retries the same frozen payload/key. Verification is immutable through this API.

## Parent booking, payroll and financial gates

Closing a visit touches the parent booking's version/finance guard in the same
transaction as other visit writers. A booking with active siblings remains active.
When every sibling is terminal, a mix or Staff closure produces `CLOSED`, never
normal `COMPLETED`. The last normal checkout also finalizes a mixed booking.

Unverified Staff closures create no service credit. After all terminal work has
been verified, performed visits create one existing immutable payroll credit per
visit, using its authoritative price snapshot and verified actual end; no fake
checkout is written. The approved payroll policy calculates commission downstream.
Missing reports remain false for KPI purposes. Base salary is not forfeited.

Mixed cancelled/no-service work remains `FINANCIAL_RECONCILIATION_REQUIRED` and
holds service commission, including already prepared unpaid statements, through
the existing commission-source guard. No new refund amount, tax rate, bill or
bank event is inferred. Billing/refund provider availability and approved financial
resolution remain separate gates; operational closure does not enable an unavailable
provider or declare financial reconciliation complete.

Existing collection names, command receipts and unique credit-per-visit index are
preserved. Additive visit/booking fields need no destructive migration. Release
requires a fresh backup/restore rehearsal; rollback retains additive evidence and
indexes and must never delete verification or financial audit rows.
