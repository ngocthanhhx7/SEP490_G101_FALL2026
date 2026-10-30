# Workspace analytics and service combo controls

All paths below are relative to `/api/v1`. Session authentication is required.

## Analytics

`GET /workspaces/:kind/analytics?days=7` accepts only `7`, `30` or `90` days.
Unknown query keys return 422. Kinds `users`, `services` and `admin` require
Admin; `staff` accepts Staff/Admin; `sitter` requires Pet Sitter; `customer`
requires Customer. Sitter counts constrain the assigned employee; Customer
counts join bookings owned by the authenticated account.

The response envelope contains `data.kind`, `days`, ISO `asOf`, calendar `from`
and `to`, `metrics: [{label,value}]`, `trend: [{date,value}]`, `trendLabel` and
`distribution: [{key,value}]`. Counts are nonnegative integers. Daily buckets
use Asia/Ho_Chi_Minh and include zero days. Reads use one snapshot transaction,
independent of table pagination. Responses use `Cache-Control: private, no-store`.

Missing source collections return 503 `ANALYTICS_SOURCE_UNAVAILABLE`. Actual
empty sources return zero counts. Authentication/role failures return 401/403.
These aggregates do not calculate earnings, revenue, tax or employee scores.
The Users role distribution can count one account in multiple roles.

## Combo Versions

`GET /pricing/services/:serviceId/combo` requires Admin and returns
`{latestVersion, policies:[{version,status,effectiveAt,comboPerVisitBps,
comboMaxBps,reason}]}` with up to 50 recent policy versions.

`POST /pricing/services/:serviceId/combo` requires Admin and valid session CSRF.
The body requires `expectedVersion`, ISO `effectiveAt`, `reason`, integer
`comboPerVisitBps` and `comboMaxBps` (0 through 1000). Per-visit discount cannot
exceed the cap. The latest policy must already be approved. This command clones
its full deterministic rules, records the approving Admin and creates a new
version. It returns 201 `{serviceId,version}`. Conflicting edits return 409;
invalid fields return 422. Existing quotes/bookings keep their snapshots.

The existing price history and service policy endpoints retain their contracts.
The interface presents them as dialogs within `/admin/services`; the old
`/admin/service-prices` browser route redirects there. Removal archives a service
version and preserves history.

## In-App Notifications

Existing recipient-scoped notification list/read APIs are retained. Producers
now include scheduling invitation/response/reschedule, verified payOS payment
or reconciliation, payroll changes, application decisions and visit check-in/out.
Messages commit in the same transaction as domain changes and use stable event
and recipient identifiers. Account-wide records with `role:null` remain readable
only by their recipient. Financial details and private application content are
not copied into message text. Delivery by email/SMS/web-push is separate.
