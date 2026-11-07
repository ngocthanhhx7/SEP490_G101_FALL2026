# MongoDB diagnostics

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
