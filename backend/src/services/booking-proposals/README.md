# Booking proposals

`checkout-availability.service.js` loads an owned current quote and checks
published employees against the shared authoritative contract, capability,
work-area, shift, leave, occupancy and travel rules. Its bounded search is an
availability preview, not a reservation. Directed checkout repeats the guard
within the booking transaction. Checkout automatically creates boarding care shifts
of at most eight hours using the existing exact allocation policy.
System MATCH candidate order is retained as advice for invitation dispatch,
which still rechecks payment, eligibility and acceptance.

Checkout captures owner care declarations and private entry notes separately
from offer summaries. System care-plan splitting preserves the snapshot and
advisory recommendation reference. `match-selection.service.js` binds optional
MATCH references to the owner, returned candidate, exact service/pets/address,
versions and schedule before expiry. It neither calculates prices nor assigns
employees; invitation and acceptance retain authoritative eligibility gates.
Owner booking reads include care-shift state and check-in/out timestamps from the
operational visits. They do not expose evidence image IDs or private care notes.

This folder contains booking-proposal domain exports for P42. The service
accepts repository ports for server-owned booking context, sitter availability,
proposal persistence and atomic offer dispatch. It does not create MongoDB
models or wire the application registry; P01 owns contracts and P34 owns
runtime registration.

`directed-booking-proposal.service.js` re-exports the P42 service while the
legacy P21 import remains available for existing dispatch consumers.

Directed availability accepts optional `directory: true, page` to read every active, publicly approved sitter registered for the quoted service in pages of 20, ordered by published Customer rating descending then stable userId. Unknown ratings sort last. Each row carries authoritative preview eligibility/reason; unsuitable schedules remain visible but cannot be selected. No AI threshold filters this directory. Quote ownership, current pet/address checks and transactional checkout guard remain mandatory.

`booking-details.service.js` builds the read-only booking terms, visit progress and saved price projection for Customer and Staff/Admin. The checkout read keeps its existing owner check. The Staff/Admin read includes only the customer display name.

Booking details resolve saved area codes through a bounded `_id` lookup in the existing service-area registry, including closed historical areas; legacy demo labels remain a fallback. The read never changes checkout snapshots, coverage policy or financial state.

`booking-cancellation.service.js` handles customer preview and transactional cancellation of a whole booking or a single unstarted visit (`startAt > now`) under GBR-15, GBR-17 and GBR-19: late fees (30% of pre-discount visit price when `< 24h` and accepted by a pet sitter), multi-visit combo discount recalculation on remaining visits using the snapshotted `pricingPolicyVersion`, offer revocation, pending booking-change reconciliation, `finalizeExceptionalBooking`, `refunds` (`RECORDED`, `BOOKING_CANCELLATION`) with GBR-30 cap enforcement, in-app sitter notifications, and Admin read listing for booking cancellation refunds.

GBR-09 checkout uses `booking-span-policy.js` to require at most 30 inclusive
Vietnam calendar days across the first and last occupied service day. The
checkout service enforces this after constructing each visit with its actual
service duration; rescheduling uses the corresponding full schedule policy.
The booking quote and checkout apply the approved, versioned customer-tier
discount and retain an immutable snapshot with integer-VND allocation.

GBR-17 requires PREPAY for every newly created checkout booking, including
one-visit bookings. Every order creates a payOS intent with the original
15-minute deadline and stays out of dispatch until verified payment.
`booking-payment-expiry.service.js` is JOB-03: it examines a bounded batch.
An expired order can be finalized when *each* payOS intent is independently
safe: a pending intent without any submission marker was never sent; a
replaced `CANCELLED` intent with recorded terminal payOS evidence is already
reconciled; all other attempted or legacy intents require a fresh authenticated
payOS terminal-unpaid result. This covers a cancelled old link followed by a
new pending intent that the Customer never opened. The service checks intent
state, version, provider reference, money and submission markers again inside
the guarded transaction, rejects verified or reconciliation-required payments,
then expires the booking and releases visits. Missing or ambiguous evidence
defers expiry rather than inferring payment failure from a payOS 404.
