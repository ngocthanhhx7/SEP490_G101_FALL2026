# Financial session and privacy evidence

Scope: EMPLOYEE current source, synthetic MongoDB8.0.34 replica set. No provider,
mail, SMS or bank call. These checks support the
[native contract increment](raw-operational-validation-2026-11-08.md); they do not
establish live provider acceptance or every historical/raw import path.

| Path | Source boundary and fresh evidence | Remaining limit |
| --- | --- | --- |
| Payment | Signature port precedes repository; receipt, intent CAS, finance.touch booking guard, command/event/notification share transaction | Signature verification is stubbed in source replay; real signed provider acceptance not established |
| Completion/credit | Booking execution updates visit/booking and calls recordEmployeeServiceCompletion with session; employee guard precedes immutable per-visit credit upsert | Synthetic visit price/times; no real attendance/quality or policy approval fabricated |
| Case hold | Real complaint repository writes case, guarded booking and each affected employee guard with one transaction | Six active case/approval races and explicit sequential orderings tested; not exhaustive scheduling proof |
| Payroll prepare | Employee guard → source/hold reads → statement/credit claim/event/notification in same transaction | Source caps/policies remain unchanged; no guard removed for contention |
| Approve/pay | Employee guard plus authoritative case/refund reread before CAS; transfer claim is transactional and idempotent | No real bank transfer; actor revocation during every possible transaction is not newly certified |
| Refund | Existing hold-reader fixture blocks approval/payment in relevant states | No mounted raw producer adapter established; reader test does not prove producer session/guard propagation |

The new six-case serialization suite captures real driver commands: prepare and
actual case submission each use one lsid/txnNumber through guard/source/claim
writes. A case after prepare blocks approval with unchanged statement snapshot;
six concurrent case/approve attempts serialize and subsequent payment rechecks the
hold. A case after recorded payment preserves paid money/version/claims without
automatic clawback. Refund fixture verifies authoritative hold reads, explicitly
without claiming raw refund producer acceptance.

Negative DTO/role/ownership checks cover raw visit private notes, private contract
references, foreign employee history, Admin-only aggregate-backed lists and foreign
complaint access. Existing HTTP payroll tests additionally exercise401/403/CSRF/
private-no-store boundaries. select:false is not treated as database authorization.

Native contract tests inject actual isolated-server transient write and unknown
commit errors: transient failure retries the transaction, unknown commit retries
commit without a second domain write. Invalid receipt validation rolls back its
booking counter. Competing CAS writers commit one result. Journal failure and lost
collMod acknowledgement preserve partial/in-progress state for metadata-based
reverse; valid writes arriving during multi-DDL block postflight acceptance and
survive reverse. No test restores old database contents over newer writes.

Initial new-suite failures were fixture defects: driver guard command is
findAndModify, and repeated synthetic applications need distinct submissionKeyDigest
under the existing unique index. Both fixtures were corrected; no runtime guard,
index or test assertion was weakened. Final six cases passed; full required CI and
independent final-SHA checks remain merge/deployment gates.

Those gates subsequently passed for PR261/release262: final independent focused
49 tests, fresh merged-tree20 native/financial tests and configured CI passed.
Reviewed main546bf193 is serving with the six native contracts enforced; see
[final acceptance](raw-operational-validation-2026-11-08.md#final-reviewed-production-acceptance).
These are source/native regression results, not live provider receipts.
