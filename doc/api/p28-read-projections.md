# P28 read projection integration proposal

Status: **INTEGRATION_PENDING**, DTO proposal for P01/P34 review, 15 October 2026.
The P28 runtime read module and frontend role routes are now composed. A durable
P41-backed Admin payroll reader is available when runtime Mongo/auth configuration is
present; it remains pending until persisted settlement requests, sitter user joins and
policy decision versions satisfy the read contract. The other source repositories remain
explicitly pending until the P01/P41/P20 adapters are supplied.

| WBS | Factory service / router prefix | GET under /api/v1 | Allowed roles | Page export |
| --- | --- | --- | --- | --- |
| 047 | Earnings | /me/earnings | PET_SITTER owner | SitterEarningsPage |
| 054 | AdminDashboard | /dashboards/admin | ADMIN | AdminDashboardPage |
| 057 | SitterProfile | /me/sitter-profile | PET_SITTER owner | SitterProfilePage |
| 058 | SitterList | /sitters | CUSTOMER, STAFF, ADMIN | SitterListPage |
| 067 | CustomerDashboard | /dashboards/customer | CUSTOMER owner | CustomerDashboardPage |
| 068 | SitterDashboard | /dashboards/sitter | PET_SITTER owner | SitterDashboardPage |
| 069 | StaffDashboard | /dashboards/staff | STAFF, ADMIN | StaffDashboardPage |
| N07 | Payroll | /payroll | ADMIN | AdminPayrollPage |

Files are `backend/src/services/dashboards/<kind>.service.js` and
`backend/src/routes/<kind>.routes.js`. For example `createEarningsService({ repository })`
and `createEarningsRouter({ service, sessionPort })`. See the
[repository port contract](../../backend/src/services/dashboards/README.md) and
[page composition guide](../../frontend/src/pages/dashboards/README.md).
`dashboardReadRuntimeModule` registers these routers below the existing `/api/v1`
error/session conventions when authentication is enabled, without replacing the
independent P41 settlement command router. All responses are private/no-store. A
missing repository still returns HTTP 202 with null data and `INTEGRATION_PENDING`;
runtime registration is not evidence that a persistent source is available.

Success uses `{ data: { kind, asOf, sourceVersion, timeZone, metrics, items, nextCursor }, meta }`.
Metrics are allowlisted `{ key, label, value, currency? }`, integer nonnegative counts/VND.
`asOf` is an offset-aware ISO timestamp of the atomic source snapshot, not a fabricated
client refresh timestamp. Missing source/unresolved financial decision uses HTTP 202,
`data: null`, `meta.integration: INTEGRATION_PENDING`. Errors use the central envelope:
401 unauthenticated/expired, 403 wrong role, 422 invalid filter, 503 invalid projection.
Source outages propagate as errors rather than a successful empty projection.

Queries allow only from/to (inclusive Vietnam dates), cursor, search, limit (1..50).
Identity/role/owner filters from the client are rejected. Directory search is literal
and bounded to 80 characters. Repository must constrain ownership BEFORE aggregation
and paging; bind signed cursors to scope, filters and stable sort. Source adapters must
resolve day boundaries in Asia/Ho_Chi_Minh, not the execution host's timezone.
Dashboard counts cover the query period; visit items are a bounded page of that period.
Payroll from/to filter submission dates, while requestWeekKey remains the request week,
not an earning period. Profile reads have no date form; directory exposes search only.

Earnings items: id, visitId, state, accrued, pending, available, held, reserved, paid,
completedAt, explanation, ledgerReference, transferRecordedAt. Source partition balances
sum to accrued; canceled visits are excluded; Paid requires transfer evidence timestamp.
Only the authoritative P41 snapshot can establish eligibility and policyVersion.
P41's current `readOwn` DTO (balances/earnings/requests/quota) is not a drop-in
source for this visit-level projection: its totals now expose disjoint held/pending
partitions, but it lacks the completed-visit state/timestamp join and the P28
paginated atomic snapshot required
here. P01/P41 must approve and
implement the read adapter; missing fields must not be inferred or filled with zero.
No commission, price multiplication or undocumented financial rule is introduced.
Totals use `totalsScope: PAGE`; they are never advertised as totals for an entire period.

Profile/directory items: id, displayName, bio, areas, reviewCount, rating (null if none).
Only approved sitter profiles and permitted moderated aggregate ratings are accepted;
no private documents, contacts, customer text reviews or home-access data is exposed.
Self profile rejects another sitter row. Public directory access and profile editing
are not approved by this proposal. Payroll items expose request id, sitter display name,
state, amountVnd, requestWeekKey and optional transferRecordedAt; bank data is omitted.
Approved explicitly does not mean Paid. P28 never creates a payout or settlement request.

The payroll adapter reads only the persisted `SettlementRequest` projection and a
role-scoped `User.displayName` lookup. It uses the request's stored policy and decision
versions, signs cursors to the Admin scope and filters, and returns `INTEGRATION_PENDING`
for missing joins, mixed policies or incomplete rows. Its Mongo aggregation uses snapshot
read concern, and the source timestamp includes joined sitter display-name updates.
It does not create indexes, mutate
settlements, infer a commission/tax rule, or expose transfer evidence metadata.

UI: the eight pages are mounted inside the existing P48 `RoleDashboardLayout` with
role-specific navigation in `frontend/src/routes/AppRoutes.jsx`. The backend runtime
module and these routes are composition points; preview fixtures still only prove
rendering, and real repositories are required for non-pending responses.

Open gates: P01 read DTO approval; P20/P24/P27/P30/P31/P41 persistent read adapters;
FIN-07-ELIG/POSTPAY for financial eligibility, FIN-08-EDIT for related settlement commands;
P34/P01 source composition; current Figma frames. Existing P04/P48 components are reused.

### Concrete source gaps found during the PR audit

The current integration base contains User/identity, SitterApplication/SitterStatus,
catalog/settings and public-policy models. It has no persisted Visit, Offer, Bill,
Case or moderated Rating model. The following gaps cannot be filled by treating an
absent collection as a ready empty source or by inventing a parallel domain schema.

| Projection | Missing authoritative source or mapping |
| --- | --- |
| Admin dashboard | Application states exist, but `needsAction` and visit rows need the operational Visit/Case model and state contract. A partial count cannot satisfy the complete DTO. |
| Customer dashboard | Owner-scoped Visit schedules and unpaid Bill records, including their period/count semantics. |
| Sitter dashboard | Assigned Visit and pending Offer records with sitter ownership and stable paging. |
| Staff dashboard | Unassigned Visit and open Case records with approved operational state/count definitions. |
| Sitter profile and directory | Approved public profile/bio and moderated Rating aggregates. Application `experience`/`workAreas` exist, but application approval does not establish permission to publish application text; missing reviews cannot be assumed to mean zero. |
| Earnings | P41 supplies Earning/ledger partitions, but an adapter still needs completed Visit state/time, the approved eligibility policy and an atomic bounded P28 read contract covering every partition. Settlement request-selection/read DTOs are not that projection. |

Payroll alone can consume P41 SettlementRequest and User records directly. Its isolated
Mongo integration tests verify that read contract with synthetic persisted rows; they
do not verify the settlement commands, a production collection or any transfer provider.
