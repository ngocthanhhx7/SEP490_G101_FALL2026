# P44 — Query and dispatch performance evidence

Work item WBS-N13 / EXT-PERF. Evidence date: 15/10/2026, Vietnam time
(Asia/Ho_Chi_Minh, UTC+07:00). Base: develop
`38627be03e2c9e77e3a4766ff1a919885cd522ef`.
Status: **INTEGRATION_PENDING**; independent service changes tested. This is
not acceptance of the full P44 performance requirement.

## Findings and changes

The existing [dispatch facade](../../backend/src/services/dispatch.service.js)
bounded the output but trusted the candidate input size. It recomputed sort
keys on every comparison, validated provider IDs with repeated linear scans,
and waited indefinitely for a ranker or candidate port that never settled.
The [auto-assignment sweep](../../backend/src/jobs/auto-assignment.job.js)
also trusted its repository to respect the requested queue limit.

P44 enforces the 100-candidate input cap (including direct fixture inputs),
computes each eligible sort key once, uses a Set for provider membership
validation and rejects queue responses exceeding the configured 1–100 limit.
Existing deterministic ordering and deduplication remain covered by P21 tests.
Ranking timeouts return the existing deterministic eligible ordering; candidate
read timeouts return a safe 503. Defaults are 500 ms / 1000 ms respectively;
they are service budgets, not a declaration that a booking meets its SLO.

The new [batch reader contract](../../backend/src/services/dispatch/README.md)
loads a bounded profile pool followed by one batch of availability facts. Unit
tests at 1, 10 and 100 candidates observe exactly one profile-port call and one
availability-port call. Empty pools skip availability. These are **port call
counts**, not MongoDB query counts. No claim is made about current production
N+1 behavior: no production availability repository is composed here yet.

The reader whitelists profile/fact fields, excludes missing facts and rejects
duplicate, foreign, oversized or malformed batches. It reads fresh facts on
every call. Tests change schedule, leave, assignment conflict, cancellation
and area snapshots between calls; no stale result is reused. No cache is
introduced. Caller authorization and atomic offer/accept revalidation remain
required. Money calculations, persistence schemas and offer mutations are
outside this diff.

## Reproducible service diagnostic

From `backend/` run:

```powershell
node scripts/performance/dispatch-benchmark.js <baseline-checkout>/backend
node scripts/performance/dispatch-benchmark.js
```

The [same harness](../../backend/scripts/performance/dispatch-benchmark.js)
was run against the original P21 source blob
`a9a223013cf06e28acbaa51c654d3daa7b26b373` (verified to match this base) and
the P44 implementation. Node 24.21.0 / npm 11.19.0 on the local Windows host;
200 warmup suggestions, then 2000 measured suggestions per checkout,
100 synthetic eligible candidates, concurrency 1, immediate fake repository
and ranker. Durations include candidate evaluation, deterministic sorting,
provider permutation validation and the new deadline machinery.

| Diagnostic | Before | After |
| --- | ---: | ---: |
| Service p50 (ms) | 0.4649 | 0.2536 |
| Service p95 (ms) | 0.8119 | 0.5428 |
| Service p99 (ms) | 0.9992 | 0.7194 |
| Repository-port calls / 2000 samples | 2000 | 2000 |
| Ranker-port calls / 2000 samples | 2000 | 2000 |

This single local run has host/JIT/scheduling noise; it is not a capacity
claim, a 200-user test, an API benchmark or a page/booking metric. Mongo query
count and page/booking p95 are intentionally `null` in the harness output.
The provider-hang and late-result cases are deterministic fake-timer tests,
not observations of a real ranking provider.

## Checks actually run

| Command from backend | Result |
| --- | --- |
| `npm ci --ignore-scripts` | PASS, 469 packages, audit reports 0 vulnerabilities |
| `npm run lint` | PASS |
| `npm test` | PASS, 56 suites / 542 tests across unit + integration projects |
| Focused P44 + P21/P22/P24 tests | PASS, 6 suites / 95 tests on the final test revision |
| `node scripts/performance/dispatch-benchmark.js` | Completed; synthetic numbers above |

Integration tests use isolated real MongoDB 8.0.34 replica sets for existing
runtime/auth/catalog/application modules. They do not prove Mongo-backed
dispatch, booking, dashboard or payroll integration. Jest reports its expected
experimental VM modules warning. Backend has no build script; UI/Figma is not
in scope. Content review found parameterized array cases being spread into
test arguments; the fixture rows were corrected and a duplicate-fact case
within the allowed batch size was added. The complete 56-suite / 542-test run
then passed (32.289 s).

