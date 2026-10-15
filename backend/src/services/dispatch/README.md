# Dispatch read composition — P44

`candidate-batch.service.js` exports `createCandidateBatchReader`. It composes
internal, authorized `listProfiles` and `readAvailabilityBatch` ports for
`createSitterDispatchService` in [dispatch.service.js](../dispatch.service.js).
It is not a route or a MongoDB repository. P34 must supply production adapters.

- The candidate pool defaults to 100 independently of the requested top-N
  output. `candidateLimit` may reduce it to 1–100. Profiles require canonical
  `sitterId`, `approved`, `active`, `services`, `workAreas`; optional fields are
  `userState`, `distanceKm`, `rating`, `ratingCount`, `activeWorkload`.
- `listProfiles({ request, limit, signal })` must filter service/area and any
  requested sitter, apply deterministic order, projection, `lean()` and limit
  at the database. The reader also rejects oversized, invalid or duplicate rows.
  Scope comes from the caller's authorized server context, never a public DTO.
- `readAvailabilityBatch({ request, sitterIds, signal })` is called once for a
  nonempty pool. Return at most one `{ sitterId, available, isDayOff,
  hasConflict, slotMatch? }` per requested ID. The first three facts must be
  explicit booleans. Missing snapshots exclude that sitter; malformed,
  duplicate or foreign snapshots reject the read. No per-sitter DB loop.
- Availability adapters must cover the **whole** `[startAt, endAt)` interval,
  all local dates crossed in Vietnam, approved leave, active assignments and
  the existing travel-buffer policy. Overlap is `existing.start < end &&
  existing.end > start` after applying that policy; do not invent a buffer.
  The `localDate` is the Vietnam start date, not a promise of a same-day visit.
- Read failures become safe dispatch errors. The facade caps candidate read
  waiting at 1000 ms and ranking at 500 ms by default (configurable 1–10000 ms).
  Ports receive `signal`; adapters must propagate it and set DB/provider
  execution limits. A timed-out ranker falls back to deterministic eligible
  ordering; a timed-out candidate read fails closed. A provider ignoring abort
  can keep running in the background; the facade cannot forcibly terminate it.
- There is no eligibility cache or cached fallback. Every suggestion reads
  profiles and availability again. Future caching needs a bounded TTL plus
  invalidation after schedule, day-off, assignment, cancellation, area and
  account eligibility changes, including in-flight read/write races.
- Suggestions do not reserve a slot. Existing atomic offer/accept operations
  must re-read authorization, payment, eligibility and overlap under their
  transaction/occupancy guards. This reader does not replace those guards.

Mongo indexes, booking pagination and dashboard/payroll aggregation remain
integration gates; see [P44 evidence](../../../../doc/testing/p44-performance.md).
