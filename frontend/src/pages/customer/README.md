# Customer pages

Customer-owned profile, service-address, pet and booking presentation belongs here.
Shared transport belongs in `../../services`; backend enforces ownership.

`CustomerDashboardPage` owns the Customer care overview, separate from operational
dashboards: authoritative counters, visit list, date filters and server cursors.
`CustomerProfilePage` presents the existing versioned profile form and masked
contacts with links to OTP-protected contact settings. Account navigation/layout
belongs in layouts and routes; see the Customer account UI plan under doc/ui-ux.

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
`DirectedBookingProposalPage` is mounted at `/account/schedule-proposals/:proposalId`.
It reads an owner-scoped proposal, shows the assigned sitter name when available,
and retains the same slot/key after an uncertain confirmation. Changing the proposal
route clears prior command state. Confirmation creates an invitation, not an assignment.
Booking confirmation shows authoritative care-shift state and check-in/out timestamps.
New checkout care snapshots are accessible
through the assigned employee care endpoints; legacy visits fail unavailable.
See [checks and remaining gates](../../../../doc/testing/care-matching-outcomes-2026-10-30.md).

`ShoppingCartPage`, `ProductCheckoutPage` and `MyProductOrdersPage` complete the product purchase flow at `/customer/cart`, `/customer/product-checkout` and `/customer/product-orders`. Checkout supports delivery (paid on delivery) and pickup (paid at the shop) only; the delivery fee preview comes from the cart response and the placed order shows the backend's amounts. The checkout keeps one idempotency key per unchanged order, so an uncertain retry cannot create a second order. Online payment, tier discounts and defect reports are not part of this release.

Product-order history is reachable from the Customer account sidebar (Mua sắm) and avatar menu. It uses the account workspace at the existing `/customer/product-orders` URL; list/detail reads remain owner-scoped.

Service order history uses recognizable service/pet names, scheduled date/count, server-owned amount and explanatory status. A white detail link beside the status opens `/account/bookings/:bookingId` within the Customer workspace; the detail reuses the saved checkout view, payment/reconciliation, travel and rating behavior. IDs stay secondary lookup references. Missing legacy fields are shown as unknown instead of invented values.

`CustomerCarePage` keeps the route facade and delegates pets to `CustomerPetsPage`; the address workspace stays separate. `CustomerPetForm` groups editable self-reported care notes inside the existing native dialog. Pure draft/status formatting lives in `utils/customer-pet-profile.js`; transport and ownership remain unchanged. See [profile/photo experience](../../../../doc/ui-ux/profile-and-pet-experience-2026-11-09.md).

Pet editing uses four explicit groups with retained draft values; invalid fields reveal their group. The dialog keeps header/actions outside the scrollable form body.

PetRecordImport presents untrusted Gemini suggestions with excerpts, editable fields, per-field opt-in and explicit confirmation; applying only modifies the draft, existing pet save handles ownership/version checks.

`PetProfileDetails` presents the owned pet photo/identity, daily care, health and support notes using existing careProfile statuses. Contextual edit buttons select the matching form group; the AI entry opens the existing consent/review/draft workflow. Photo controls use the existing AvatarEditor in a separate dialog. No health verification, derived vaccine validity, additional persistence or public sharing is inferred from this presentation.

`CustomerBookingDetailPage.jsx` uses the shared read-only booking detail while retaining the existing checkout confirmation actions and owner-scoped transport.