## Open acceptance gates and next measurements

At the base above, booking-read is absent from tracked backend services;
dispatch depends on injected repositories and is not composed with MongoDB in
[app.js](../../backend/src/app.js) or
[runtime.js](../../backend/src/runtime.js). P28
[PR #65](https://github.com/ngocthanhhx7/SEP490_G101_FALL2026/pull/65)
and P41 [PR #63](https://github.com/ngocthanhhx7/SEP490_G101_FALL2026/pull/63)
/ [PR #64](https://github.com/ngocthanhhx7/SEP490_G101_FALL2026/pull/64)
were OPEN/DRAFT when checked on this date. Do not merge their code indirectly
or invent their schema/DTO decisions in P44.

| Gate | Current evidence / owner for next step |
| --- | --- |
| P20 booking lists/details | No integrated booking-read query to measure at this base; P20/P34 must supply scoped persistence and route composition |
| P21 profile/calendar/day-off/assignment reads | Batch contract is tested with synthetic ports; P01/P18/P21/P34 must supply schema-backed projections and overlap/travel policy implementation |
| P28 dashboard and payroll reads | Draft #65; P28/P34 must provide bounded, authorized date-range aggregates and drilldown pagination |
| P41 ledger/payroll correctness | Drafts #63/#64; P41/P51 decisions and real ledger/settlement adapter must precede query optimization |
| Query plans and indexes | NOT MEASURED; no P44 index or migration is added without the integrated predicates/sorts/geo queries |
| Page and booking load | NOT RUN; no integrated journeys or approved staging capacity target available for these flows |

After integration, retain the same synthetic dataset and environment for
before/after comparison. Record collection counts and distributions (areas,
statuses, owner cardinality, historical visits, workload and leave), exact
query filter/sort/projection/limit and `explain('executionStats')` without
private values. Capture winning plan, `nReturned`, `totalKeysExamined`,
`totalDocsExamined`, execution time, blocking sorts and COLLSCAN stages; compare
the first and later cursor pages, empty results and crowded overlap windows.
Count actual driver `find`, `aggregate` and `getMore` commands per request;
exclude background health/auth queries only with an explicit recorded rule.
Verify bounded limits/projection/lean at the adapter before materialization.
Choose a minimal index only after measuring that exact query; record its write
cost and rollback before sending schema/migration changes to P01/P34.

Run actual Customer booking list/detail, Sitter availability/offer, Staff board,
Admin dashboard and payroll journeys with server-authorized synthetic users.
Exercise up to 200 concurrent active users on the intended single server and
record scenario mix, warmup/duration/sample count, error rate and query count.
Measure browser navigation to usable page (including auth/data/render) and
booking submit to persisted saved/confirmed UI state separately. The SRS
table71 rows 2/3/8 targets are 95% of pages within 2 s and 95% of bookings
saved/confirmed within 3 s at the specified concurrency. API p95 is diagnostic
only. Never count a pending offer as a confirmed booking.

Repeat with empty/error/forbidden data, cross-customer and out-of-area access,
duplicate requests, overlapping concurrent accepts, offer deadlines and
schedule/leave/area/cancellation changes during reads. Compare monetary VND
snapshots and transaction/occupancy guards before and after. Cache remains
disabled; any future cache must test TTL, invalidation and stale in-flight
population across all those mutations before enabling it.

## Session handoff

- WBS-N13 / EXT-PERF; code owner and author/committer: Đặng Văn Hải;
  push/PR account `Haidvhe181849` (login, repository write and email VERIFIED).
- Assigned reviewer: Nguyễn Hữu Anh Nhật / `anhnhat432` (session VERIFIED);
  assigned final merger: Nguyễn Ngọc Thành / `ngocthanhhx7`.
  No approval or merge is asserted here; consult the linked PR for live state.
- Branch `feature/wbs-n13-query-performance-optimization`; isolated checkout
  `D:/WW/SEP490_G101_FALL2026-p44`. Original working directory is preserved.
- Changed areas: P21 dispatch facade, auto-assignment queue guard, new internal
  batch reader/README, synthetic diagnostic harness, related unit tests and
  this evidence document. No shared route/manifest/schema files changed.
- Status: INTEGRATION_PENDING. Prepare a draft PR into develop; acceptance,
  ready-for-review approval and final merge require the gates above. Missing
  providers/Figma do not block these independent service checks; the missing
  production query adapters and end-to-end measurements do block full P44.
