# Reference catalog production cutover

Copy the 24 breeds and 15 traits using the preceding legacy-default additive
release only after fresh frozen backup/restore, shadow reads and an isolated
target-write/reverse rehearsal. This release changes the shared production
default to target for runtime, factories and operator CLIs. Test/dev defaults
remain legacy. No new environment variable or `.env` rewrite is required.
Runtime checks strict validator/indexes before listening; it never copies/seeds.
Keep every writer on one release/source. A connection lock cannot fence another
process; do not run old seed jobs or recreate retired demo sitters.

## Measured decision

The current 39-row catalog has infrequent reference writes. After retirement,
consolidation removes one store and one index. Synthetic checkpointed index bytes
at this size are 80 versus 60 KiB; `kind` adds 624 BSON bytes across 39 rows.
The partial breed index removes sorting at larger fixtures, but larger index
bytes, slightly slower trait reads and bulk insert overhead remain accepted
tradeoffs. This is not a universal performance/capacity claim.

## Physical retirement

After reviewed target rollout, freeze all writers again and restore a new backup
into an isolated replica set. `scripts/database/retire-reference-catalog.js`
inspects exactly `aibreeds` and `aitraits`: native target storage, complete
copy/reference checks and original legacy metadata must all match. No arbitrary
collection choice. The manifest includes frozen catalog payload/checkpoint as
canonical Extended JSON; keep it private beside the backup, never commit/log it.
Creation is exclusive. A fresh dry-run is mandatory even if counts are unchanged.

Apply requires `REFERENCE_CATALOG_RETIRE_MANIFEST`, matching
`CONFIRMED_REFERENCE_CATALOG_DATABASE` and `CONFIRMED_REFERENCE_CATALOG_DIGEST`,
and `CONFIRMED_REFERENCE_CATALOG_WRITERS_FROZEN=true`. Assertions do not freeze
writers. Recheck the manifest before either drop. DDL is not transactional: stop
on failure, inspect completed names and never blindly retry partial operations.

From the current 84-store baseline, expect 83 collections, 600 documents and 204
indexes. Compare all unrelated BSON/metadata hashes and catalog payloads with
`kind` stripped. Rerun target provisioning: neither legacy catalog nor the 16
retired compensation stores may reappear.

## Rollback after target writes or physical retirement

Keep target authoritative and freeze writers. `--restore` recreates missing
legacy stores from saved frozen payload and original indexes; differing existing
metadata/records block. It then runs checkpointed reverse from current target,
preserving IDs, BSON types, timestamps and absence. New rows become inserts;
target edits replace only checkpoint-matching originals. Unknown refs, target
deletion or independent legacy writes block automatic reconciliation.

Store/index creation and baseline insertion are separate maintenance stages.
An interruption may require manual comparison with the manifest before retry;
never empty a different store to force success. After reverse succeeds, verify
full equality before starting the previous legacy-default reviewed release.
Retain target/evidence. Never switch to stale legacy or restore an old whole
backup over newer payroll/business writes.
