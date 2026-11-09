# Operator migrations

`reference-catalog.js` defaults to aggregate-only dry-run. The operator explicitly
supplies the existing `MONGO_URI` and `MONGO_DB` through `loadConfig`. No
environment file is loaded by this CLI. It does not run at application startup.

```
node scripts/migrations/reference-catalog.js
node scripts/migrations/reference-catalog.js --writers-frozen --write-checkpoint=<fresh-private-checkpoint-path>
node scripts/migrations/reference-catalog.js --apply --writers-frozen --expected-digest=<fresh-source-digest>
node scripts/migrations/reference-catalog.js --reverse --checkpoint=<checkpoint-path> --expected-checkpoint-digest=<checkpoint-digest>
node scripts/migrations/reference-catalog.js --reverse --checkpoint=<checkpoint-path> --expected-checkpoint-digest=<checkpoint-digest> --apply --writers-frozen --expected-digest=<fresh-reverse-digest>
```

Apply requires a frozen writer window and replica-set transactions. The freeze
flag is an operator assertion, not a distributed lock. Budget flags are
`--max-docs`, `--max-bytes`, `--batch-size`, `--max-time-ms`; all have bounded
defaults and hard ceilings. Output contains only counts, error codes and hashes.
The command inserts missing target rows without altering legacy data or dropping
indexes. A failed copy rolls back payload writes; additive DDL may remain.
Target creation uses native strict/error validation for BREED and TRAIT. Existing
unvalidated targets or old generic index sets are refused before copy; this CLI
never collMods/drops/replaces indexes to repair them.

Checkpoint files contain only per-document keyed hashes, not raw records/IDs.
Keep the file and its independently recorded digest private. Files use exclusive
creation; an existing checkpoint cannot be overwritten. Reverse reconciles new
target records and replaces an edited legacy payload only when its current hash
still matches the checkpoint (or is already identical to target). This preserves
types, timestamps and absent fields. Unknown references, independent legacy writes,
source digest drift or target deletions block reverse. It never deletes records.
After an ambiguous response, run a fresh reverse dry-run before retry.
See [the candidate plan](../../../doc/database/reference-catalog-candidate.md)
before considering any real environment invocation.
