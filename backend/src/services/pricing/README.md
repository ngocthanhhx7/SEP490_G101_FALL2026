# Deterministic backend pricing

`pricing-calculation.service.js` calculates exact integer VND from approved versioned prices/policies using BigInt intermediate arithmetic. `pricing.service.js` owns quote snapshots and owner/kind/expiry reads; `pricing.repository.js` loads pricing records and shared owned-pet/service context. `pricing-management.service.js` validates Admin policy changes. No ranking model influences price.

Mounted independently of AI at `/api/v1/pricing/quotes` when authentication is enabled. A quote does not create a booking or collect money. Existing money operations must validate their authoritative policy/version again. Unknown taxes and unapproved surcharges cannot be guessed.

`care-trait-policy.service.js` implements the explicit owner-approved additive migration for capability traits and selected-duration play. A fresh dry-run source hash gates apply; unknown/charged/conflicting rules stay closed. See [booking pricing correction](../../../../doc/testing/booking-care-trait-pricing-2026-11-05.md).
