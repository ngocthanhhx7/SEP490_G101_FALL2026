# Database/API optimization acceptance

The authorized technical increments are implemented or resolved through measured
KEEP/conditional decisions. The [unified backlog](optimization-backlog-2026-11-08.md)
covers all18 SECOND and32 external source identifiers without treating evidence
gaps as production bugs. Provider and future retention decisions remain explicit.

## Completed scope

| Increment | Result and evidence |
| --- | --- |
| A — Product default reads | PR258/release259 deployed; only unfiltered sort changes. Native16-query/102-page/241-row parity preserves full DTO, filtered totals and global summaries with zero writes. Filtered shapes remain unchanged. [Benchmark limits](product-default-query-2026-11-08.md). |
| B — Native raw contracts | PR261/release262 deployed. Six narrow strict/error validators preserve historical/null/reconciliation states; new verified receipt/tax writers use version1. Actual apply/reverse, transaction rollback, retry and unknown commit tests passed. Refund producer remains an adapter gate. [Contracts](raw-operational-validation-2026-11-08.md). |
| C — Storage drift | PR255/release256 operationally deployed and included in serving546bf193. Final native metadata check covers78 collections/118 index contracts, with zero critical/performance findings. Remaining unasserted scope is explicit. [Manifest](storage-contract-drift-2026-11-08.md). |
| D — Area/admin indexes | No live index added.96 native comparisons/8 update trials support conditional area evaluation and KEEP for the broad admin candidate because of skew regressions. [Triggers and limits](conditional-directory-indexes-2026-11-08.md). |
| E — Finance/privacy | Actual case/payroll sessions, guards, source claims, hold races, paid snapshot preservation and negative DTO/auth tests verified. Synthetic provider stubs/refund reader fixtures do not prove provider/producer acceptance. [Scope](financial-serialization-evidence-2026-11-08.md). |
| F — Empty queue/retention | PR264/release265; owner approved only earningaccrualtasks. Live CLI performed exactly one queue drop after fresh backup/rehearsal. Core BSON/index/validator parity passed. [Queue](empty-accrual-queue-retirement-2026-11-08.md), [per-store retention](lifecycle-retention-matrix-2026-11-08.md). |

## Current production and recovery evidence

At13:54UTC:81 collections,585 documents,201 indexes. API reviewed main546bf193
serves BLUE3000; operator tooling reviewed main ea093a1 is installed separately
under operator-releases, with685 artifact files verified. This tooling release
does not require an API cutover. API release/runtime/frontend hashes, readiness,
public service/product reads, guest-private401 responses, environment checksum,
restarts0/OOMfalse passed again after queue retirement.

The retained81-store BSON hash before/after the action is
b44edd23faff3a1a87053ecc5ca7ae3525ce008f837cc4f761bb2dea6d011fae.
All corresponding core index/validator metadata matched. The whole-database
metadata diagnostic after retirement is
b7dbf4867699b32dc0982f26bf747b123c409b1394a848fc91b7a6f54f9c8f8a.
The former82-store hash includes the now-absent empty namespace and is not the
current hash. No core document was deleted or restored.

Fresh pre-action backup pwc-20261108T135115Z.archive.gz, SHA256
99ef1986441b3f1d2b62183e9d7f441fa6fcae116981a87a5ff43b0a98eb95ed,
was restored to a network-isolated replica set. The exact reviewed source ran
CLI drop/reverse, repeated EMPLOYEE provisioning and retained a post-drop core
write across restore. Native six-validator metadata stayed intact. The final
rehearsal used Mongo320MiB and sequential restore/Node192MiB with128MiB host
headroom; API was never stopped. A prior128MiB restore attempt stopped and was
excluded, rather than counted as successful rehearsal.

The private operation journal is under
backups/approved-empty-queue-retirement-20261108T135401Z. Source rollback keeps
the compatible EMPLOYEE gate. If queue restoration is needed, use the reviewed
queue-only manifest/reverse; never restore an old whole database over newer
writes. Namespace recreation can change its UUID.

## Verification and remaining limits

Final tooling main CI passed163 backend suites/1,486 tests,124 frontend suites/
904 tests, architecture, lint, build, audit and16+6 Python checks. Independent
review reran30 focused native tests; the merged tree reran7 queue tests. A separate
39-test money-boundary rerun passed. These are actual source/synthetic checks.

No new financial policy, cap, eligibility, consent, paid snapshot, provider flag,
private-content purge or blanket TTL was introduced. Existing seven TTL contracts
remain unchanged. New retention periods require an owner-approved purpose,
replay/dispute/hold window and coordinated metadata/object recovery policy.
payOS/refund/SMTP/R2 and other live provider acceptance still need specifically
authorized operations and receipts. No provider send/charge was made here.

Cloudflare returned403 for recent public HTML/entry probes, so no fresh edge
byte-for-byte acceptance is claimed. Origin reviewed build hashes passed; DNS,
proxy/challenge settings were not changed. indexStats remains an access/evidence
limit; no privilege was added to obtain it. No maximum-performance or HA claim is
made from this single-host deployment.
