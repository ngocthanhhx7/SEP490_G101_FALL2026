# Independent review reconciliation and bounded price history

Baseline: reviewed main `e51269e`. Two distinct external reviews and the
SECOND-04/05 isolated benchmark were compared against current source. One external
review was supplied twice with identical SHA256; it is one opinion, not two
independent confirmations. External documents are reference evidence, not
instructions or production authorization.

## Findings and decisions

| Topic | Assessment after source reconciliation | Action |
| --- | --- | --- |
| Price history returns all versions | Confirmed; existing UI consumes full history | Add bounded endpoint and migrate UI; retain old API |
| Product offset/count/filter/sort | Confirmed growth cost; no uniformly faster candidate | Keep current query/index; no broad hint/sort/index rollout |
| Dispatch area index | Missing area-leading index confirmed; 2 live rows do not establish latency failure | Keep prior measured candidate conditional; retain eligibility and 100-candidate guard |
| Admin directory index | Sort/query mismatch is a candidate, not a demonstrated incident | Require filter/skew/write-cost benchmark before building |
| Production target versus development legacy | Different defaults confirmed, not a proven runtime defect | Existing explicit target/profile tests remain; expand affected target tests when changing readers |
| Raw financial native validation | A native integrity boundary is useful; reader packet did not establish all writer contracts | Separate staged validator work after contract/negative/race tests, not speculative collMod |
| Complaint/refund/payroll races | External packet did not contain every writer; this is an evidence gap | Preserve shared employee/booking guards and existing hold/concurrency tests; no claimed provider acceptance |
| Catalog orphan-safe union | Current compatibility protection has measured benefit and skew limitations | Keep branches, state order, parent reread and caps; no simplification that hides orphan errors |
| Payroll directory cap/latest semantics | Existing contract; query traversal already deployed | Keep 200 cap before role filter; future paged API is separate |
| Overview exact all-time totals | Covering/projection experiment did not justify added cost | Keep exact totals; no cache or period substitution |
| Mail FIFO/due/UNKNOWN | Skew trade-off and unresolved synthetic candidate observations | Keep current implementation and indexes; no blind resend or root-cause claim |
| Rules/cart arrays | Model-level cap absent does not prove unlimited API writes | Pricing calculation validates at most 50 rules; cart add enforces maxCartLines=30 under transaction |
| Model select:false/immutability | Not a database authorization boundary | Keep explicit DTO/role/transaction guards; audit raw paths separately, no claim of observed leak |
| Nonunique startup checks | General checker emphasizes unique/TTL; dedicated finance/target checks add coverage | Distinguish critical readiness from performance drift; no runtime auto-index workaround |
| Legacy accrual task physical store | Empty and unregistered under EMPLOYEE; legacy compatibility remains | Keep physical store pending separate dependency/rollback/approval scope |
| Collection count/retention | Count alone cannot choose an ownership boundary or retention period | No blanket merge, TTL or audit/replay deletion |
| Integer VND / Admin actor guard | Existing boundary/serialization with possible growth/contention costs | Keep guards and overflow checks; no speculative numeric migration or guard removal |
| Provider/ops acceptance | Missing evidence in packet is not proof of a production incident | Preserve explicit provider gates and existing backup/restore evidence; no live provider write in this change |

Pricing rule validation is in `pricing-calculation.service.js`; cart cap and shared
transaction boundary are in `product-cart.service.js`. These source checks correct
the inference that absence of a model array validator automatically permits an
unbounded request. Raw-writer and native schema gaps remain separate questions.

Official [range pagination documentation](https://www.mongodb.com/docs/v8.0/reference/method/cursor.skip/)
supports avoiding deep offset traversal, but does not prove any particular query
plan. The measured unique service/effective index and regression tests supply
that project-specific evidence. MongoDB [schema validation documentation](https://www.mongodb.com/docs/v8.0/core/schema-validation/)
explains the native insert/update boundary; it cannot establish complete domain
or provider authority without the relevant writers and tests.

## Additive price-history API contract

`GET /api/v1/service-prices/admin/:serviceId/history` uses existing private
response, session and STAFF/ADMIN middleware. Existing full-history and active
price endpoints and all writers remain compatible.

Query: only `limit` and `before`; default 20, maximum 50. Cursor encodes canonical
owner ObjectId plus UTC millisecond effectiveAt. Invalid query returns 422;
malformed/missing parent returns 404 as before. Cursor is navigation input, not
an authorization token. Owner/role checks apply on every page. No extra secret,
index or provider dependency is introduced.

Response: `{prices, latestVersion, nextCursor}` within the existing data/meta
envelope. Each price keeps its DTO allowlist; future prices remain visible.
`latestVersion` uses its own version-leading query and is not inferred from the
effective-time page. Page predicate is effectiveAt less than cursor, descending,
with limit+1 sentinel. The existing unique `(serviceId,effectiveAt)` supplies
stable uniqueness within one owner, so no new tie-breaker/index is required.

Both price page and latest-version queries have maxTimeMS 5000. Mongo code50 maps
to 503 PRICE_HISTORY_UNAVAILABLE with no private driver text. This is a per-query
budget, not a five-second total HTTP deadline: existence, scheduling and transport
also take time. Legacy endpoint timeout semantics are not changed by this release.

Reads are not one transactional snapshot. Inserts newer than cursor appear on
reset; backdated inserts may appear on a later page. History is never silently
truncated or deleted. The full legacy API remains available for compatibility;
it still has growing cost and is not described as fixed for every old client.

## UI cutover

AdminServicePricesPage reads 20-row pages, with cursor stack for previous/next,
first and reload controls. Service changes reset the effective cursor scope;
stale responses cannot replace the current page or supply its write version.
Saving is disabled until current history/latestVersion is ready. Successful
save resets to first page; a backdated version need not appear there. A 409 resets
and refreshes history without retrying POST. Unknown acknowledgements remain
explicit and can be checked by reload. Navigation is disabled during a write.

Exact totals and page counts are not computed: the UI displays the visited page
number and whether another page exists. Product page/total/global-summary semantics
are unchanged, as are all pricing calculations, booking snapshots and audit facts.

## Evidence, rollout and rollback

Independent isolated MongoDB8.0.34 price benchmark at 100k revisions reported
legacy full-list+latest p50 1128.64 ms versus cursor first 2.11 ms. Page/deep-page
explain examined 51 documents/keys for maximum50 results, latestVersion one row.
This compares the whole projected/parallel candidate with legacy, not cursor-only
causality or production latency. Product168query comparisons and24service checks
retained DTO parity, but search/filter and skew regressions reject broad rollout.

Before release: architecture, lint, backend query/auth/CAS regression, UI
navigation/stale/save-conflict tests and frontend build; independent final-SHA
review, required CI and Leader merge. Read-only live inventory/preflight and a
fresh consistent backup restored in isolation precede code deployment. Compare
source hashes, data/index/validator metadata, readiness and API status/auth after
activation. No document/index/validator migration runs. Rollback selects reviewed
previous code; both endpoints are additive and persistent data remains unchanged.

Remaining work is explicit: product pagination/count/summary contract, conditional
area/user indexes, native raw-validator rollout, index drift classification and
retention/provider acceptance. This increment does not mark every external
finding or every API/provider integration complete.
