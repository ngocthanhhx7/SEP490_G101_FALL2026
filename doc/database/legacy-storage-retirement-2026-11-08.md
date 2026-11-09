# Empty legacy compensation storage retirement

The EMPLOYEE composition replaces legacy partner compensation with employee
payroll. Its reviewed runtime must be deployed and verified before removing the
16 names in `legacyCompensationCollections`. Explicit LEGACY_PARTNER remains a
compatibility mode and requires restoration before old-code rollback.

## Invariants

No core record, commission credit, payroll claim, payment, ledger, policy,
account or private object is deleted by this operation. Every selected legacy
store must be empty; emptiness alone is insufficient without the runtime,
worker and provisioning isolation established by the employee profile release.
All other names are outside the maintenance command's scope.

`backend/scripts/database/retire-legacy-storage.js` defaults to inspection.
Set `LEGACY_STORAGE_MANIFEST` to a new private file path; it records database,
the exact 16 names and index metadata, preserving compound key order. Existing
files are never overwritten. Unknown collection/index options, nonempty or
missing stores block the operation. The tool never instantiates domain models.

## Apply sequence

1. Verify reviewed main SHA, CI, deployed EMPLOYEE profile, readiness and zero
   registered legacy models/workers. Inspect actual environment without changing
   it. Retain the previous image/release.
2. Hold the deployment lock; stop and drain all application writers. Take a fresh
   backup and restore it into an isolated MongoDB. Run inspection, drop and
   metadata restoration there; compare the complete restored manifest digest.
3. Inspect production again. Preserve the manifest beside the backup. Confirm
   `CONFIRMED_LEGACY_STORAGE_DATABASE`, `CONFIRMED_LEGACY_STORAGE_DIGEST`, and
   `CONFIRMED_LEGACY_WRITERS_FROZEN=true`; run `--apply` against that manifest.
   These flags attest operator checks; they cannot establish authorization or
   actually freeze concurrent writers.
4. Expect 16 fewer collections and exactly the manifest's index count removed.
   Compare all retained records/types and collection metadata against the
   frozen baseline; do not infer disk/RSS savings from logical BSON.
5. Start only the new EMPLOYEE runtime. Check readiness, catalog/product/auth
   behavior and the profile provisioner: it must not recreate the retired names.

## Partial failure and rollback

MongoDB collection drops are not transactional. The command stops at the first
failure and reports completed names plus the in-progress name. Do not blindly
rerun an incomplete apply. Keep writers frozen and inspect actual metadata.
`--restore` creates only missing empty stores and their original indexes; it
refuses different existing metadata or any record. An interrupted index build
requires reconciliation of that empty store against the saved manifest before
retry. Never erase unknown records to make a retry pass.

Restore and verify the exact manifest before restarting LEGACY_PARTNER or an old
release. Once any new writes have occurred, whole-database rollback requires
reconciliation; restoring an older backup over current payroll is not an
acceptable shortcut. This maintenance command neither rewrites env nor enables
legacy business writers.

## Service analytics query

The same release bounds canonical service IDs to 1,000 and returns an explicit
503 above that budget, rather than reporting truncated metrics. Version reads
match those parents and effective time first, then traverse the existing unique
`(serviceId,effectiveAt)` index backwards. That uniqueness removes the need for
a version tie-breaker. Orphan versions cannot contribute to a canonical catalog
metric; source reference audits remain a separate check. Price counts use the
same parent scope. HTTP role checks and snapshot transaction stay unchanged.

A local MongoDB 8.0.34 native-pipeline comparison at 1k/10k/100k historical
versions returned equal parent/state sets, including future history. At 100k,
the original plan scanned 100,000 documents with a blocking sort; the bounded
plan used DISTINCT_SCAN/FETCH, 29 index keys and 15 documents. Sequential warm
client p50 was 301.60 versus 1.07 ms. There were two warmups and 11 samples per
plan, original before candidate; reported p95 is therefore the maximum sample.
This measures the version pipeline, not the entire API, production load or price
pipeline. No new index or write-cost improvement is claimed. Tests cover
inactive/latest/future states, canonical parent scope, 7/30/90-day windows and
budget rejection.
