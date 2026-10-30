# Booking proposals

Checkout captures owner care declarations and private entry notes separately
from offer summaries. Staff care-plan splitting preserves the snapshot and
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
