# P28 read projections

## Integration update, 2026-10-30

`mongo-earnings.repository.js` now reads booking-level Earning records, immutable
BookingEarningSnapshot joins and the corresponding ledger in one Mongo snapshot.
It checks every disjoint bucket against ledger principal, retains persisted
amounts, filters the authenticated sitter before querying, uses inclusive Vietnam
dates and signed scope/filter-bound cursors, and bounds pages to 50 and ledger
reads to 10000 lines. Missing snapshots remain pending; inconsistent ledger money
returns INVALID_PROJECTION. Source ids, payment/evidence references and assessment
details are excluded from the response. Only page totals are returned.

The completed-booking snapshot is the authoritative completion fact for these
rows, so the earnings DTO supports `bookingId` without pretending it is a visit.
Existing visit-level injected adapters remain compatible. This repository cannot
create earnings; PR #63's source producer still needs its operational adapters.
All eight projections now have durable readers. Operational readers use the P01
Visit/Booking/Offer/Bill/Case collection mapping documented in the API contract.
The primary producer flows still need integration; missing collections are not
converted into a successful empty result.

The user-approved public-profile flow now has a separate durable submission/review
service and `/api/v1/sitter-public-profiles` API. Sitter edits require reapproval;
Staff/Admin cannot self-approve. Commands serialize on active User/SitterStatus,
use version checks and durable idempotency, and append content-hash audit records.
Provision its additive indexes explicitly using
`scripts/migrations/sitter-public-profile-storage.js --apply` in local/test only.
Profile/directory readers join APPROVED profiles with active users and status,
then aggregate only PUBLISHED CUSTOMER_TO_SITTER ratings. An absent `reviews`
moderation collection stays pending. Signed directory/review cursors bind scope.
No application text, review comment, customer identity or private document appears.

Dashboard routes now wire an HTTP controller; the service imports role rules from
utils rather than middleware. Shared composition retains current pricing, matching,
private-image and settlement routes. All financial endpoints remain independent
of AI.

Export-only services consume a trusted `repository.readSnapshot({ scope, query })` port.
A durable P41-backed payroll adapter is registered when the runtime has a Mongo connection
and the auth cursor secret; it reads `SettlementRequest` rows and approved `User` display
names. It fails closed when either collection is absent, the join is incomplete, policy
versions are mixed, or the persisted decision version is missing. The other readers
remain pending when their authoritative collections are absent. Explicit repository ports
passed by composition override the durable default.
Each snapshot must be read atomically from its source (consistent counts and rows),
with `{ ready, scope, sourceVersion, asOf, metrics, items, nextCursor }`.
The Mongo payroll reader uses snapshot read concern across requests and user joins;
its source timestamp includes both request and joined sitter updates.
Scope is echoed exactly; repository queries must constrain ownership BEFORE counts, search or pagination.
Query dates are inclusive Vietnam calendar dates; convert to [from 00:00 +07:00,
day-after-to 00:00 +07:00). Cursors must be opaque, signed, query/scope-bound and use
stable `(sortKey,id)` ordering; expired/foreign/filter-mismatched cursors are rejected.
Never interpolate search into a raw regex or Mongo expression. The payroll adapter escapes
the bounded literal before its user lookup; a future source must provide an equivalent
literal/indexed search contract. Limit defaults to 20,
maximum 50. Adapters perform pagination, not an in-memory full collection scan.

Missing/unready adapters return HTTP 202 with null data, never fabricated zero totals.
Source failures propagate to the central error middleware. Private responses are
no-store. Authentication and role gates run both at HTTP and service boundaries.
Services project allowlisted fields; customer/sitter visit rows check ownership again.
Staff and Admin aggregate data is operational only; payroll has an independent Admin gate.

Earnings consumes P41's authoritative ledger projection, not booking prices or guessed
commission. Financial sources must declare an approved policyVersion and no open
decisionIds. Entries require disjoint pending/available/held/reserved/paid balances
summing to accrued, a ledgerReference and explanation. Paid additionally requires a
transfer timestamp. Cancelled visits never count. Page subtotals are explicitly PAGE,
not lifetime or period totals. StaffClosed eligibility belongs to P41/FIN-07.
Payroll reads settlement request projections only; no bank, contact or evidence URL
is exposed. No P28 endpoint performs a mutation, payout, settlement or replay.

Sitter profile/list consume approved profiles and moderated aggregate ratings from
P16/P30. Profile is self-only. The directory is Customer/Staff/Admin only until P01
approves public discovery. No private documents, contacts, home access or customer
review text are returned. P42 owns the separate directed booking proposal flow.
