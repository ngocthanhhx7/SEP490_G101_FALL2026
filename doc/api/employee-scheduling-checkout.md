# Employee Scheduling And Checkout

Implemented demo composition, 30 October 2026. Authentication is mandatory; all mutations need
same-origin CSRF. Versioned mutations also need an `Idempotency-Key`. Unknown acknowledgements
must be reconciled/retried with the original payload and key. Responses are private/no-store.

## Travel And Map Search

Travel requires `VISIT_TRAVEL_ENABLED=true` as well as employee scheduling. Authentication,
CSRF for writes, private/no-store responses and ownership checks are mandatory.

| Method/path under `/api/v1/employee-scheduling` | Input/result |
| --- | --- |
| GET `/travel-visits` | Staff/Admin; current assigned travel-window visits, cursor pagination, 20 per page |
| GET `/visits/:id/travel` | Assigned employee, owning customer or Staff/Admin; latest status and fresh location only |
| POST `/visits/:id/travel` | Assigned employee; action START/STOP/ARRIVED and expectedVersion |
| PUT `/visits/:id/travel/location` | Assigned employee; sessionId, coordinates [lng,lat], accuracyMeters, observedAt |
| POST `/visits/:id/travel/eta` | Authorized viewer; empty object; advisory minutes/source/observedAt/recordedAt/arrivalAt |

Travel transitions use optimistic expectedVersion, not an idempotency ledger. After an uncertain
acknowledgement read the current state before another transition. GPS samples are monotonic per
session; STOP/ARRIVED rotates away the session and removes its coordinates. Rate limits per
account/instance: 120 reads, 20 writes, 2 ETA calculations per minute. No background GPS promise,
care completion, automatic assignment change or financial effect. The window is startAt minus
120 minutes through endAt; freshness is 90 seconds and maximum accuracy error is 100 m.

Map API `/api/v1/maps/search` accepts POST `{query}` with `MAPS_ENABLED=true`. Configured
Google returns at most five `{label, coordinates}` results. Vietmap returns
`{label, provider:'VIETMAP', refId}` and requires POST `/api/v1/maps/places/resolve`
with `{provider, refId}` for the selected suggestion. Both endpoints share a ten-request budget
per account/minute/instance. Suggestions do not save or confirm customer addresses.
See [provider setup](../deployment/google-goong-maps.md).

## Checkout

Root `/api/v1/checkout`, CUSTOMER only, opt-in `BOOKING_CHECKOUT_ENABLED=true`.

| Method/path | Input and result |
| --- | --- |
| GET `/options` | Published employee options, configured facility address and `recommendationAllowed` (no owned COMPLETED care visit) |
| POST `/availability` | Owned current `quoteId`, one `visit`; optional `directory: true, page` returns all service-registered employees ordered by published Customer rating, 20 per page, with `eligible`, safe `unavailableReason`, `rating`, `reviewCount`, `nextPage` and `complete` |
| POST `/bookings` | Owned `quoteId`, `acceptServicePolicies=true`, `visits` with `itemIndex`, `startAt`, `location`, optional owned `addressId` and `requestedSitterId` |
| GET `/bookings/:id` | Owning customer's persisted booking, customer visit presentation and pending schedule proposals |
| POST `/bookings/:id/payment-link` | Server-owned amount/order reference; provider URL or explicit provider/reconciliation error |

Quotes cannot be reused. Checkout revalidates owned pets, current price/service/policy versions,
consent, address and overlap before saving one immutable customer/payment snapshot. Service
amounts after combo are allocated exactly across visits using largest remainders. The employee
commission basis excludes order fees and is distinct from the customer payment total.
Multi-visit and multi-day stays require verified full prepayment within fifteen minutes.
Browser redirects are not payment evidence; late callbacks require reconciliation and cannot
revive expired unpaid bookings. Payment link creation uncertainty does not create a second link.

## Scheduling

Root `/api/v1/employee-scheduling`, opt-in `EMPLOYEE_SCHEDULING_ENABLED=true`.

| Method/path | Role and purpose |
| --- | --- |
| GET/PUT `/availability` | PET_SITTER, own recurring windows and shared expectedVersion |
| GET `/calendar` | PET_SITTER, own fromLocalDate/toLocalDate, maximum 31 days |
| GET/PUT `/work-areas` | PET_SITTER, own operational area codes, shared expectedVersion |
| GET `/offers`, `/assignments` | PET_SITTER, own bounded lists; optional cursor and limit |
| POST `/offers/:id/acceptances`, `/declines` | PET_SITTER, expectedVersion, explicit response |
| GET `/dispatch` | STAFF/ADMIN, next 50 eligible operational visits and pending invitation/review status |
| POST `/visits/:id/invitations` | STAFF/ADMIN, expectedVersion and optional sitterId |
| GET `/visits/:id/candidates` | STAFF/ADMIN, startAt with timezone and optional areaCode; bounded eligible names/IDs or aggregate rejection counts; 6 requests per minute/account/instance |
| POST `/visits/:id/schedule-proposals` | STAFF/ADMIN after escalation, expectedVersion, alternative startAt, optional sitterId and areaCode; directed employee cannot be replaced |
| GET `/proposals/:id` | Owning CUSTOMER only |
| POST `/proposals/:id/confirmation` | Owning CUSTOMER, expectedVersion and selectedSlot; atomically changes operational time and creates invitation |
| GET `/care-plans` | STAFF/ADMIN, bounded plan queue |
| POST `/care-plans/:id/preview`, `/finalization` | STAFF/ADMIN, expectedVersion and shiftMinutes (60..480) |

