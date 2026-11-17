# Grooming reservations and storage rollout

PR365 implements UC-58 through BOOKED and owner-scoped list/detail. It preserves
the separate home-care checkout and employee self-registration policy.

## Authoritative availability

Existing availability/revision windows accept optional `workLocation: SHOP` or
`HOME`. Omitted/HOME canonicalizes to the legacy shape. Overlap validation applies
across both locations; SHOP cannot also provide HOME capacity. The employee selects
location when registering their schedule after the verified signed contract.
The existing HOME matching adapter excludes SHOP intervals.

Shop reservations require an active approved employee, verified current FULL_TIME
contract covering the whole interval, explicit SHOP coverage and current service,
species, weight, pet-count and trait capabilities. Leave, confirmed/live schedule
blocks and existing home/shop work remain authoritative. Ordinary hours are bounded
to eight per day and the current contract's weekly minutes; availability is not
attendance and cannot reduce base salary.

Each pet has a specific reserved employee throughout its actual planned duration.
Distinct matching supports different employees with different services, and rejects
plans where hourly headcounts exist but no employee covers a pet's entire interval.
The reservation is capacity evidence, not a claim that the employee checked in or
performed work. Later shop execution must recheck eligibility and capture actual facts.

The roster limits candidates to 200, histories to 2,000 and relevant appointments to
200; overflow returns a review-required error rather than silently dropping employees
or reservations. Reads have five-second query deadlines. Legacy generic availability
does not seed a shop roster. Without authoritative shop coordinates/travel evidence,
same-day home work excludes shop reservation; no zero travel is assumed.

## Transactions and snapshot prices

Booking rechecks prices, service policies, owned active pets, customer tier and
discount eligibility inside the Mongo transaction. Quote mismatch returns
`409 GROOMING_PRICE_CHANGED`; source versions and the approved tier policy version
are snapshotted. The shared product checkout eligibility owns discount holds.
Amounts use integer VND and approved calculation rules; AI is not involved.

The current customer, each selected pet's existing `bookingGuard`, and selected
employee guards serialize competing writes. Employee guards are acquired in sorted
order and reused by home assignment, schedule, capability and contract changes.
The transaction recomputes matching after acquiring them and retries write conflicts.
Concurrent bookings cannot reserve the last employee twice or book the same pet
through two different employee guards. Removing a reserved SHOP window or reducing
capabilities/contract coverage fails pending operational review. No scheduling worker
creates signed contracts, a physical roster, attendance or service credits.

## Why two collections

- `groomingappointments`: bounded aggregate, at most ten pets, reserved employees,
  service/pet/price snapshots and one bounded immutable request receipt. Its unique
  code and receipt-key indexes enforce reference uniqueness and idempotent replay.
  Staff identities/receipt internals are excluded from the customer projection.
- `groomingcounters`: independent GR sequence. Failed reservations may leave a gap;
  codes do not reuse or couple to product order sequences.

An hourly held-count collection duplicates canonical pet reservations and can drift
from employee eligibility or release states. A one-to-one command collection duplicates
the bounded receipt. Neither is provisioned. Physical legacy names are not renamed or
dropped: the inspected deployment has no Grooming stores. If another environment
already contains old Grooming appointments/slots/commands, stop for a reviewed migration
and capacity/receipt reconciliation; do not delete or reinterpret them silently.

The occupancy index is `pets.reservedSitterId/status/slot.endAt`; existing owner/time,
pet/time and local-day/state indexes remain. Relevant reads project only required
reservation facts. Review query plans and write/index footprint on a restored database
before enabling, instead of judging optimization by collection count alone.

## Release and acceptance

1. Reinspect current flags, collections, indexes and schema; take a fresh backup
   and restore to an isolated Mongo replica set. Never seed production employee fixtures.
2. Provision the two stores only in the enabled acceptance environment; verify unique
   receipt/code indexes, actual concurrent reservations/replay, matching, ownership,
   quote changes and legacy HOME scheduling behavior. Compare query plans on that clone.
3. Publish only reviewed main. With the flag disabled, preserve production `.env`
   and expose `groomingBookingEnabled: false` in the public catalog, hiding shop CTAs.
   Disabled Grooming must not register or create its collections through HOME scheduling.
4. Enabling requires configured real shop address, factual eligible SHOP registrations,
   provisioned storage and live acceptance. A successful build or synthetic roster is
   not proof of an operational shop. Keep check-in/work/payment use cases gated separately.
5. Roll back code/flag using the previous reviewed release; preserve reservation,
   receipt and audit data. Do not drop collections, mutate existing contracts or change
   prices to manufacture acceptance.
