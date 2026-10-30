# Customer pages

Customer-owned profile, service-address, pet and booking presentation belongs here.
Shared transport belongs in `../../services`; backend enforces ownership.

## Current runtime

- `CustomerCarePage` serves `/account/pets`, `/account/pets/:petId` and
  `/account/addresses` using `customer-care-api.js` and shared `/pet-care` data
  consumed by checkout/matching. Create/edit/archive commands retain operation
  keys after uncertain responses and edits/archives check expected versions.
- Pet intake includes breed, species-specific traits, weight, approximate age,
  sex and known/unknown/not-provided care notes. These are owner declarations,
  not verified medical records. Confirmation resets during edits.
- Address intake uses `AddressSearch` and `VietmapView`, work areas, full address,
  coordinates, explicit pin confirmation and private access notes. Changing
  location/area/pin resets confirmation. Owner management uses
  `/pet-care/addresses/manage`; the matching list stays minimal.
- `CustomerBookingsPage` reads owner-scoped `/bookings` across all states with
  cursor pagination; details open the existing checkout confirmation.
  `/account/notifications` uses durable notifications and read receipts.
- `CustomerProfilePage` uses `/me/profile` and session/CSRF. The separate
  `CustomerUnpaidBookingsPage` displays unpaid projections/payment intents;
  browser return URLs cannot establish payment success.

Legacy pet/address pages and adapters remain for import compatibility. Their
old `/pets` and `/addresses` contracts are not the current management source.

## Remaining boundaries

`RecommendationCheckout.jsx` bridges supported home-care shortlist selections to
the ordinary quote/checkout API with a MATCH reference. Specialized clinic,
distance and boarding plans retain Staff review. `VerifiedVisitRating.jsx` uses
the verified completed-visit command and preserves uncertain retry payloads.

`SitterRecommendationsPage` displays an advisory shortlist from shared owned
pets/confirmed addresses; it never sets prices or sends offers.
`DirectedBookingProposalPage` remains unregistered pending its final live
proposal/payment/offer integration. New checkout care snapshots are accessible
through the assigned employee care endpoints; legacy visits fail unavailable.
See [checks and remaining gates](../../../../doc/testing/care-matching-outcomes-2026-10-30.md).
