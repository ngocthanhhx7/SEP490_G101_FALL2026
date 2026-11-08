# MongoDB diagnostics

`reset-demo-workflows.js` defaults to a bounded read-only dry-run. The explicit
`--apply` path requires the matching database/digest and confirmed writer drain;
it deletes demo workflow records and manifested demo sitters, reconciles product
reservations and verifies retained BSON in one transaction. It does not drop
collections/indexes or modify environment/provider objects. Follow the
[reset and rollback plan](../../../doc/database/demo-core-reset-2026-11-08.md)
and obtain approval for the concrete live operation before apply.

`audit-layout.js` uses the configured backend environment to read collection
sizes, indexes, scalar unique-key duplicate counts and 12 explicitly declared
current references. Run with `node --env-file-if-exists=.env
scripts/database/audit-layout.js`. It disables Mongoose autoCreate/autoIndex,
does not provision storage, and emits aggregate counts and schema metadata only.
Queries use a 5 second bound and a two-connection pool. This is not a snapshot
across collections, an index-usage measurement or a full nested/business audit.
Missing references need domain investigation; they do not authorize deletion.
Prefer a read-only database principal; never include raw output containing
private documents or credentials in a public report.

`benchmark-mail-indexes.js` always starts its own disposable MongoDB 8.0.34 with
synthetic data; it never accepts a remote URI. Run directly with Node. It compares
the existing mail index with a partial FIFO candidate at 1k/10k/100k rows under
three distributions. Reports include warmed sequential read p50/p95, throughput,
insert duration, examined keys/documents, checkpointed index bytes and client
RSS. RSS is not MongoDB memory; throughput is not concurrent worker capacity.
No SMTP/provider is used. Run benchmarks outside CI; timing is environment dependent.

`benchmark-catalog.js --baseline=<full-SHA>` loads the baseline catalog service
from the local Git object and compares it with current source on one isolated
synthetic catalog. It checks DTO equality, driver command count, warmed sequential
latency and client RSS. It does not access a configured or remote database.

See the [staged plan](../../../doc/database/mongodb-optimization-plan-2026-11-07.md)
before making schema/index/lifecycle changes. Neither diagnostic script migrates
or deletes application data.

`migrate-service-presentations.js` defaults to dry-run. After review, backup,
isolated restore verification and a source-provisioning freeze under the deploy
lock, apply requires `--apply`, `CONFIRMED_PRESENTATION_DATABASE` matching the
configured database, and `CONFIRMED_PRESENTATION_DIGEST` matching a fresh dry-run.
It copies legacy metadata into its parent Service in per-document transactions;
it never overwrites different embedded metadata or deletes legacy documents.
The dry-run blocks orphan/duplicate parents, conflicts, unknown fields, invalid
embedded values and documents exceeding 256 KiB. The command is limited to
1,000 source documents with batch size 100; expand that reviewed migration budget
explicitly if a future catalog exceeds it. Partial progress is safe to rerun.
Keep source provisioning frozen until post-copy comparison passes. Roll back
code to the previous release while legacy data remains; no reverse copy is needed.
Physical cleanup is a separate approval after the rollback window and fresh
comparison. This command does not drop collections or activate TTL indexes.

`migrate-catalog-audits.js` defaults to copy dry-run. It adds only three provenance
fields to each existing canonical version, retaining all legacy sources. It never
invents history or overwrites conflicts. `--phase=cleanup` proposes three legacy
audit-store drops after full coverage and required native validators;
`--phase=restore` reconstructs old records, including post-cutover events, before
old-code rollback. Restore leaves embedded metadata intact.

Apply requires `--apply`, `CONFIRMED_CATALOG_AUDIT_DATABASE` and a fresh
`CONFIRMED_CATALOG_AUDIT_DIGEST`. For restore this is the returned version digest;
for copy/cleanup it is the source digest. Cleanup/restore also require
`CONFIRMED_CATALOG_AUDIT_CLEANUP=source-copies-only` and
`CONFIRMED_CATALOG_WRITERS_DRAINED=true`. Flags are operator assertions, not proof
of permission, backup or drain. Caps: 10,000 source and version records, source
64 KiB, parent 1 MiB, batch 100 and bounded queries. BSON types remain intact.

App readWrite lacks collMod. Existing operator credentials install the reviewed
four strict/error validators only after clean copy/catch-up. Never grant app
privileges to retry. Before rollback, reverse-copy and verify, then operator
changes these validators to the reviewed optional-provenance form before old
writers restart. Do not overwrite foreign validators without review.

`benchmark-catalog-audit-storage.js` uses isolated synthetic MongoDB to compare
full duplicate audits with embedded provenance at 1k/10k/100k. It measures logical
BSON, data/index storage and writes; synthetic timing is not production capacity.
See [catalog audit storage plan](../../../doc/database/catalog-audit-storage-plan-2026-11-07.md).

`benchmark-catalog-point-lookups.js` runs isolated synthetic point-time queries at
1k/10k/100k version documents with the current unique/history indexes. It compares
selection equality, examined keys/documents and warmed latency without creating
or dropping any production index. Fixtures exercise query shape, not full domain
records; timing is not production capacity.

`provision-booking-owner-index.js` defaults to bounded aggregate dry-run and never
creates an absent bookings collection. Apply requires `--apply`, matching
`CONFIRMED_BOOKING_INDEX_DATABASE`, fresh `CONFIRMED_BOOKING_INDEX_DIGEST`, and
`CONFIRMED_BOOKING_INDEX=customerId:1,_id:-1`. It adds one non-unique index only,
reuses equivalent plain indexes, preserves existing data/indexes and reports any
concurrent owner/_id change after build (`ownerKeyDigest` covers only these
fields, not the complete booking snapshot). No drop/TTL/backfill is performed.

`benchmark-booking-owner-index.js` and `benchmark-booking-owner-writes.js` run
synthetic isolated query/storage and bulk-write comparisons. Both checkpoint
before storage measurements. These fixtures do not establish production latency
or full booking schema validity.

`benchmark-calendar-reads.js` compares the old per-day calendar with batched
snapshot reads at1k/10k/100k revisions and1/7/31days. It checks identical output,
data command count, returned document BSON and warmed latency in isolated MongoDB.
Short ranges may pay consistency overhead; timings are not production capacity.
