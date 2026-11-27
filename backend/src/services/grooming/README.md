# Shop grooming booking (UC-58)

Customer reads options, slots and deterministic quotes, books an appointment,
reads their own appointments (including upcoming ones for the dashboard) and
cancels a booked appointment at no charge until two hours before it starts
(GBR-40). The runtime is explicitly gated by
`GROOMING_BOOKING_ENABLED=true`, authentication, configured shop address and
provisioned storage. Public catalog DTOs expose the runtime capability; the
frontend hides shop booking actions while disabled, retaining eligible home care.

| File | Responsibility |
| --- | --- |
| `grooming.service.js` | Customer authorization and API orchestration. |
| `grooming-shop-services.service.js` | Current FACILITY services in Vệ sinh/Làm đẹp with active version, published policy, price and approved pricing policy. |
| `shop-shift-source.service.js` | Explicit employee-registered SHOP windows, current verified FULL_TIME contract, service/species/weight/trait capability, leave, home/shop/block occupancy and ordinary day/week hours. Legacy windows mean HOME. Bounded roster reads fail explicitly on overflow. |
| `grooming-reservation.service.js` | Distinct employee matching for simultaneous pets, each employee eligible for that pet's complete duration and selected services. Counts per hour alone are insufficient. |
| `grooming-slots.service.js` | Preview hourly start times using the same matching; partial-duration availability cannot create an impossible booking. Final booking rechecks everything. |
| `grooming-pet-occupancy.service.js` | Shared bounded appointment read for slot previews and booking confirmation. An overflow requires roster review. |
| `grooming-pricing.service.js` | Current approved per-pet/per-service prices in the booking transaction, integer VND and floor tier discount. Common product checkout eligibility supplies approved tier version and holds. No AI pricing or invented surcharge/tax. |
| `grooming-discount-hold.service.js` | Compatibility adapter to common checkout eligibility; no copied financial rule. |
| `grooming-booking.service.js` | Transactional price/ownership recheck, pet guard, shared employee guards, customer cancellation (free until 2 hours before start) and embedded reservation/receipt. Owner-scoped reads hide staff identities, receipts, care evidence and payment internals. |
| `grooming-unpaid.service.js` | GBR-11 shared Customer payment hold: refuses new home or shop bookings when a handed-back grooming appointment still has an unpaid amount. Checks authoritative recorded money under the Customer scheduling guard. |
| `grooming-appointment-code.service.js` | Independent GR sequence; failed transactions may leave harmless gaps. |
| `grooming-storage.service.js` | Explicit additive provisioning of appointments and counters only; runtime does not create indexes. |
| `grooming-demo-seed.service.js` | Development-only synthetic shop fixtures, never production employment evidence. |

Only two new collections are justified: `groomingappointments` owns at most ten
embedded pets, each reserved employee and a single immutable idempotency receipt;
`groomingcounters` owns the independent appointment sequence. An hourly held count
would duplicate these reservations, and a separate one-to-one command would
duplicate the bounded receipt. Unique code and receipt-key indexes protect replay.
Existing employee/pet guards serialize competing home/shop work, window removal,
capability reduction and contract changes. Source collection names are preserved;
there is no live drop or destructive migration. See the
[storage and rollout contract](../../../../doc/api/grooming-reservations.md).

Without authoritative shop coordinates/travel evidence, an employee with a home
visit on the same local day is excluded from shop reservations. This is an explicit
travel-verification gate; the system does not assume zero travel or invent a point.

UC-58 ends at BOOKED. Shop check-in, service execution, staff cancellation/release
and payment require their respective use cases and must recheck reserved employee
eligibility. This change does not claim these future actions are operational.
Released pets and terminal appointments cease occupying time through the canonical
appointment states; no second counter must be repaired. The initial receipt remains
unchanged for an old command replay even if the appointment later evolves.
