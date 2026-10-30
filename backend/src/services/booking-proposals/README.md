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

This folder contains booking-proposal domain exports for P42. The service
accepts repository ports for server-owned booking context, sitter availability,
proposal persistence and atomic offer dispatch. It does not create MongoDB
models or wire the application registry; P01 owns contracts and P34 owns
runtime registration.

`directed-booking-proposal.service.js` re-exports the P42 service while the
legacy P21 import remains available for existing dispatch consumers.
