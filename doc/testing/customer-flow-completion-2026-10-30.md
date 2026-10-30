# Customer flow completion, 2026-10-30

## Findings and changes

Customer pet/address screens used legacy unmounted `/pets` and `/addresses`
contracts. Management now uses shared `/pet-care` records also consumed by
checkout/matching. Legacy page exports remain for compatibility.

Pet intake adds approximate age, sex, species-specific traits and explicit
KNOWN/UNKNOWN/NOT_PROVIDED notes for feeding, handling, health, allergies,
medication, vaccination and emergency/veterinary contacts. These are owner
declarations. Unknown information must not be treated as no medical risk.

Address intake includes authenticated search/place selection, Vietmap rendering
and pin selection, full address, supported work area, coordinates, private access
notes and explicit confirmation. Location/area/pin edits reset confirmation.
Selected points zoom to street level. No provider key is bundled.

Booking/notification runtime composition is connected. Customer dashboard reads
current visits/bookings; the unpaid metric counts active prepayment deadlines as
`awaitingPaymentBookings`, not unpaid bills. Sitter offers use
`employeevisitoffers`. Approved sitter profiles remain visible without moderated
reviews; ratings/counts are explicitly unknown.

## API and storage

Paths below are under authenticated `/api/v1`; Customer writes require CSRF.

| Contract | Behavior |
| --- | --- |
| GET `/pet-care/catalog`, `/pet-care/pets` | Shared catalog and owned active pets |
| GET `/pet-care/addresses` | Minimal shared address selection projection |
| GET `/pet-care/addresses/manage` | Owner-only location, pin and access notes |
| POST `/pet-care/pets`, `/pet-care/addresses` | Management retains `Idempotency-Key` |
| PATCH `/pet-care/pets/:id`, `/pet-care/addresses/:id` | Owner filtering, expectedVersion, command replay |
| POST `/pet-care/pets/:id/archives`, `/pet-care/addresses/:id/archives` | Versioned archive; history retained |
| GET `/bookings` | All states, signed owner-bound pagination, at most 50/page |
| GET `/notifications`, POST `/notifications/:id/read-receipts` | Durable recipient/role isolation and unread counts |

Pet/address management retains the existing 100-record list cap. Legacy physical
collection names are preserved. Minimal address reads exclude coordinates/access
notes. New commands require replica-set transactions and registered
`PetCareCommand`, `Notification` and `NotificationEvent` storage/indexes.
Provision through the existing explicit deployment `ensure-indexes` command after
runtime model registration; do not seed fixtures at startup. Disabled/missing
booking sources and missing notification list storage return unavailable.

Checkout writes one booking-created Customer notification in its transaction.
Other event producers, preferences and web-push integration remain pending.

## Verification

Checks used Node 24.22.1/npm 11.19.1 and isolated synthetic MongoDB replica sets.
No production database writes or real SMS/email were sent.

- PASS: backend architecture checker and both packages' lint.
- PASS: backend unit tests, 82 suites / 731 tests.
- PASS: backend integration tests, 34 suites / 269 tests.
- PASS: frontend tests, 90 suites / 555 tests.
- PASS: frontend production build; large-chunk warnings remain.
- PASS: focused Customer care runtime/checkout, 10 tests, including concurrent
  replay, rejected-command notification counts and missing inbox storage.
- PASS: focused Customer care/map UI, 7 tests.
- PASS: browser at widths 1440 and 390 for pet create/edit, address create and
  Customer routes; no observed JavaScript errors or horizontal overflow.
- PASS: real local Vietmap lookup for public Ho Hoan Kiem, Hanoi: HTTP 200,
  five suggestions, selected-place coordinates and rendered style/sprite/vector
  tiles. Pin confirmation stays unchecked until explicitly confirmed.

Full backend/frontend suites, lint, architecture and build were rerun on the final
source. Relative documentation links and `git diff --check` also pass.
Live map checks used local provider configuration and public landmark coordinates.
Synthetic browser session helpers are loopback-only and excluded from Git/releases.

## Remaining gates

- Independent final-commit review, Leader merge to develop, reviewed main
  release, backup/storage provisioning and EC2 acceptance are required. This
  feature has not been deployed.
- Owner care notes are not yet an authorized care snapshot for the assigned
  sitter. Medication administration and incident workflows need their own rules.
- Shortlist-to-invitation integration must recheck authoritative eligibility,
  expiry and occupancy. Pricing/finance remain separate deterministic services.
- Verified outcomes, satisfaction labels and point-in-time AI features remain
  subject to [AI real-data gates](ai-real-data-2026-10-30.md). Map rendering,
  OSRM routes and fixture metrics do not prove model quality.
- Private R2 recovery, live payments and settlement/payroll acceptance were not
  revalidated by this change; refer to their own release evidence.
