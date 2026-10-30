# Role workspace refresh verification

## Scope

See the [design and execution plan](../ui-ux/role-workspace-refresh-2026-10-30.md)
and [API contracts](../api/workspace-analytics.md). The implementation combines
service, price, combo and policy controls in one Admin table; removes the second
Users navigation shell; adds role-scoped analytics and persistent notification
entry points. Customer retains the public website header/footer and account
navigation. Specialized payroll/dispatch screens retain their domain workflows
and inherit shared workspace styling.

## Executed Checks

- Backend full run: 117 suites, 1005 tests passed. Architecture and lint passed.
- Backend workspace integration rerun after ownership, concurrency and source
  guards: 4 tests passed, including missing source 503, CSRF 403, cross-role
  rejection, Customer booking ownership, snapshot aggregation, historical pricing
  preservation, stale combo 409, notification recipient/idempotency/rollback.
- Frontend full run: 91 suites, 558 tests passed; lint and Vite build passed.
  Service workspace regressions cover filtering/pagination, creation entry,
  price/combo integer payloads, independent versions and stale archive feedback.
- Chromium fixture run: 40 role/page/viewport combinations at 1440, 768, 390
  and 320 pixels. Admin overview/Users/services/notifications, Staff and Sitter
  overview/notifications, Customer overview/notifications. Checked page errors,
  page overflow, nonblank chart pixels and contextual combo dialog bounds.
  Screenshots inspected, including mobile service columns and dialog framing.
- Corrected route focus scrolling underneath sticky headers and narrow service
  table columns. Table overflow remains inside its scroll container.

## Evidence Limits

Browser API interception uses synthetic fixtures. Real repository services are
covered by isolated Mongo replica-set integration tests, not fixture screenshots.
The inspected local users collection was empty; no accounts, contracts, financial
receipts or visits were fabricated in the existing database. Production smoke
results and release references are recorded after actual deployment.

Catalog pagination operates over the existing complete Admin catalog response
(13 provisioned services). User/operational tables retain API cursor pagination.
Analytics aggregate all matching rows, independent of current pages.

Build warns about the main application and lazy Vietmap bundles exceeding
500 kB. The dependency installation reports five low development audit findings.
Neither changes domain acceptance. Real successful payOS callback, real-device
GPS and actual payroll operations remain separate live acceptance requirements.
