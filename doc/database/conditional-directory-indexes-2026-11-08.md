# Area and Admin directory index decisions

No production index or query changed in this benchmark increment. Native page
queries were taken from employee-dispatch.service and user-admin.service at
reviewed source de399a5/4151745 (those readers unchanged). Disposable MongoDB8.0.34
replica set, cache0.25GB; separate baseline/candidate collections, exact same
synthetic IDs/content, unhinted planner,3 warmups/20 alternating paired samples
per arm with equality assertions. Native explain is separate from timing.

## Area: conditional, retain existing runtime

48 comparisons cover1k/10k rows, balanced/tail-clustered areas,1%/10%/80%
selectivity, single/multiple area keys, directed _id and no-match queries. Actual
shape remains `areas:{$in:keys}`, optional directed _id, sort_id ascending, limit101.
Candidate adds only `{areas:1,_id:1}` in the isolated candidate collection.

At10k/1% balanced, page docs10,000→100 and p50/p95 17.34/19.18→1.31/1.62 ms.
No-match10k scans10,000→0; common multi-area can add keys/latency: balanced80%
returns101 but candidate examines183 keys versus101. Directed _id generally stays
one document. Full source eligibility, contract, occupancy, travel and transactional
rechecks were not benchmarked and no eligibility/100-candidate cap is changed.

Four alternating update trials (10 samples per arm,100 row area updates) measure
maintenance:10k balanced p50 11.86→13.03 ms, tail11.14→12.41 ms. Checkpointed
candidate total index allocation adds303,104 bytes at10k; allocation/fragmentation
is not a stable per-document storage coefficient or production capacity. Native
bulk updates do not prove full transaction throughput.

Keep live indexes at the currently small population. Revisit this candidate when
availability approaches1k rows and measured selective/no-match scans approach1k
per dispatch or repeated scan time materially affects dispatch latency. Before
building, measure current area mix/frequency, insert/full-command transaction cost
and resource budget, repeat candidate against current source, independently review
and take backup/restore/rollback evidence. The trigger is for measurement, not an
automatic index build; no new business cap or SLO is invented.

## Admin: KEEP, reject broad createdAt/_id candidate

48 comparisons cover1k/10k rows, balanced/tail rare state/role, default/state/role/
combined/search/no-match, first/deep keyset pages with createdAt ties. Non-synthetic
filter, case-insensitive substring, projection, descending createdAt/_id and limit21
match source. Fixtures assert positive results for every positive case; contacts,
masked DTO adaptation and full HTTP/session behavior were not timed.

The plain `{createdAt:-1,_id:-1}` candidate helps10k tail default deep:
p50/p95 9.17/10.11→0.87/1.04 ms, page docs10,000→24, removes SORT.
But tail rare state first regresses6.54/7.18→14.29/14.91 ms (9,923 docs);
rare role/combined first similarly regress. No-match tail regresses9.44/9.93→
17.86/18.79 ms and still examines10k docs/keys. This is sufficient to reject a
broad rollout despite default-page gains; it is not a production incident.

Four10-sample update trials changed100 states per arm:10k balanced p50
11.73→12.03 ms, tail10.94→11.15 ms. Candidate index allocation adds126,976 bytes
at10k. Since the index does not contain state, timing noise is not proof of causal
state-maintenance overhead. Inserts, concurrent service load and contact fetch
are not established. Revisit only with a workload-specific candidate/mix and
acceptable insert/storage cost; do not add the plain index by default.

## Provenance and limits

Final private artifacts: area-directory-benchmark.mjs/json/log,96 query comparisons
and8 write trials, all synthetic, productionAccess=false. An exploratory fixture
accidentally made balanced rare-role rows synthetic and updated createdAt rather
than current mutable state; retained separately and excluded from these results.
Final fixture corrects both and asserts positive matches. No profiler/usage,
provider acceptance, production latency or full-service throughput claim is made.
See the [unified backlog](optimization-backlog-2026-11-08.md).
