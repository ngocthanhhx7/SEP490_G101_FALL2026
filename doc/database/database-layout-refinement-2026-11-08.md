# Database layout reassessment and refinement

## Verified baseline and scope

Fresh read-only production inspection on 2026-11-08 found 83 collections, 600
documents and 204 indexes. All collection metadata and top-level field shapes
were inventoried without exporting private values. Forty-two stores are empty,
but that alone does not authorize removal. The complete owner/query/lifecycle
matrix is still under independent review; this change implements the concrete
findings below, not an assertion that every database/API issue is resolved.

## Remove the remaining one-to-one presentation duplicate

All 15 `servicepresentations` records exactly match their canonical
`services.presentation`, including BSON types and dates. The redundant store
contains 12,478 logical BSON bytes, two indexes (73,728 allocated index bytes)
and 36,864 allocated collection storage bytes at the measurement time.

Runtime and public catalog now read only the embedded parent. Provisioning writes
only the parent and cannot mirror/recreate the old store. Legacy model registry
leaks stop app composition and deployment before DDL. The old factory/copy tool
remain explicit operator compatibility tools. Services created without optional
presentation do not read an alternative store; new metadata must be provisioned
on its parent. Migrate any older incomplete database before this runtime release.

`scripts/database/refine-catalog-storage.js --scope=presentations` is dry-run by
default and creates an exclusive private Extended JSON manifest. It checks all
source fields, parent IDs, exact copied payload, schema coercion, original two
indexes, 1,000-row/16 MiB scan and 256 KiB parent limits. Apply requires matching
database/digest and writer-freeze assertions. It drops exactly one verified copy
store, never deletes parent data. Restore rebuilds the original index set and
legacy record IDs from current canonical parents, so post-cutover metadata edits
are not lost. Existing stores are never overwritten; partial restore needs
operator reconciliation before retry.

## Match canonical latest-version reads to existing unique indexes

Canonical service, policy, price and visibility histories enforce uniqueness of
owner/effectiveAt. Remove redundant version tie-breakers only for those owners;
AI pricing policy, availability revisions and employment contracts keep their
existing ordering rules. The catalog/price batch pipelines now bound canonical
parent IDs and sort owner/effectiveAt before grouping. Parent catalog reads stop
at 1,001 and reject catalogs over 1,000 with `503 CATALOG_SOURCE_LIMIT`, never
silently truncate. Orphan historical rows cannot become public catalog parents;
reference integrity must be checked during preflight. Withdrawn/inactive/future
states still select the latest effective row before filtering state.

A native synthetic MongoDB 8.0.34 comparison at 1k/10k/100k versions preserved
the complete latest-row payload. At 100k, the original global sort read 100,000
documents; the bounded candidate used DISTINCT_SCAN/FETCH, 29 keys/15 documents,
p95 197.61 versus 2.08 ms (two warmups, 11 warm sequential samples; p95=max).
An unbounded candidate was slower and was rejected. These are pipeline timings,
not HTTP latency or production throughput.

Two nonunique indexes are now absent from schema provisioning:

- `servicepriceversions.serviceId_1_effectiveAt_-1_version_-1`.
- `systemsettingversions.key_1_effectiveAt_-1_version_-1`.

Retain both unique owner/version and owner/effectiveAt indexes. Native production
read-only explains against the retained unique indexes returned the same row,
one key/one document and no SORT. No `$indexStats` usage claim is made. Physical
drop is a separate, expressly approved maintenance step after all readers use
the new query shape. `--scope=indexes` checks the exact two nonunique definitions
and required unique indexes before apply; restore creates only these two known
index definitions. DDL is non-atomic; stop and reconcile completed names on error.

## Product photos: preserve access separation and remove an extra read

`products.photos` contains public URL references, including static sample assets;
`productphotos` contains normalized uploaded WebP bytes, not duplicate product
metadata. Production currently has 30 products and zero uploaded photo documents.
Keep the binary payload outside the frequently read/updated product document.

Native synthetic comparison used both 64 KiB images and the allowed 5 × 1 MiB
gallery, projected only one image via `$elemMatch`, excluded embedded bytes from
metadata results, and rotated modes under a 256 MiB WiredTiger cache. At the max
gallery fixture, stock-update p50 was 0.92 ms separate versus 6.74 ms embedded;
photo p50 was 3.20 versus 7.54 ms. Small-image results were mixed. This measures
31 warm sequential samples, no concurrent/provider workload or capacity claim.
Removing a collection at the cost of that coupling is not the selected design.

Actual photo delivery now uses one projected aggregation through the existing
product-ID and productId/digest indexes instead of two application round trips.
The root match enforces product existence, deletion, visibility and referenced
digest before lookup. Admin role validation, normalized body, headers, byte-length
check and 404/422/503 behavior remain. No new index or provider is introduced.
Single aggregation is not a cross-collection snapshot transaction claim.

## Rollout and recovery gates

1. Review the final source SHA and required architecture/lint/tests/build/CI.
   Release source through reviewed main; preserve `.env`, other checkouts and
   provider settings. Inspect registered stores and ensure the old presentation
   model is absent.
2. Before any live drop, obtain approval for exactly 15 redundant presentation
   copies and the two named nonunique indexes. Keep all canonical service/product,
   account, policy, financial and media data unchanged.
3. Hold deployment lock, freeze/drain every writer, take a fresh backup and
   restore it into an isolated replica set. Rehearse source/drop/restore and
   post-parent-edit recovery there. Record fresh manifests/digests and verify
   old/new catalog DTOs and retained BSON hashes.
4. Apply only the approved scope after fresh comparison. Expected delta is one
   collection, 15 duplicate documents and four indexes in total. Reprovisioning
   must not recreate the retired store or redundant index definitions.
5. Check source/artifact hashes, readiness, guest/auth behavior and all retained
   data. Retain private manifests/backups. Restore metadata/current parent copies
   before old-code rollback; never restore an older whole database over new work.
