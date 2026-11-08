# Employee storage and dispatch optimization

The second whole-database inventory covers 83 collections, 600 documents and 204
indexes on reviewed production `be68e16`. Static ownership/query coverage is not
exhaustive dynamic API or provider acceptance. Empty collections alone do not
justify retirement. This follow-up addresses concrete access and registration
defects; it does not consolidate unrelated financial, security or replay records.

## Source ownership and compatibility

- `earningaccrualtasks` belongs exclusively to `LEGACY_PARTNER`. The shared
  finance factory defaults to registering command/event/media stores only.
  Runtime composition, migration CLI, deployment provisioning and readiness all
  pass the same explicit legacy option. EMPLOYEE rejects leaked queue models.
  The previously approved fixed 16-store retirement manifest stays unchanged.
  Existing physical queue data is not deleted by this release.
- Dispatch preloads projected active User and SitterStatus sets for at most 100
  availability candidates using two queries. Each survivor still passes the
  authoritative eligibility/occupancy/contract/travel checks; invitation and
  acceptance retain their transaction guards. No cross-request eligibility cache
  or cross-collection snapshot guarantee is introduced.
- Public catalog traversal preserves missing-parent errors. Disjoint `$in` and
  `$nin` owner branches select latest effective versions in one `$unionWith`
  aggregation, including orphan owners. A conditional parent reread covers a
  parent created after the initial bounded read. Latest state filtering follows
  version selection. This aggregation runs outside transactions.
- Account lock/unlock guards the persisted active, nonsynthetic ADMIN in the
  target/audit/session transaction, including transaction retries. A different
  actor receives the existing version write guard; self-lock checks authority
  and uses the target CAS once. Lost authority returns 403 and rolls back writes.
  No new guard field, index or authority policy is introduced.

## Lookup indexes and budgets

Finance provisioning adds one plain nonunique `booking_source_lookup` index on
`{bookingId: 1}` to each of `cases`, `refunds`, and `visits`. Readiness rejects
missing, unique, partial, sparse, hidden or TTL variants. Existing unique,
partial, TTL and owner cursor indexes remain. Name/spec conflicts stop deployment.

The independent isolated 102k-record fixture estimates about 0.81 MiB per index;
exact hold predicates examine 100 rather than 100,000 case/refund documents and
the 61-visit bounded lookup examines 61 rather than 60,078. These are synthetic
growth measurements, not production latency or write-capacity acceptance. All
three live stores were empty in the baseline. The additional index write/storage
cost is accepted for direct booking ownership lookups in financial guards; area,
product tab and broad history indexes remain conditional on measured workload.

The corrected orphan-safe catalog fixture (15 parents, 100k revisions) returns
equal BSON payloads, examines 15 documents and 44 total keys across both union
branches, versus 100k documents previously. Warm sequential p95 was 199.42 versus
1.49 ms over 11 samples after two warmups. No new catalog index is needed.
Earlier 29-key evidence omitted the orphan branch and must not describe this
final pipeline. This is query-only evidence, not a whole-API capacity claim.

## Staged release and rollback

1. Review the final diff and run architecture, lint, affected Mongo replica-set
   tests, frontend build and required CI. Independently review the final SHA.
2. Under the deployment lock, capture fresh collection/index metadata and verify
   existing names/specs, bookingId BSON types and retained unique/TTL invariants.
   Preserve `.env`, database volumes and all application documents.
3. Take a fresh consistent backup and restore into an isolated replica set.
   Rehearse provisioning twice, both compensation profiles, dispatch results,
   lost-Admin authority/CAS/retry rollback and catalog orphan/state behavior.
4. Deploy reviewed main through ordinary additive provisioning. Assert the three
   indexes and absence of legacy queue registration, readiness, API status/auth
   compatibility and unchanged document hashes/counts. No data migration runs.
5. Code rollback leaves the three additive nonunique indexes in place. It needs
   no document rollback. If presentation retirement is separately approved,
   restore its current canonical metadata before selecting old readers, as
   described in the [layout refinement plan](database-layout-refinement-2026-11-08.md).

Physical cleanup of the existing empty accrual queue requires a separate fixed
scope, fresh empty/digest verification, backup/restore rehearsal and explicit
approval. This source gate is not permission to drop it. Permanent replay/audit
and private delivery retention remain separate business decisions.

## Remaining whole-database work

Bound service-price history and align product pagination with actual UI workloads
before choosing more indexes. Retention requires explicit durations and replay
semantics; provider flags alone do not prove payment/refund/R2 acceptance. Keep
binary product photos separate from stock documents: URLs and uploaded bytes
have different access patterns and are not duplicate product metadata.
