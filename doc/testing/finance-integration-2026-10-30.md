# Finance integration verification, 30 October 2026

## Settlement request and earning foundation

Branch starts at develop `746d0e5` and preserves PR #63 history. Integration
keeps the current private-image/pricing/matching modules and Customer navigation.
Owner: Hai. Independent review is still required; this report is author evidence.

Actual local checks (Node 24.22.1, npm 11.19.1):

- Backend lint and package architecture: PASS.
- Full backend suite: PASS, 77 suites / 735 tests, before the additional legacy
  index migration regression and final timestamp validation changes.
- Focused accrual/settlement tests rerun after those changes; see current PR
  evidence for the final result. Mongo uses isolated 8.0.34 replica sets.
- Frontend lint: PASS; full suite: PASS, 73 suites / 457 tests before the added
  withdrawal retry regression; focused withdrawal page suite: PASS, 4 tests.
- Frontend build: PASS; Vite reports a bundle larger than 500 kB.
- No production writes, migration, provider transfers, SMS or deployment.

Coverage includes completion/payment retries, immutable snapshots, guarded
source reads, concurrent booking ordinals, Vietnam week boundary, late payments,
fee rounding/odd-tax split, missing tax/payment/allocation/evidence rejection,
principal/ledger/outbox atomicity, concurrent settlement requests, owner-only
withdrawal with permanent quota, multiple case/refund holds, audited release,
held reservation withdrawal and a separate post-payout adjustment review item.

## Remaining operational integration

The approved [FIN-07/08 decision](../requirements/finance-decisions-2026-10-30.md)
does not supply booking payment allocations or tax assessments. The current base
still lacks the primary persisted booking/completion, receipt/allocation and
assessment adapters. The earning producer now exists, but its trusted source port
must be implemented and called by the authoritative completion/payment flows.
The synthetic source used by tests is explicitly not registered in runtime.

Default policy stays closed until that integration and private transfer evidence
exist. These passing checks do not establish live business acceptance or authorize
an approval. PR #63, #64 and #65 must retain their acceptance gates until the
respective end-to-end sources and final independent review are verified.
