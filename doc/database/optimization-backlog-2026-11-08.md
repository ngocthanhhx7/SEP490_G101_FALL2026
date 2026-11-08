# Unified database/API optimization backlog

This table deduplicates the 18 SECOND findings and 32 findings in two distinct
external reviews. E1/E2 refer to the external review identifiers; duplicate copies
of E1 are counted once. Those reports are reference material, not authority to
change production. Historical deployment evidence is recorded in the
[reconciliation](independent-review-reconciliation-2026-11-08.md) and the linked
plans. No evidence gap is presented as an observed production defect.

| Work item and source IDs | Current disposition | Evidence, limits and next trigger |
| --- | --- | --- |
| Catalog traversal: SECOND-01, E1 F-05, E2 F10 | Implemented, verified, deployed | Orphan-safe latest-before-state selection and bounded parent reads; synthetic 100k revisions, retained DTO/error semantics. Keep union and parent reread; no universal skew/SLO claim. |
| Financial booking lookups: SECOND-02 | Implemented, verified, deployed | Three bookingId indexes, measured isolated source predicates and write cost; live stores empty at prior rollout. No claimed live latency gain. |
| Dispatch prefilters: SECOND-03 | Implemented, verified, deployed | Two bounded projected account/status reads; authoritative eligibility/occupancy still rechecked transactionally. |
| Price history: SECOND-04, E1 F-01, E2 F05 | Implemented, verified, deployed | PR252/release253; new cursor API/Admin20 rows; 15 services/16 versions exact parity. Legacy endpoint remains compatible and unbounded. |
| Product queries/UI: SECOND-05, E1 F-02, E2 F06 | KEEP broad query/index; conditional default optimization | 168 query cases/24 service parity comparisons show search/filter/skew regressions. Fresh conditional default shape/cache-state/write evidence required; retain exact filtered total/global summary and all navigation. |
| Presentation copies: SECOND-06 | Implemented, verified, deployed | Explicitly approved retirement of 15 matching copies; canonical parent retained; frozen backup/restore/reverse rehearsal. Do not rerun cleanup. |
| Product binary photos: SECOND-07, E1 F-14 | KEEP split; reader optimization deployed | URL references differ from uploaded bytes; max-gallery synthetic write benchmark supports split. One projected photo aggregation retains auth/visibility/CAS. |
| Legacy queue registration: SECOND-08, SECOND-16 | Implemented, verified, deployed | EMPLOYEE registration/provisioning excludes earningaccrualtasks; physical store retained. No permission to drop. |
| Reference source/docs: SECOND-09, E2 F02 | KEEP explicit source defaults; docs fixed/deployed | Production target versus development/test legacy is intentional configuration divergence; target compatibility tests are required for affected changes. No blind default flip. |
| Replay/private/financial retention: SECOND-10, E1 F-11, E2 F15 (retention) | Decision gate | Need a concrete per-store recovery/retention matrix and owner-approved periods. No blanket TTL; audit, command and UNKNOWN replay guarantees stay intact. |
| Provider acceptance: SECOND-11, E1 F-09, E2 F14 | Provider gate | Source flags, fixture tests and CI do not prove payOS/refund/SMTP/R2 acceptance. Need specifically authorized sandbox/live operations and receipts; do not send real messages or charge payments for diagnostics. |
| Admin authority: SECOND-12, E1 F-16, E2 F16 | Implemented, verified, deployed; KEEP guard | Persisted acting Admin guard/CAS/retry and self-lock tests. Contention requires measurement; never remove authority serialization as a performance shortcut. |
| Payroll directory: SECOND-13, E1 F-06, E2 F11 | Query implemented, verified, deployed; KEEP cap contract | Existing employee/version traversal; 200 cap before role filter and latest-version semantics remain. New paged API only as a compatible separate increment if cardinality warrants. |
| Payroll overview: SECOND-14, E1 F-08 | KEEP exact all-time totals | Isolated projection/covering experiments did not justify added cost. Revisit with measured growth/concurrency and explicit stale-tolerance decision. |
| Mail FIFO/due: SECOND-15, E1 F-07, E2 F07 | KEEP current query/index | Skew regression and unresolved candidate claim observations; no incident/root-cause claim. Need reproducible per-claim/CAS evidence before any candidate rollout; no blind UNKNOWN resend. |
| Legacy settlement history: SECOND-17 | Conditional on LEGACY_PARTNER | EMPLOYEE routes return410 after auth; preserve fail-closed balance caps. Revisit only for an explicitly supported legacy deployment. |
| Retirement DDL: SECOND-18 | KEEP existing operational guards | Checkpointed partial progress/frozen digest/restore/reverse required; multi-DDL is not atomic. Historical retirement is complete, not permission for new drops. |
| Area-leading index: E1 F-03, E2 F01 | Conditional | Prior isolated 10k candidate plan is promising; need area-selectivity/skew and update-cost matrix retaining 100-candidate guard/rechecks. Two live rows do not justify building an index. |
| Admin directory index: E1 F-04 | Conditional | Need actual filters/search/cursor/deep-page/skew/update-cost benchmark. Existing response cap does not prove bounded scan. |
| Native raw contracts: E1 F-10, E2 F03 | In progress: writer/state contract prerequisite | Approved native catalog contracts exist; raw operational/financial constraints need writer/BSON/null/missing/historical matrix, positive/negative/race tests and isolated restore/preflight before enforcement. No speculative collMod. |
| Financial hold/claim/session races: E2 F04 | Evidence work required | Preserve employee/booking guards; trace session through prepare/approve/pay, test races/retries/unknown commit on isolated replica set. Packet omissions do not prove missing guards. |
| Metadata drift: E2 F08 | Implemented locally; validation/review pending | Read-only manifest/checker compares ordered keys, unique/partial/sparse/TTL/hidden/collation and selected validator/options; critical and performance categories separated. Existing runtime readiness remains unchanged. See [contract plan](storage-contract-drift-2026-11-08.md). |
| DTO/privacy: E2 F09 | Evidence work required | select:false is not authorization. Negative DTO/auth tests must cover raw and aggregate paths; no observed leak is claimed. |
| Rule/cart bounds: E2 F12 | KEEP existing API caps; native evidence separate | Pricing validates50 rules, cart transaction caps30 lines. Missing model/native cap does not establish an unbounded API. Include raw writers in native-contract work. |
| Collection ownership/queue retirement: E1 F-12, E2 F13 | KEEP ownership; destructive decision gate | Count alone cannot justify merging. Prepare queue-only dependency/provision/rollback scan and fresh isolated restore before asking about physical retirement. Earlier drop approvals do not cover it. |
| Integer VND: E1 F-13 | KEEP policy/types; boundary evidence required | Preserve approved rounding/safe-integer checks. Add aggregate/overflow/replay properties where gaps are verified; no speculative Long/Decimal migration. |
| Historical snapshots: E1 F-15 | KEEP | Historical facts have separate lifecycle/authority; duplication alone is not a bug. Do not rewrite paid/booking snapshots. |
| Ops/index usage: E2 F15 (operations) | Conditional/evidence limit | Prior backup/isolated restore verified; fresh evidence required for each rollout. indexStats code13 is an access limit, not permission to elevate or drop. Self-managed single-host availability is not HA. |

All 50 source identifiers are represented; several sources cover multiple
concerns and are split by scope. A row becomes complete only after its required
technical verification and deployment/operational acceptance. KEEP and conditional
rows retain explicit limits rather than implying every integration is complete.
