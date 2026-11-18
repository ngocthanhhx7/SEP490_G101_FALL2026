# Booking change storage

UC-84/85 adds one collection, `bookingchangerequests`, to the existing booking,
scheduling and notification storage. This is additive and requires no backfill.

## Ownership and alternatives

| Data | Storage and reason |
| --- | --- |
| Customer request, original/proposed times, decision and deadline | New `bookingchangerequests`. Staff independently pages pending requests by deadline across bookings. A booking can receive arbitrarily many rejected/expired requests, so embedding all history in a booking would grow without a product bound. Staff-created `employeescheduleproposals` has a different owner, state machine and customer confirmation contract; reusing that collection would mix incompatible workflows. |
| One pending request per operational visit | Bounded `pendingVisitIds` inside the request, unique multikey index with `partialFilterExpression: { state: 'PENDING' }`. No separate claim collection. The booking write guard serializes submissions; the unique index also enforces the cross-request invariant. Cancelled visits are removed atomically, terminal requests clear the array. Historical `items` stay intact. |
| Retry receipt | Existing `employeeschedulecommands`, same shape and retention as other scheduling commands. Hash input includes actor, `BOOKING_CHANGE_SUBMIT` or `BOOKING_CHANGE_DECIDE`, and key, separating these operations from availability/invitation commands. No additional command collection or TTL. |
| In-app notice | Existing `notifications`, persisted in the same transaction as approval/rejection/expiry. Its deterministic recipient/event ID prevents duplicates on transaction retry and command replay. A failed notification write rolls back the decision. There is no external delivery call requiring a separate outbox. |

Requests contain at most 60 operational visits, enforced by the reader before
submission; the API returns only the existing public request fields. Internal
claims and command keys are never exposed. No pricing, payment or historical
financial snapshot is recalculated by this storage change.

## Access patterns and cost

The new collection has its `_id` index and four secondary indexes: pending
deadline pagination, pending recheck, booking-scoped pending pagination and the
partial unique visit claim. Existing collection names, unique indexes, TTLs and
validators remain unchanged. No index is removed from production.

Compared with the first four-collection proposal, this removes three collection
definitions and their four indexes (three `_id`, one claim lookup), plus the
separate notice delivery index. Submission removes a claim lookup and insert;
notification delivery no longer needs an outbox insert, scan and delivered update.
The added request field has at most 60 visit IDs and its partial index excludes
terminal history. These are structural costs, not a production latency or
throughput claim. Verify actual query plans and BSON/index sizes on a restored
copy; small fixture timings cannot establish production capacity.

## Staged rollout and rollback

1. Review final code and run architecture, lint, booking/scheduling/notification
   regressions, complete application CI and frontend build. Test concurrent
   submissions, cancellation, expiry, command replay and notification rollback.
2. Build the reviewed `main` SHA. Take a fresh backup and verify isolated restore
   before provisioning. On that clone, call `provisionBookingChanges(connection)`
   from the exact candidate source; verify only `bookingchangerequests` is added,
   inspect its indexes and exercise real HTTP with synthetic owned records.
3. Provision the same single collection and declared indexes on production using
   the reviewed release and existing secret configuration. No business record,
   migration, cleanup, environment change or collection drop is part of this step.
   Repeated provisioning must be safe. Keep the previous release serving if it fails.
4. Activate the candidate with the existing blue/green procedure. Verify readiness,
   runtime source hashes, unauthenticated guards, authenticated reads and unchanged
   environment. Never create fake production bookings to claim acceptance.
5. For application rollback, restore the previous release/proxy. Keep the additive
   request collection and shared command/notification records; do not restore an
   old whole database over concurrent customer activity. Retain the backup and
   previous release. Data deletion or new retention rules require separate review.

The rejected four-collection proposal was not deployed. Do not drop a collection
merely because its old proposed name appears in a report; inspect actual state.
