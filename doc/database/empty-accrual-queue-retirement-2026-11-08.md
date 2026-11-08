# Optional empty accrual queue retirement

## Final decision and acceptance

The owner explicitly approved deleting this empty queue after final review,
backup/restore and live dry-run. The action completed at13:54UTC using reviewed
main ea093a1 (PR264/release265). Exactly one drop targeted earningaccrualtasks;
81 collections/585 documents/201 indexes remain. All retained core BSON, index
and validator metadata matched before/after; six native financial contracts and
seven existing TTL contracts remain intact. API546bf193, environment and readiness
are unchanged. See [final acceptance](optimization-acceptance-2026-11-08.md).

This approval was consumed for that exact empty namespace; it grants no other
cleanup, retention, replay or provider operation. The historical proposal below
explains the scope and guards. Do not rerun apply against an absent namespace.

## Historical decision scope

Only `earningaccrualtasks` was proposed. It was empty and unregistered under the
active EMPLOYEE profile; existing approval for the16 legacy compensation stores
does not cover this collection. Do not add it to that old retirement manifest.
The increment prepared a separate default-read-only command and rollback path.
No live drop runs without the owner's new explicit decision after review and
fresh backup/restore rehearsal.

Fresh native snapshot2026-11-08 12:51UTC:82 collections/585 documents/203 indexes;
queue0 documents, options{}, `_id_` and `{state:1,nextAttemptAt:1}` nonunique.
Logical queue BSON0 bytes; allocated collection4,096 bytes and indexes8,192 bytes.
These are snapshot allocations, not promised filesystem/RSS or latency savings.
If approved, expected namespace count81 and indexes201, documents still585.

## Dependencies, provisioning and rollback

Current factory defaults legacyTasks=false. Active runtime only starts accrual
worker for LEGACY_PARTNER; EMPLOYEE enqueue/drain return before queue access.
Deployment/migration pass the selected profile, and EMPLOYEE registry assertion
rejects an accidentally registered legacy queue. Repeated EMPLOYEE provisioning
must not recreate it. Explicit LEGACY_PARTNER provisioning can recreate its empty
schema/indexes if that separate supported profile is later selected.

Reviewed source rollback targets97db1dc/b64c147 retain the EMPLOYEE gate, so source
rollback does not require a physical queue. Do not flip profile, invoke legacy
provisioning or run the old16-store retirement to perform this cleanup. Demo reset
mentions the queue in a fixed empty-workflow scope; absence is already compatible
with that guarded maintenance path. External/manual writers and scheduled operator
scripts require a fresh freeze/inventory check before action; static source alone
does not prove every external process is absent.

The new command accepts only the fixed namespace, empty content, plain collection
options and the exact two known indexes. Apply requires explicit database, digest,
writer-freeze and queue-only confirmation plus a durable journal. Flags assert
operator conditions; they do not grant the missing owner approval. Unknown/drop
acknowledgements preserve in-progress metadata. Restore recreates only this empty
collection/indexes, preserves current core data and refuses nonempty/conflicting
state. Namespace recreation may use a new MongoDB collection UUID; no change-stream
resume/UUID consumer is claimed compatible without dependency evidence.

## Mandatory final gates

Independent final-SHA review and CI; native positive/negative/unknown-DDL and
provisioning regressions; fresh backup restored into a network-isolated replica
set; queue-only drop/reverse there with retained core BSON/metadata parity; current
runtime/profile/worker/operator inventory and resource budget; deployment lock and
fresh empty/digest check. Present that concrete scope and evidence for the owner
decision. Retention/TTL for other command, audit, financial or private delivery
stores is outside this proposal and must remain unchanged.
