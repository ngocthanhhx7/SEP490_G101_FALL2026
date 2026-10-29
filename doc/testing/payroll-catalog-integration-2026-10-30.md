# Employee Payroll And Demo Catalogue Integration

Checked 30 October 2026 on `feature/demo-service-catalog`, based on `e7a79ce` plus the
checkout, scheduling and maps changes committed with this evidence. Earlier checks against
`cdcdbda` are superseded below. Provider activation and independent review remain separate gates.

## Automated Checks

| Package | Check | Actual result |
| --- | --- | --- |
| Backend | `npm test` | PASS: 108 suites, 946 tests |
| Backend | `npm run lint` | PASS |
| Backend | `npm run check:architecture` | PASS |
| Frontend | `npm test` | PASS: 84 suites, 520 tests |
| Frontend | `npm run lint` | PASS |
| Frontend | `npm run build` | PASS; 675.75 kB chunk warning remains |

After the full run, the accepted-assignment DTO was extended to expose its service address
for navigation only in ASSIGNED/IN_PROGRESS states. The affected scheduling integration suite
(11 tests), offer domain suite (12 tests) and backend lint passed again. Pending offers still
omit that address. Browser checks below were repeated against the composed runtime.

Mongo integration tests use temporary isolated replica sets, not an existing business database.
Key regressions are in `backend/tests/integration/employee-payroll.test.js`,
`finance-source-writers.test.js`, `admin-settlement.test.js`, `demo-service-catalog.test.js`,
`booking-checkout.test.js`, `employee-scheduling.test.js`, `commercial-maps.test.js`,
`maps-routes.test.js`, and frontend payroll/basket/checkout/scheduling/address-search tests.

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
6. Customer finalized the six-visit quote into one persisted PREPAY booking, reloaded it and
   retained the same total and fifteen-minute deadline. External payment provider stayed disabled.
7. Employee/Admin paged actual persisted history. Admin recorded a separate supplement payment
   and an agreed recovery reconciliation; original paid salary was unchanged and employee
   responses excluded private financial evidence references.
8. Sitter saved/reloaded work areas and seven recurring daily windows on the two distinct screens.
   Customer created a single directed booking; Staff finalized its unassigned care plan and
   proposed a different time; the owning customer confirmed and the chosen sitter accepted.
   Five scheduling/proposal screens passed both desktop/mobile checks.
9. Goong search correctly showed unavailable with the provider disabled. The manual coordinate
   form remained available and customer area options matched the employee operational catalog.
   Its desktop/mobile screenshots had no page errors or horizontal overflow.

PAID here means a persisted Admin payment record, not a bank transfer initiated by the application.
The browser check starts from a synthetic completion credit. Real check-in/checklist/check-out
writers and transactional credit creation are covered separately by the Mongo source-writer tests.
The boarding regression completes two paid care shifts through check-in/checklist/check-out,
records actual attendance and verifies exact employee credits without partner-price fields.
Commercial maps tests use injected responses, never a live paid provider. No embedded map SDK
or live traffic is claimed. See [maps setup and limitations](../deployment/google-goong-maps.md).

## Remaining Acceptance Work

- Live payOS link/callback smoke checks require project credentials. Synthetic webhook tests
  establish amount/expiry/receipt guards; they do not establish a real transfer.
- Owner selected so 5 pho Tran Cao Van, Hai Ba Trung, Hanoi for the demo. Verified workplace
  classification, full-time hours, verified contract backfill and per-period
  timecard/tax/insurance evidence remain operational inputs. Current statutory tax/insurance
  research is incomplete; no blanket rate is claimed or applied automatically.
- Verify actual customer area mappings for legacy addresses, facility coordinates and provider
  quotas/keys before using road ETA for home/facility dispatch. Embedded draggable maps, live GPS
  and a whole-boarding-stay reschedule/requote workflow are not implemented.
- Independent review is outstanding. The current #65 dependency history contains contributions
  from all five members, so none may be presented as its sole independent non-contributor reviewer.
  Ngọc Thành coordinates unassigned review; this is not an approval or a waiver of the rule.
- No protected branch merge, production deployment, real provider payment, SMS or R2 activation.