Separate pages are `/sitter/work-areas`, `/sitter/availability`, `/sitter/invitations`,
and `/staff/dispatch`. Staff proposals are not customer consent. The proposal page is
`/account/schedule-proposals/:proposalId`; the owning booking links to it.

Invitations last up to fifteen minutes, never beyond shift start. They do not assign work.
Acceptance rechecks signed contract coverage, approved account/capabilities, pet snapshot,
areas, effective recurring windows, approved leave, overlap, contractual weekly hours,
eight ordinary hours/day and fresh route/buffer evidence. Directed invitations cannot
substitute a different employee. Missing evidence requires Staff review. Ordinary work hour
checks do not authorize overtime or replace attendance/payroll assessment.

Checkout automatically finalizes the care plan in its transaction; Staff approval is
not a prerequisite. The worker recovers compatible legacy orders at NEEDS_REVIEW.
Staff can send invitations only after a dispatch escalation. GET /dispatch exposes
dispatchState SYSTEM_SEARCHING/AWAITING_RESPONSE/NEEDS_STAFF and pendingInvitationCount.

Boarding retains the original customer stay/price/combo count and is finalized into continuous
unassigned care shifts <=8 hours. Commission basis is allocated by shift duration; actual
attendance is recorded by check-in/out. Employees can start accepted shifts while future shifts
await dispatch. Moving a single boarding shift is rejected: whole-stay changes need review/requote.

`EMPLOYEE_DISPATCH_AGENT_ENABLED=true` starts the runtime worker. It resumes from persisted
visits/offers after restart; pending/declined/expired offers are not repeatedly sent to the same
candidate automatically. System bookings target five concurrent eligible invitees,
replenishing declines where possible. Fewer are permitted only for a smaller eligible
pool within the bounded search (100 employees, four concurrent checks). Directed bookings
retain their single customer-selected sitter. Automatic selection requires declared
daily origins and route feasibility, including return before the origin's availableUntil.
MATCH advice keeps its original score >=60 rule; operational route ordering can invite
eligible newcomers without fabricating scores or verified history. It is not a trained
quality prediction. The first accepted invitation revokes the others transactionally.
When no eligible untried candidate and no live invitation remain, the transaction records
DispatchReviewRequired and an in-app message for each active Staff/Admin, once per episode.
A single decline does not notify operators while the system can continue.
Staff may explicitly reinvite after escalation. Optional advisory ranking cannot
bypass eligibility or create assignments. HouseBuddy was a read-only reference for the
two-screen workflow, not a source of its contract/edit-frequency policies.

`CITY_HANOI` and `DISTRICT_HAI_BA_TRUNG` are demo operational coverage codes, not a current legal
administrative boundary registry. A registered city covers its configured child zones. New
customer addresses select from the same catalog. Existing legacy area codes need verified
mapping before employee dispatch; no silent migration changes private customer addresses.

## Maps And Storage

POST `/api/v1/maps/search`, authenticated roles and CSRF, body `{ "query": "..." }`.
Opt-in `MAPS_ENABLED=true`. Returns configured Google/Vietmap suggestions; saving an address still requires
explicit owner confirmation. See [provider setup and live-check limitations](../deployment/google-goong-maps.md).

Run `node scripts/migrations/employee-scheduling-storage.js` to preview the additive storage plan.
The script's guarded `--apply` is for an explicitly selected non-production development database.
Finance source and payroll migrations are separate prerequisites. Runtime does not delete
collections or provision missing indexes; synthetic tests use isolated Mongo replica sets.

## Dispatch recovery (4 November 2026)

`GET /dispatch` also returns `workAreas` and stored aggregate `diagnostics` for
failed automatic searches. Rejection counts contain no employee identities or
private schedule/origin information. Candidate previews are current read-only
checks, not reservations or historical eligibility evidence. Changing form input
invalidates the preview; proposal creation, customer confirmation and offer
acceptance all recheck current facts.

System recovery requires an eligible nominated sitter. Optional `areaCode` may
only keep the current code or refine a HOME visit to a direct child area in the
operational catalog. Staff cannot relocate the saved pin or choose another
unrelated district. Customer proposal projections show `areaCode`, `areaLabel`
and `previousAreaCode` before consent. Existing customer/financial/address
snapshots remain immutable. Confirmation atomically changes operational time/area,
revokes old pending offers and creates a pending invitation. It does not assign
a sitter. System-origin/route requirements remain in effect on acceptance.
The confirmed nominee becomes the operational `requestedSitterId`, so automatic
replenishment cannot replace the employee the customer just confirmed. This does
not rewrite the original checkout booking-mode snapshot or assign the employee.

An overdue shift returns `SHIFT_START_REACHED` for invitation commands. Staff
must use customer-confirmed recovery, rather than retrying a time in the past.
Boarding stays continue to require whole-stay review. AI MATCH threshold and
verified training-data requirements are unchanged.

Customer AI recommendation requests return `CUSTOMER_CARE_HISTORY_EXISTS` after an owned care visit is COMPLETED. Product purchases and uncompleted visits do not count. The manual directory does not use AI thresholds; unavailable employees remain visible but cannot bypass checkout eligibility. See [selection policy](../architecture/directed-sitter-selection-2026-11-09.md).
