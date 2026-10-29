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

## Earnings read integration

PR #65 now composes a durable earnings reader with the #63 snapshot/ledger
foundation, while keeping the current application modules and role navigation.
The focused earnings storage/projection run passed 2 suites / 31 tests, including
7 new isolated Mongo repository regressions. Coverage checks owner scope,
Vietnam dates, signed cursor binding, missing joins, corrupt ledger, case/refund
holds and snapshot consistency when a hold commits between reader queries.
This is author evidence, not an independent approval or production acceptance.

Final dashboard integration checks before adding the Admin review branch:

- Backend lint and architecture: PASS; full suite: 90 suites / 823 tests PASS.
- Frontend lint: PASS; full suite: 76 suites / 482 tests PASS; build: PASS.
- Authenticated application composition now mounts dashboard routes inside the
  shared authenticated API router. Regression coverage exercises a real session
  and the composed earnings and settlement endpoints without duplicate mounts.
- Vite still reports a bundle larger than 500 kB. No production operation ran.
## Admin settlement integration

PR #64 integrates the #63 foundation and current develop. Owner: Thanh.
Mandatory evidence ownership, reservation readiness and transfer-attempt ports
now fail composition when omitted. The Admin route uses its own controller;
rejection audit no longer mislabels held money as available.

Actual checks on this integration: backend lint/architecture PASS; full backend
81 suites / 757 tests PASS; frontend lint PASS, full frontend 75 suites / 466
tests PASS, frontend build PASS with the existing bundle-size warning.
The first focused unit run exposed outdated doubles missing the now-mandatory
ports; the doubles and regressions were updated, then all suites passed.

## Remaining source gates

After composing the Admin review branch with dashboard routes: backend lint and
architecture PASS, 94 suites / 844 tests PASS; frontend lint PASS, 78 suites /
490 tests PASS, build PASS. This precedes the private transfer attachment update.

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
