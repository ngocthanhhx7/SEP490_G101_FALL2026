# FIN-07 / FIN-08 decision addendum

Version: `PWC-FIN-07-08-2026-10-30-v1`. Approved by the user on
30 October 2026, Asia/Ho_Chi_Minh, in response to the concrete proposal below.
This supersedes the corresponding open decisions in
[P51](p51-financial-contract-v1.md); it does not approve missing payment allocation
or statutory tax rules.

- Earning becomes available only after the whole booking has completed with
  verified evidence, verified payment and allocation, and a confirmed tax
  assessment amount T. Missing T remains pending; zero must be explicitly assessed.
- Open complaints and refunds hold the affected funds. Release requires an
  audited conclusion. No release is inferred from a missing source record.
- After payout, record a separate adjustment awaiting Admin approval. Never
  rewrite paid history, automatically deduct later earnings, or execute recovery.
- A request may be withdrawn/rejected only while Submitted. Approved and later
  states require reconciliation; its amount cannot be edited.
- Retain the approved progressive completed-booking weekly fees, integer VND,
  half-up rounding, and equal tax cost split with the platform bearing the odd VND.

These are eligibility and state rules. They do not confirm a taxpayer category,
tax rate, allocation algorithm, tax amount for any booking, or actual bank transfer.

`earning-accrual.service.js` consumes a trusted transactional source port. A
completion/payment notification supplies identifiers, never client-selected money.
The port must join authoritative completion evidence, payment receipt, service
allocation, confirmed tax assessment and active holds in the supplied Mongo session,
and serialize hold writers with accrual/reservation writers. There is no public
snapshot-import endpoint and no default ready adapter.

The booking ordinal is claimed once in the authoritative completion transaction,
before payment or assessment readiness; retries return the immutable stored result.
The week comes from the authoritative completion instant. The source producer
must call `recognizeCompletion` with its session at that transition. A delayed
payment cannot change fee tiers. Missing operational source adapters remain
an integration gate, even when synthetic integration tests pass.

## Additional user confirmations

Multi-visit bookings require prepayment. The user subsequently approved allocation
of collected service money by immutable visit price snapshots, and allocation of
confirmed tax amount T by those same proportions, aggregated by sitter. A payment
receipt must not be inferred from booking submission. Unknown tax stays unknown.
Whole-VND allocation uses largest fractional remainders with a stable visit-id
tie break so the allocated sum exactly equals T; this is an implementation of the
approved proportions, not a tax-rate decision or a change to fee rounding.

For PR #65 the user approved a separate sitter-authored public bio/work-area
profile reviewed by Staff/Admin. Application text is not a publication source.
Ratings aggregate only CUSTOMER_TO_SITTER reviews in PUBLISHED state; customer
comments and identity are excluded from the directory.
