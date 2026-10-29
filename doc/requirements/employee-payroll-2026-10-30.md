# Employee payroll: revised owner direction

Status: employment, gross bases, commission/KPI and voluntary advance policy approved by owner.
Recorded 30 October 2026. Reviewer coordination defaults to Ngọc Thành when unassigned;
independent approval still requires a non-contributor.

## Confirmed scope

- PawWorld Care operates for one employer. Approved sitters are employees with signed contracts.
- Employment types: FULL_TIME and PART_TIME.
- Full-time base salary: 10,000,000 VND; monthly payroll.
- Part-time base salary: 3,000,000 VND; weekly or monthly payment as stated in the contract.
- Both receive commission and KPI bonuses under the approved policy below.
- Both can request a salary advance once per month, subject to Admin approval.
  Rejection requires a reason. Only Admin records salary payments.

## Superseded assumptions

The independent-partner assumption and booking-revenue-minus-platform-fee earning
formula from earlier finance decisions cannot be used as the default employee salary.
The earlier equal split of a booking tax assessment is not an employee payroll tax rule.
Do not activate that policy to make the old settlement screen work.

Preserve completion/payment evidence, immutable receipt allocation, source audit,
idempotent commands, transfer records and historical snapshots. Open customer
complaints do not authorize withholding an employee's base salary. Earned commission,
bonus disputes and lawful wage deductions need separate reviewed rules.

## Pending clarification

- Actual workplace commune/ward and regional minimum wage; full-time contracted hours.
- Actual attendance/overtime/leave, insurance and income tax assessments per employee and period.
- Advance settlement period and consent reference per request. Mandatory statutory advances need a separate path.
- Verified contract metadata/backfill for existing approved employees. Approval is not a reason to
  fabricate contract dates, signatures or documents.
- Tax/insurance assessment by effective law, employee status and actual compensation components;
  never invent a blanket tax rate or treat part-time as automatically exempt.

## Further approval in this session

- Both bases are monthly GROSS, including part-time 3m paid weekly or monthly per contract.
- Part-time is 20 hours/week. Do not pay 3m each week or divide every month into four weeks.
- Commission: 5% directly performed service money after combo, before tax; exclude veterinary bills/third-party disbursements.
- KPI monthly thresholds 90/100/110% of approved target care minutes. Full-time bonus 500k/1m/1.5m;
  part-time 150k/300k/450k. On-time >=95%, reports 100%, no concluded serious violation.
  Targets exclude legitimate leave and time employer did not allocate work. No base salary penalty.
- Voluntary advance cap 50% monthly base, one APPROVED advance per Vietnam calendar month;
  no two pending requests. Rejected/withdrawn requests do not consume the allowance.
  No interest; Admin rejection reason mandatory; only Admin records actual payment.
- Policy version `PWC-EMPLOYEE-PAYROLL-2026-10-30-v1`.

## History Pagination

Employee and Admin payroll history uses signed, expiring cursors, default 20 and maximum 50 rows
per page. Cursor scope binds actor, resource, view and page size. Employee ownership cannot be
changed through query fields. Admin can switch between pending advances and full advance history;
paid/rejected/withdrawn rows remain readable without new decision controls. The active contract is
resolved separately from recent contract history, so an expired newer version cannot reactivate an
older one. Reads require provisioned storage and use bounded database execution time.

## Implemented boundaries

- `backend/src/services/payroll/` owns contract verification, salary calculation, advance commands,
  immutable completion credits and statement preparation/approval/payment records.
- `/api/v1/payroll/me` is employee-scoped. Contract, assessment, approval and payment commands
  require Admin; all writes require session, CSRF, idempotency keys and provisioned unique indexes.
- `/sitter/payroll` and `/admin/payroll` expose the employee workflow. The old settlement route
  remains historical and its unresolved runtime policy cannot authorize new partner payouts.
- Salary statements use completed periods and explicit attendance, overtime, tax/insurance assessments.
  Customer payment status never determines base wages. Commission derives from completion snapshots,
  without the superseded partner fee or tax split. No bank transfer is initiated by these endpoints.
- Employee completion requires the dedicated immutable `visit.snapshots.employeeServiceNetVnd`;
  it never falls back to legacy `serviceBasisVnd`. Multi-visit receipt verification uses
  `booking.paymentSnapshot` (VND/amountVnd) separately from the commission basis, since customer
  totals may contain fees that are not commissionable.
- Admin may void a PREPARED statement with a required reason and create a replacement. The old
  assessment and audit remain; source claims are released atomically. APPROVED/PAID statements
  cannot be voided. The storage migration creates the active-period unique index before removing
  the obsolete all-history period index; runtime refuses that obsolete index.
- Advance repayment is an explicit agreed installment, bounded by the amount paid and previous
  statement allocations. A shared transactional transfer claim prevents reusing one bank reference
  across salary and advance payments.
- Run `node scripts/migrations/payroll-storage.js` for a dry run; review its guarded `--apply`
  procedure before writing to an isolated development database. Runtime never provisions indexes.

Outstanding integration: booking creation must persist the approved post-combo, pre-tax direct
service snapshot, distinct from customer fees/disbursements; verified timecard and statutory assessment
references remain operational inputs. Historical signatures are never synthesized. Paid statement
correction requires an audited adjustment workflow; do not edit the paid snapshot or silently deduct
money from a later wage.
