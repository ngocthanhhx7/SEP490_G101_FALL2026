# Reference Catalog Candidate

## Contract And Ownership

Only PetBreed/PetTrait are combined into typed BREED/TRAIT records in
`reference_catalog`. Breed species remains scalar DOG/CAT; trait species is an
array. IDs, BSON types, code values, timestamps and absent fields are copied
unchanged with only `kind` added. Unique `{kind:1,code:1}` permits the same code
across kinds. Cross-kind ID collisions block copy instead of generating new IDs.
Financial policy, ledger, snapshot, money and compensation owners are unchanged.

Existing query/session/upsert facade remains `PetBreed`/`PetTrait`. Internal kind
is hidden in normal queries so existing projections remain exact. API limits
(200 breeds/100 traits) and sort (species/name, code) are preserved. Tied breed
species/name ordering was not stable in the old contract and remains unspecified.

## Source Choice

Legacy is the default for the first additive release. `selectReferenceCatalogSource`
binds a source to one Mongoose connection before model registration. Factories
inherit the bound choice; conflicting choices and leaked opposing collection
registrations are refused. The subsequent [production cutover release](reference-catalog-cutover-2026-11-08.md)
defaults production processes to target after copy/shadow; dev/test stays legacy.
There is no per-query fallback or union.

Programmatic opt-ins:

- `createApp({connection, config, referenceCatalog:'target', ...})`.
- `startRuntime({env, referenceCatalog:'target'})`.
- `connectDatabase(config, {referenceCatalog:'target'})`.
- `petCareModels(connection, {referenceCatalog:'target'})` and
  `platformDataModels(connection, {referenceCatalog:'target'})`.
- `provisionDemoCatalog({connection, referenceCatalog:'target'})` and
  `provisionHanoiDemo({connection, auth, referenceCatalog:'target'})`.

Seed/deployment CLIs accept `--reference-catalog=target`: sitter-matching,
demo-services, provision-demo-catalog, provision-hanoi-demo, ensure-indexes and
demo-ai (propagates to its child seed commands). Omitted means legacy. Unrelated
pricing seed owns only pricing and requires no catalog. Existing physical legacy
names are not changed or removed. No real .env/provider setting is edited.

All current pet-care factory callers (pricing label reader, matching context,
avatar, checkout and product-order address reader) inherit the same connection
choice. Runtime raw catalog readers were searched: legacy name mapping and the
operator migration are the only source/script locations requiring raw access.
Do not bypass the factories with new raw catalog queries after cutover.

## Target Storage

Exactly three indexes: `_id_`, unique `{kind:1,code:1}`, and BREED-only partial
`{active:1,species:1,name:1}` filtered by `{kind:'BREED'}`. The partial replaces
the earlier generic `{kind:1,active:1,code:1}`, not an additional fourth index.
Trait list uses unique kind/code ordering. No TTL, financial or unrelated index.

Native `$jsonSchema` strict/error validator permits only the two typed shapes,
rejects unknown fields/kinds/types and preserves optional active/timestamp absence.
Deployment/migration provisions the validator at target creation. Incompatible
existing validators, collation or indexes fail closed; no automatic collMod/drop
or index replacement is shipped. Native validation does not enforce authorization,
reference integrity or immutability; service guards remain necessary.

## Copy, Limits And Checkpoint

The [operator CLI](../../backend/scripts/migrations/README.md) uses existing
`loadConfig` MONGO_URI/MONGO_DB, pool two, no automatic env-file loading. Default
is aggregate dry-run. Scan each of six collections by _id, limit 5,000 plus overflow
sentinel, batch 100, maxTimeMS 5,000, combined BSON cap 16 MiB. Hard ceilings are
20,000 documents/collection, 64 MiB, batch 1,000 and 30,000 ms. Overflow blocks.
Source/target catalogs are complete reads for unknown-field detection; reference
projections are pets.breedCode/traits/species, policies.rules.when and
profiles.allowedTraits. No records or IDs are logged.

