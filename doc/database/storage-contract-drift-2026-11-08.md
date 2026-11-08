# Read-only storage contract inspection

## Staged scope

Current runtime readiness emphasizes registered unique/TTL indexes and separate
finance, scheduling and reference-catalog assertions. The target is an operator
diagnostic that inventories metadata against the selected runtime's declarations.
It does not change HTTP readiness, provision indexes, infer index usage, or enforce
new financial validators. Existing ownership, integer VND, snapshots and APIs stay
unchanged. Source-only rollback removes the command; no database restore is needed.

The manifest will combine registered Mongoose indexes with existing raw finance
and scheduling provisioning contracts, the booking owner cursor contract and the
specialized reference catalog. Explicit catalog provenance validation is selected
by the operator because rollback tooling supports both required and optional
provenance. Unasserted collections/options must remain visible as coverage gaps.

Compare ordered keys, unique, partial, sparse, TTL, hidden and effective collation.
Check validator/validationAction/validationLevel only where source declares a
contract. Unique, TTL, validator and collection absence affect correctness;
missing nonunique read indexes are performance warnings. Unknown indexes are not
permission to drop. Collection defaults and undeclared dangerous index options
must not be silently accepted.

Before publication: synthetic positive/negative metadata tests, an isolated MongoDB
8.0.34 replica-set test proving no writes, architecture, lint and frontend build.
Use bounded metadata reads; never read application documents or print driver error
messages. Independently review the final SHA and required CI before merge. Run the
reviewed diagnostic against production read-only; compare data/index/validator
invariants before/after. This operator command needs no runtime cutover or DDL.

## Sources

MongoDB [listIndexes](https://www.mongodb.com/docs/v8.0/reference/command/listindexes/)
returns index keys/options, including hidden indexes. [Collation](https://www.mongodb.com/docs/v8.0/reference/collation)
defaults depend on locale. Therefore an unspecified non-simple locale must not be
treated as a fully checked collation contract merely by comparing `locale`.

## Implemented command and acceptance limits

Run `node --env-file-if-exists=.env scripts/database/check-storage-contracts.js
--catalog-provenance=required` in backend after the required-provenance cutover.
Default `unasserted` does not invent a catalog cutover state; `optional` checks
the reviewed rollback validator. Raw finance native validators remain unasserted
until their writer/state contracts have been approved. The output's READY state
means no differences within the selected manifest; it does not assert all native
validators, all access paths or provider correctness.

The command composes runtime models without listening/starting jobs. Metadata
operations have a 5-second client timeout and server budget, with caps of256
collections and512 indexes per collection. It reads no business documents, never
calls indexStats, and logs no driver messages. Metadata across collections is not
one transactional snapshot; concurrent DDL requires a stable-window rerun before
acting. No output authorizes a drop, privilege escalation or automatic repair.

All registered base models supply index declarations. Discriminator indexes are
not counted as independent physical indexes. Enabled finance/scheduling modules
add their existing raw declarations; named finance indexes retain their existing
name requirements. The booking owner index accepts either direction after its
equality prefix, matching the existing reader contract. Missing nonunique read
indexes are performance warnings; unique/TTL/validator/collection mismatches and
unexpected unique/TTL indexes are critical. Specialized reference_catalog retains
its exact three-index and strict/error contract.

Nine new replica-set tests plus ten existing deployment/booking-index regressions
passed on MongoDB8.0.34. Tests cover positive runtime provisioning, missing/read-
denied metadata, key order, unique/partial/sparse/hidden/TTL drift, explicit and
incomplete collations, strict/error validator drift, required versus optional
provenance and view replacement. Command monitoring allows only metadata reads;
synthetic private values are absent from reports. Initial full-runtime fixture
failed the existing booking-owner readiness gate because its setup order was
wrong; creating the required fixture index before provisioning resolved it.
No production guard was changed. All159 backend suites/1,455 tests passed;
backend/frontend lint, architecture and frontend build passed. Independent
final-SHA review and operational acceptance remain release gates.
