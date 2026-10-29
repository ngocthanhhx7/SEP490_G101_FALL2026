# Employee Payroll And Demo Catalogue Integration

Checked 30 October 2026 against integration commit `cdcdbdaf0a025d16de6c0fff411a2ba0b26e73b2`.
The subsequent attribution-page/documentation change does not alter financial calculations.

## Automated Checks

| Package | Check | Actual result |
| --- | --- | --- |
| Backend | `npm test` | PASS: 104 suites, 916 tests |
| Backend | `npm run lint` | PASS |
| Backend | `npm run check:architecture` | PASS |
| Frontend | `npm test` | PASS: 81 suites, 502 tests |
| Frontend | `npm run lint` | PASS |
| Frontend | `npm run build` | PASS; 627 kB chunk warning remains |

Mongo integration tests use temporary isolated replica sets, not an existing business database.
Key regressions are in `backend/tests/integration/employee-payroll.test.js`,
`finance-source-writers.test.js`, `admin-settlement.test.js`, `demo-service-catalog.test.js`,
and `frontend/tests/unit/employee-payroll.test.jsx`, `service-basket.test.jsx`.

## Authenticated Browser Check

Used the composed application, real Mongo session cookies, same-origin Vite proxy and CSRF.
Users, signed-contract references, timecards, statutory assessments, pets, and an existing completion
credit were synthetic fixtures in a disposable Mongo database. No API responses were intercepted.

1. Customer retrieved all thirteen services and the customer's own pet.
2. Customer quoted three bathing visits plus three home-care visits: 660,000 VND base,
   39,600 VND combo discount, 620,400 VND total and mandatory PREPAY.
3. Employee submitted a 1,000,000 VND advance. Admin approved and recorded a synthetic bank reference.
4. Admin approved an existing weekly salary statement and recorded a separate synthetic reference.
   Employee API returned both records as PAID; the itemized statement was 714,818 VND payable.
5. Customer, employee and Admin screens were checked at 1440x1000 and 390x844, including expanded
   contract/assessment forms. No page errors, broken images or horizontal overflow were observed.

PAID here means a persisted Admin payment record, not a bank transfer initiated by the application.
The browser check starts from a synthetic completion credit. Real check-in/checklist/check-out
writers and transactional credit creation are covered separately by the Mongo source-writer tests.

## Remaining Acceptance Work

- Customer basket currently produces a quote, not a finalized booking or a real payment link.
  Booking creation must persist dedicated employee service net snapshots and the separate
  customer payment snapshot; legacy values must not be inferred as commissionable money.
- Actual workplace ward/commune, full-time hours, verified contract backfill and per-period
  timecard/tax/insurance evidence remain operational inputs. Current statutory tax/insurance
  research is incomplete; no blanket rate is claimed or applied automatically.
- PREPARED payroll can be voided with reason and replaced. Approved/paid correction needs an
  audited adjustment/reconciliation workflow; current endpoints refuse destructive edits.
- Payroll lists are bounded (100 Admin, 50 employee records) and do not yet provide history pagination.
- Independent review is outstanding. The current #65 dependency history contains contributions
  from all five members, so none may be presented as its sole independent non-contributor reviewer.
  Ngọc Thành coordinates unassigned review; this is not an approval or a waiver of the rule.
- No protected branch merge, production deployment, real provider payment, SMS or R2 activation.