Canonical Extended JSON hashes distinguish BSON types, field absence and array
order. Unknown fields/types/refs/species, duplicate code, ID collisions and any
conflicting/extra target payload block copy. Apply requires explicit frozen writers
and exact source digest, rescans inside snapshot/majority transaction, inserts only
missing target rows and checks exact payloads before commit. Retry after successful
copy inserts zero. Additive target DDL precedes the transaction and may remain
after an abort; legacy rows/indexes are never changed or dropped by forward copy.

Under freeze, generate an exclusive private checkpoint file in dry-run and record
its digest independently. It contains only hashes keyed by hash(kind,_id), not raw
records/IDs. This is the pre-cutover compare-and-set authority for reverse updates.
CLI caps checkpoint file size at 8 MiB and entry count at 40,000.

## Cutover, Shadow And Writers

1. Integrate/review the candidate against current main without altering the
   EMPLOYEE storage/retirement gates. Benchmark workload and footprint first.
2. Freeze catalog/reference writers, seed/provision jobs and deployment; drain
   requests. Freeze flag is an operator assertion, not a database lock. Snapshot
   isolation cannot fence a source-only writer after the snapshot.
3. Take fresh backup under freeze and verify isolated restore. Generate fresh
   dry-run/checkpoint; resolve all blockers; explicitly apply reviewed source digest.
4. Shadow through separate connections/apps, legacy authoritative and target
   shadow. Compare DTOs, order/count/IDs, auth/status/errors, eligibility, pricing
   labels and source registry. Do not combine/fallback to conceal divergence.
5. Change all runtime and operator entry points to explicit target together, then
   resume writers. Target startup asserts native validator and exact index set;
   deployment must already provision them. Runtime startup does not migrate/seed.
6. Post-cutover writes target only. Legacy stays frozen. Do not rerun old demo
   population or recreate retired sitters as part of this catalog transition.

## Reverse Reconciliation And Rollback

Before any target writes, freeze/drain and switch all entry points back to legacy.
After target writes, never switch to stale legacy or restore an old whole backup.
Keep both catalogs, freeze all writers, and run reverse dry-run with the trusted
checkpoint digest. Reverse validates authoritative target and all current refs.
New target records are inserted into legacy with identical IDs/BSON. Edited legacy
payloads can be replaced only when their hash still matches checkpoint; identical
payloads need no write. Replacement intentionally preserves field absence and dates.

Independent legacy modifications, code conflicts, missing checkpoint originals,
unknown schema/ref/type, target deletions or extra legacy rows block reverse.
No delete is automatic: target deletion needs a separate reviewed decision.
Apply binds a fresh reverse digest, repeats checks in a snapshot transaction,
reconciles and verifies exact equality before commit. Any payload failure aborts
all reverse writes. Ambiguous/concurrent results require a fresh dry-run; a completed
reconcile is a zero-operation retry. Forward copy remains blocked on divergent
post-cutover target payloads and must not be used to overwrite target edits.

After verified reverse equality, switch every entry point back under freeze and
resume legacy. Keep target for investigation. Retirement/drop of legacy is outside
this patch and requires separate authority after rollback/backup gates.

## Measured Tradeoffs And Limits

Synthetic MongoDB 8.0.34: partial index removes breedList's blocking sort and
reduces large-fixture examined docs from 1,000 to 200 at limit 200. It retains
three target indexes. However, large target index bytes exceed legacy and trait
list can be slower; target BSON adds kind and bulk writes pay native validation.
No universal performance win, RSS/CPU/throughput claim or production acceptance.

The additive release temporarily has both legacy stores and target. Only a later
separately authorized retirement reduces two stores to one. Existing old candidate
targets with the generic index require explicit reviewed repair/new deployment
planning; the provisioner refuses to silently add/drop indexes.
