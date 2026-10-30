# Assigned care, matching selection and sourced outcomes

## Runtime changes

Checkout stores immutable owner-declared age/sex/care fields and address access
notes under a separate care snapshot. Staff care-plan splitting preserves it.
Offers/assignment summaries and checkout read DTOs do not publish private care.

Under `/api/v1/employee-scheduling`, an active assigned employee can GET
`/visits/:id/care`, POST `/visits/:id/care/acknowledgements` with the snapshot
hash and durable key, then GET `/visits/:id/access-notes` from one hour before
start until end. Current ownership, assignment/booking state and replacement
handover gates are checked on every operation. Old visits without a snapshot
return unavailable; they are never silently enriched from current owner data.

The shortlist can open the normal deterministic quote/checkout for supported
home-care services. Optional visit `matchId` is bound to the owner's unexpired
MATCH, returned candidate, service, pet/address versions and exact times. One
MATCH can create only one booking, including concurrent command retries. It
does not reserve capacity or send an invitation directly. Staff care-plan
approval, verified prepayment where applicable, invitation and acceptance retain
the authoritative contract/capability/leave/area/time/travel/occupancy checks.
Clinic, distance and boarding recommendation plans retain their Staff workflow.

The Customer review runtime mounts when finance sources and employee scheduling
are enabled. POST `/api/v1/reviews/visits/:id/ratings` requires session/Customer/
CSRF, owned completed visit and whole-booking completion, matching immutable
employee credit and completion event. It atomically writes a SUBMITTED review,
one `aivisitoutcomes` record, source versions/event/credit references, audit and
durable replay. Another customer's visit is not discoverable; uncertain retries
retain their payload/key. A preexisting imported outcome fails reconciliation
instead of being overwritten. Public ratings still require PUBLISHED reviews.

The deployed storage command provisions `reviews` unique visit/direction,
Customer review command storage and the existing legacy outcome collection.
No new provider or secret configuration is introduced. Rollback to the previous
release leaves these additive records intact; no database migration is reversed.

## Evidence

All new business data used during verification is synthetic in isolated MongoDB
replica sets. None of it is production operational or training evidence.

- Backend final full suite including the single-use MATCH guard: 116 suites /
  1003 tests passed; final focused 20 tests passed.
- Frontend full suite: 91 suites / 558 tests passed; lint and build passed.
- Architecture and backend lint passed; Python AI 13 and deployment 6 tests passed.
- Focused Mongo tests cover current ownership, reassignment, unknown care,
  acknowledgement/access window, legacy missing snapshot, MATCH expiry/version/
  scope, immutable snapshots, full completed employee workflow, Customer rating
  concurrency/replay, foreign actor and incomplete booking rejection.
- UI tests cover fixed recommendation schedule/reference, access-note
  acknowledgement and identical rating retry after lost response.
- Synthetic browser checks at 1440 and 390 pixels exercised care acknowledgement,
  access notes, rating and MATCH checkout with actual components. No JavaScript
  errors or horizontal overflow; screenshots inspected. This browser harness
  uses synthetic adapters/intercepted HTTP, not provider or production evidence.

## Remaining acceptance

This is operational collection, not a training export or quality claim. Outcomes
carry `trainingEligible: false`; durable point-in-time feature capture, retention,
export authorization and rating correction/withdrawal processing must be decided
before training. Never reconstruct past features from current aggregates.

The new adapters do not implement the separate legacy instruction-revision and
replacement-handover commands. A handover-required visit remains blocked until
the authoritative handover is confirmed. They do not authorize medication use.

Live authenticated payment/assignment/completion/satisfaction acceptance needs
real authorized operational sources. Provider key presence, synthetic fixtures,
passing CI and public readiness do not prove those flows happened in production.
No production accounts, contracts, bookings, payments or ratings were fabricated.
