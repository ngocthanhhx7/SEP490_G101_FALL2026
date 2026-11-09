# Conditional default product ordering

## Current and target contract

Public/Admin product lists currently sort by code/_id, page by offset and count
the exact filter. Admin separately aggregates a global nondeleted-product summary.
Code has an existing globally unique simple-collation index. The target removes
the redundant _id sort suffix only when search/category/pet filters are absent.
Filtered queries retain their original sort and planner shape because broad
code-only experiments regressed under selective/skewed predicates.

Ownership, visibility/deletedAt, substring search, DTO fields/photos, stock/held,
exact filtered count, global summary and frontend first/previous/next/last-page
behavior remain compatible. There is no projection, hint, new index, schema,
money, policy or writer change. Current and target persistence layouts are the
same. No migration/DDL runs; rollback selects previous reviewed source and never
restores old data over newer writes.

## Measured candidate

The earlier independent168-query/24-service matrix rejected a broad rollout.
Fresh isolated MongoDB8.0.34 replica-set work compares actual current public/Admin
service factories against a source candidate changing only the conditional sort.
Three warmups,20 paired samples per arm, alternating order;72 comparisons assert
full DTO/page/total/global-summary equality on every sample. Fixtures cover missing,
null and dated deletedAt, hidden products, held>stock, long descriptions and URL
photos;1k/9k valid code capacity plus100k future stress, balanced/tail-selective
distributions and first/deep pages.100k uses six-digit synthetic codes and is not
evidence that current create API exceeds SP-9999.

| Fixture / default service | Baseline p50/p95 ms | Candidate p50/p95 ms | Page docs before/after |
| --- | --- | --- | --- |
| 9k balanced public first | 19.10 /20.13 | 12.75 /13.25 | 8,550 /22 |
| 9k balanced public deep | 26.87 /34.66 | 14.06 /14.95 | 8,550 /7,188 |
| 9k balanced Admin first | 21.78 /24.23 | 18.00 /20.51 | 9,000 /21 |
| 9k tail Admin deep | 27.81 /28.59 | 25.36 /26.65 | 9,000 /7,192 |
| 100k tail public deep (stress) | 310.61 /377.96 | 169.01 /187.22 | 95,000 /79,992 |

Default page explains at95% visibility remove the blocking SORT. A16-case
supplement at1k/9k compares80% visibility and a tail cluster with only5% visible.
In the selective public case the planner keeps the existing visible index and
blocking SORT (450 documents at9k); first-page p50 was2.03 versus2.24 ms, while
deep-page p50 was2.62 versus2.47 ms. This is not a universal latency win and no hint
forces the code index under that skew. All16 supplemental full DTO comparisons
passed. Count/global-summary work remains;
deep offsets still scan growing keys/documents. These service timings include
count and Admin summary, and are synthetic sequential latency, not production
capacity/SLO. Unchanged filtered shapes show timing noise (maximum paired p50
ratio1.076) and identical query/DTO semantics. Explain is separate from warmed
timing; no per-sample cache claim is made for those paired timings. No production
plan cache is cleared. No index or write operation changes, so no new index
maintenance cost is claimed or introduced.

A separate96-sample isolated native profiler check reused the same collection
through80%,95% and tail5% visibility. Public first-page candidate reads25,22 and450
documents respectively; baseline reads7,200,8,550 and450. Cached candidate samples
retain those measured plans; the tail5% candidate keeps SORT. Two replans occurred
in the full first/deep matrix. This checks representative page-query cache/skew
behavior, not every earlier timing sample or complete HTTP request. No production
profiler or cache setting was changed.

## Verification and rollout

Native regression must compare the old ordering/count/summary with all pages,
capture emitted default versus filtered sorts, check hidden/deleted/private DTO
behavior and existing stock/auth/error regressions. Run architecture, lint,
affected suites and frontend build, independently review final SHA/CI, and merge
through develop/main. Before activation take a fresh backup/isolated restore and
verify resource budget, exact artifact checksum, deployment lock and rollback.
After activation compare retained BSON/index/validator metadata, hashes, readiness
and public/auth API behavior plus native live old/new DTO parity with zero writes.

Cursor API/UI remains conditional on measured deep-page workload and a complete
compatible navigation/count/summary contract; this change does not claim offset,
exact count or global summary have bounded scan cost. See the
[unified backlog](optimization-backlog-2026-11-08.md).

## Deployed acceptance

PR258 and release259 passed required checks, assigned independent reviews and
Leader merges. Main b64c147 application CI passed. Reviewed artifact1,850 files
and430 runtime source files matched hashes; GREEN3001 readiness/public API200,
guest financial/history401, restart0/OOMfalse. Existing30 products were compared
through16 native public/Admin query shapes and102 pages at limit3: full DTO,
filtered totals/global summaries match the previous ordering, zero writes.

Fresh backup pwc-20261108T122452Z, SHA256
dd820fe0bc6eee0abb3e04eb73c07571e821a585a79eac8df3575f70ae62be96,
restored82 collections before activation. Retained82/585/203 raw BSON and index/
validator metadata digests stayed unchanged; environment/providers unchanged.
Source rollback targets reviewed97db1dc without restoring old database writes.
Origin frontend hashes match the reviewed build. Local HTTP probes of public
HTML and JS returned Cloudflare403 during this rollout, so no fresh public-edge
byte equality is claimed; no Cloudflare setting was changed to bypass that limit.
