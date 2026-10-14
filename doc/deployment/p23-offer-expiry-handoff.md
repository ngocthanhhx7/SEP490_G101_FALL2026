# P23 — Offer expiry and operational sweep handoff

## Scope

- Work item: WBS-061 Offer Expiry Job / JOB-02 operational expiry contracts.
- Feature branch: `feature/wbs-061-offer-expiry-job`.
- Code owner and commit author: Phạm Thành Chung. Assigned reviewer: Đoàn Tiến Đạt. Final merger: Nguyễn Ngọc Thành.
- Integration owner: P34. The current checkout intentionally contains only dependency-injected job ports; it does not register a scheduler or Mongo repository.

## Implemented

- `backend/src/jobs/operational-sweep.job.js` provides bounded, coalesced sweeps for:
  - Offer expiry every 5 minutes.
  - Visit reminders at 2 hours and 30 minutes before `startAt`, every 15 minutes.
  - Proposal expiry, no-arrival at 30 minutes after `startAt`, no-checkout at 2 hours after `endAt`, handover overdue at 1 hour, and change-request expiry from its persisted `expiresAt`.
- Offer deadlines use the SRS rule: two hours normally, 30 minutes when the visit starts in less than 24 hours. The deadline is exclusive at the exact instant and `canAcceptOfferAt` fails closed for non-pending offers.
- Every operation has an opaque, stable idempotency key derived from operation type, aggregate type/id and due instant. A repository command receives the expected state/version/facts and a fencing token; it must re-read the aggregate and append the event/outbox record atomically.
- A durable lease port (`acquireLease`, `renewLease`, `releaseLease`) prevents duplicate work across instances. Loss of the lease stops the batch before applying another operation. Logs contain task counters only.
- The job does not mutate payment state, create checkout intents, change an old visit schedule when a change request expires, or invent a terminal Visit state for reminders/no-arrival/no-checkout/handover. Those effects belong to the owning aggregate adapter and later integration.

## Checks

- `node --check src/jobs/operational-sweep.job.js`: PASS.
- `node --check tests/unit/operational-sweep.job.test.js`: PASS.
- ESLint using the existing repository installation (`eslint` scoped to the two new files): PASS.
- P23 unit suite using the existing repository Jest installation: **9 tests passed**.
- The normal `npm run lint` and `npm test` commands were also attempted in the clean P23 worktree, but its `node_modules` directory is absent; those commands failed before loading project code. No dependency was installed or generated in the repository.
- `git diff --check`: PASS.

## Integration pending

P34 must map the repository and lease ports to Mongo/Mongoose with a durable lease/fencing implementation, atomic state/version checks, unique idempotency records, audit/outbox events, and scheduler registration. P24/P25/P26/P27/P33/P42 still own the offer accept, reassignment, change-request, handover, check-in/out, notification and directed-proposal adapters. P23 tests use synthetic ports and do not prove database, provider, scheduler, or end-to-end integration.

The six-hour change-request expiry is consumed only from the persisted `ChangeRequest.expiresAt`; the unresolved reschedule policy is not inferred or hard-coded here. P34 must run the real negative, race, restart/catch-up, timezone-boundary and late-accept checks before staging.
