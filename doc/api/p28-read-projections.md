# P28 read projection integration proposal

## Update, 30 October 2026

The durable earnings adapter is now implemented against PR #63's persisted
booking snapshots and ledger. Booking earnings return `bookingId` (not a fabricated
visitId), the stored completion instant and disjoint financial buckets. The
adapter uses one snapshot transaction, owner/date predicates, signed scoped
cursors, 50-row pages, and a bounded ledger reconciliation. Missing snapshot joins
remain pending and ledger inconsistencies return 503. Existing injected visit
projections continue to work. All displayed money comes from backend records.
The corresponding [FIN-07/08 decisions](../requirements/finance-decisions-2026-10-30.md)
are approved; operational source production and actual tax assessments still have
to be integrated. All eight read adapters are implemented. Availability depends
on their primary collections and producer integration, as detailed below.

Status: **INTEGRATION_PENDING**, DTO proposal for P01/P34 review, 15 October 2026.
The P28 runtime read module and frontend role routes are now composed. A durable
P41-backed Admin payroll reader is available when runtime Mongo/auth configuration is
present; it remains pending until persisted settlement requests, sitter user joins and
policy decision versions satisfy the read contract. Operational and approved-profile
readers use the canonical collections; absent sources remain pending.

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
P41's `readOwn` DTO (balances/earnings/requests/quota) is not used directly.
The implemented reader joins immutable BookingEarningSnapshot, Earning and ledger
records, with `bookingId` for booking-level earnings. It requires the stored
completion timestamp, versioned decisions and reconciled disjoint buckets;
missing fields must not be inferred or filled with zero.
No commission, price multiplication or undocumented financial rule is introduced.
Totals use `totalsScope: PAGE`; they are never advertised as totals for an entire period.

Profile/directory items: id, displayName, bio, areas, reviewCount, rating (null if none).
Only approved sitter profiles and permitted moderated aggregate ratings are accepted;
no private documents, contacts, customer text reviews or home-access data is exposed.
Self profile rejects another sitter row. The user separately approved sitter-authored
profile submission and Staff/Admin moderation on 30 October 2026; those authenticated
commands are documented in the profile module. The directory retains the roles above.
Payroll items expose request id, sitter display name,
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

Open gates: primary completion/payment/assessment/case/refund and review-moderation
writers, their transactional financial hooks, actual source acceptance and current
Figma frames. FIN-07/08 rules have been approved; the default settlement runtime
remains closed until source writers enforce them. Existing P04/P48 components are reused.

### Concrete source gaps found during the PR audit

Update, 30 October 2026: all four operational dashboards now have a Mongo read
adapter for the canonical P01 collections. It never provisions them. Missing
collections still return INTEGRATION_PENDING. The concrete mapping is ObjectId
`Visit._id/bookingId/sitterId`, BSON Date `Visit.startAt`, Booking.customerId,
Offer.visitId/sitterId/state/deadline, Case.visitId/state, Bill.bookingId/state/dueAt.
Customer ownership is joined before counts or paging. Metrics cover the filtered
period, independent of cursor; date filters apply to Visit.startAt, Bill.dueAt and
Application.createdAt. Upcoming visits are SCHEDULED/ASSIGNED after server time;
unpaid bills are ISSUED/ON_HOLD; pending offers require an unexpired deadline;
unassigned visits are SCHEDULED with null sitter; open cases are OPEN/UNDER_REVIEW;
pending applications are PENDING/UNDER_REVIEW/INTERVIEW. All queries in a response
share one snapshot and 5-second server query limits. Cursors bind actor/filters.
No public profile or operational writer is inferred from these readers.

Public profiles now use a separately authored/reviewed SitterPublicProfile source.
Only APPROVED profiles with active User/SitterStatus join moderated PUBLISHED
CUSTOMER_TO_SITTER rating aggregates. Missing moderation collection stays pending.
The older audit below describes the missing primary producer flows, not the new
read-adapter implementation status.

The current integration base contains User/identity, SitterApplication/SitterStatus,
catalog/settings and public-policy models. It has no persisted Visit, Offer, Bill,
Case or moderated Rating model. The following gaps cannot be filled by treating an
absent collection as a ready empty source or by inventing a parallel domain schema.

| Projection | Implemented reader / remaining primary source |
| --- | --- |
| Admin dashboard | Mongo application/visit/case counts and visit pages implemented; operational writers remain required. |
| Customer dashboard | Mongo owner-scoped Visit/Bill counts and pages implemented; schedule and billing writers remain required. |
| Sitter dashboard | Mongo assigned Visit and pending Offer counts/pages implemented; assignment and offer writers remain required. |
| Staff dashboard | Mongo unassigned Visit and open Case counts/pages implemented; operational writers remain required. |
| Sitter profile and directory | Separate profile submission/review storage implemented; moderated review producer remains required. Application text is excluded. |
| Earnings | Snapshot/earning/ledger reader implemented; whole-booking completion, verified receipt, confirmed tax and financial hold producers remain required. |

Payroll consumes P41 SettlementRequest and User records directly. Isolated
Mongo integration tests verify the read contracts with synthetic persisted rows; they
do not verify the settlement commands, a production collection or any transfer provider.
