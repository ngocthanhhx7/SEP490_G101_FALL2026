# Staged native operational validation

## Contract and compatibility plan

DB-08 inspected source4590a3b and is a draft, not rollout authority. Current
source dd5fd77 differs in checkout catalog lookup shape, EMPLOYEE/legacy finance
registration and complaint/payroll hold/commission paths. Re-read those writers
before defining constraints; do not install the old draft wholesale.

Target ownership and collection names stay unchanged. The first contract covers
six existing raw stores; refunds remains unasserted because no mounted raw writer
adapter has been established. No financial policy, amount calculation, approved
snapshot, eligibility, state transition, TTL or index changes. Existing documents
are not backfilled or normalized.

| Store / authority | Native v1 scope | Explicitly preserved states/types |
| --- | --- | --- |
| bookings: checkout, finance.touch, dispatch, review | Optional non-null version, financeGuardVersion, reviewGuardVersion are nonnegative safe integral BSON numbers | PREPAY/POSTPAY, missing deadline/links/snapshots, all historical state strings; no globally required fields |
| visits: checkout/boarding, assignment, execution, acknowledgement/review | Optional non-null version/reviewGuardVersion as above | sitter ObjectId/string/null, customerVisitId string, careAcknowledgement.version digest string, partial lifecycle dates and old price snapshots |
| payments: signed webhook repository | Optional version counter; detailed current receipt contract only when storageContractVersion=1 | Unmarked historical receipts remain compatible; marked reconciliation permits null links/money, foreign currencies and missing verifiedAt |
| paymentintents: checkout/link claim/webhook | Optional non-null version counter | CREATING/READY/reconciliation link substates, arbitrary provider link ID, paid pending-link combinations; no amount/date/link required globally |
| taxassessments: Admin confirmation | Optional version; detailed confirmed source contract only when storageContractVersion=1 | Unmarked historical assessments remain compatible; no invented tax rate/currency/policy/deadline |
| cases: complaint submit/update + employee/booking holds | Optional non-null version/objectionCount counters | UUID/string or ObjectId IDs, ISO-string timestamps, nullable captions, optional evidence fields, bool/object/null financialHold; no global complaint/incident enum |
| refunds: port exports/hold readers | No native contract asserted | Raw adapter mapping, status/state, sourceRef and historical persistence remain a gate |

Counter constraints permit missing/null for legacy compatibility; they reject
non-null strings/objects, negative/fractional/unsafe numbers. They do not prove a
counter is present, guarded or immutable. BSON int/long/double are accepted within
the JS-safe range; no Decimal/string money migration is introduced.

New verified payment and confirmed tax inserts carry storageContractVersion=1.
This additive persistence marker does not change HTTP DTOs or paid facts. Only
marked PAYOS+VERIFIED receipts require ObjectId booking/intent, nonempty event and
bank reference, received/verified Dates, positive safe integer amount and VND.
Only marked CONFIRMED assessments require ObjectId booking/actor, Date, the
existing evidence-reference pattern and nonnegative safe integer totalTaxVnd.
Unmarked history is intentionally not claimed as fully natively validated.

## Required gates before enforcement

1. Add source declarations and a read-only aggregate preflight, with bounded
   document/hash checks, metadata/index digest and invalid counts only. Preserve
   foreign validators; never overwrite an unrecognized contract.
2. Exercise actual writers plus legacy/reconciliation/Postpay/boarding/case samples
   and negative BSON values on an isolated MongoDB8.0.34 replica set. Test CAS,
   rollback, races/retry and session propagation; provider calls remain synthetic.
3. Independently review final SHA, required CI and source-only release. Take fresh
   backup, isolated restore and validator apply/reverse rehearsal before live DDL.
4. Apply only with matching database/fresh digest/exact contract confirmation and
   deployment lock. Record each successful DDL because multi-collection collMod
   is not atomic. Verify data/index hashes unchanged and expected validator options.
5. Deploy reviewed main, check runtime hashes/readiness/auth and run metadata
   checker with the newly explicit raw scope. Rollback removes only this exact
   validator contract using retained prior options; no database restore over writes.

No production collMod has run for this increment at plan creation. A new source
declaration or green synthetic test alone is not acceptance or authority for an
unreviewed draft; this plan's verification and operational gates remain mandatory.

The explicit deployment ensure-indexes command also checks the six required
native contracts before activation when finance sources are enabled. It stops on
missing/drifted validators and never repairs them with collMod. Ordinary command
paths gain no extra per-request metadata round trips. The HTTP readiness policy
is otherwise unchanged.

## Source and verification evidence

MongoDB [collMod](https://www.mongodb.com/docs/v8.0/reference/command/collmod/)
changes validation rules for inserts/updates; it does not retroactively certify
stored data. [Validation level](https://www.mongodb.com/docs/v8.0/core/schema-validation/specify-validation-level/)
controls which updates are checked. Native positive/negative tests establish this
project's compatibility, rather than inferring it from those general documents.

Author full backend161 suites/1,471 tests passed before the additional deployment
assertion (source guard unchanged; focused rerun required). The12 dedicated cases
cover malformed BSON, marked receipts/tax, unmarked history, journaled apply/
reverse, foreign/stale preflight, partial acknowledgement, concurrent CAS,
validation rollback, transient retry, unknown commit and preservation of valid
writes arriving during multi-DDL. Existing real webhook/execution/complaint and
payroll regressions passed with source-created native validators.

The fresh backup pwc-20261108T122452Z, SHA256
dd820fe0bc6eee0abb3e04eb73c07571e821a585a79eac8df3575f70ae62be96,
was restored into a network-isolated replica set on VPS without stopping the API.
Candidate source installed/reversed all six validators there; failed validation
rolled back the booking counter, unknown commit retried without duplicate receipt,
reverse retained valid post-apply writes, and cleanup returned exactly82/585/203
with retained raw BSON hash unchanged. This is rehearsal, not production/provider
acceptance. Source changed later only to add deployment metadata assertion; bind
the final source and fresh restore gates again before enforcement.

Reverse compares normalized validator defaults. MongoDB can retain explicit empty
validator/strict/error fields after reversing an originally implicit empty contract;
do not claim raw collection-options bytes return to the original representation.
No data/index restore is performed. Nontransactional metadata reads and concurrent
valid writes can block postflight acceptance; reconcile the journal rather than
rolling back new business documents.
