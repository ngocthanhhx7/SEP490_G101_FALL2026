# Booking proposals

`payment-expiry.service.js` implements JOB-03 for checkout's unpaid bookings.
Runtime checks every minute while checkout is enabled. Created links require a
signed payOS terminal unpaid result before expiry; unavailable, partial or
uncertain results remain for retry. An intent with no provider request can expire
only while the transaction confirms no request has started. A signed PAID result
with an exact full amount and usable bank reference records one verified receipt
and moves the booking to dispatch; incomplete paid evidence is deferred.
Expiry, visit release and one MSG67 in-app notification commit together and
recheck current state/version against concurrent webhooks. Booking reads show the
persisted state rather than deriving expiry solely from the local deadline.

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
