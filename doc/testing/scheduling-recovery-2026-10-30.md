# Scheduling Recovery

## Confirmed Decisions

- Checkout creates operational care shifts automatically. Staff/Admin intervene only
  after automatic dispatch cannot find an accepting employee; both roles receive an
  idempotent in-app notification. A decline alone does not trigger escalation.
- System dispatch targets five live invitations, replenishes declines, and permits a
  smaller group when fewer eligible employees are available in its bounded search.
  Customer-directed bookings retain their chosen employee. Acceptance remains explicit;
  concurrent acceptances yield one assignment and revoke the remaining offers.
- New employees can receive operational invitations based on signed contracts,
  approved capability, registered shifts/areas, occupancy and verified route feasibility.
  Their lack of history is not converted into a fabricated rating or training label.
  The existing advisory MATCH shortlist retains its score threshold of 60.
- Leash handling is a capability requirement with zero additional fee. Existing pricing
  policies require a new approved version through the guarded migration; no old quote,
  payment, settlement or policy version is rewritten.

## Production Observation

Read-only inspection on 30 October 2026 found reviewed main `760f116` running on EC2,
AI enabled with Vietmap routing, ranking policy version 1 and weights
fit/travel/quality/reliability/workload = 30/25/20/15/10. There were 42 AI profiles,
zero visit outcomes and zero stored ranking models. The runtime therefore uses
explainable rules. Offline trainer availability and synthetic portability tests
are not evidence of a trained production model.

## Checks

Isolated Mongo regression covers automatic checkout plans, exact integer boarding
allocation, legacy plan recovery, eligibility and payment gates, five nearby newcomers,
replacement after decline, fewer eligible candidates, single-winner concurrency and
Staff/Admin escalation deduplication. Providers in these tests are synthetic.

Frontend regressions cover contract version lookup and retry, Admin-only contract
controls, actionable scheduling errors, automated dispatch states and manual controls
only for escalated visits. Record final full-suite, browser, PR and release results
in the release handoff. These source checks do not establish an authenticated real
customer booking, payment-provider callback, actual sitter acceptance or inbox delivery.

## Release Operations

Run `scripts/migrations/leash-handling-policy.js` in dry-run mode first. Apply requires
`--apply --database <configured-database>` and a fresh backup with isolated restore
verification. Use the reviewed release image; keep credentials outside the artifact.
Retain the previous image/release for rollback. The additive policy migration preserves
historical policies; rolling back code does not require deleting financial history.
