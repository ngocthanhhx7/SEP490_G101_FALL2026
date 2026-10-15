# P28 read projections

Export-only services consume a trusted `repository.readSnapshot({ scope, query })` port.
A durable P41-backed payroll adapter is registered when the runtime has a Mongo connection
and the auth cursor secret; it reads `SettlementRequest` rows and approved `User` display
names. It fails closed when either collection is absent, the join is incomplete, policy
versions are mixed, or the persisted decision version is missing. The other projections
remain unregistered until P01/P34 supply their source adapters. Explicit repository ports
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
