# P21 dispatch handoff

## Scope

- Work items: WBS-030 Assign Pet Sitter and WBS-063 Auto Assignment Job
- UC: UC-36 (Assign Sitter to Visit)
- Extension: EXT-AI deterministic candidate ranking and provider fallback
- Planned owner/reviewer: Đặng Văn Hải / Nguyễn Hữu Anh Nhật
- Integration owner: P34 (route registration and runtime composition)

## Implemented

- `backend/src/services/dispatch.service.js` applies fail-closed eligibility gates for approval, active status, service, work area, availability, local day off, and visit conflicts.
- Eligible candidates are ordered with stable rule dimensions (slot match, workload, distance, valid rating, sitter id). The result contains explanations and never exposes pet or private address data or an aggregate score.
- Optional provider ranking is constrained to the already eligible set. Invalid or unavailable provider output falls back to deterministic ordering.
- `backend/src/services/directed-proposal.service.js` reads server availability, stores a pending Customer proposal, and creates an Offer only through the atomic confirmation repository operation.
- `backend/src/jobs/auto-assignment.job.js` is bounded and idempotent. It skips directed/unpaid/stale visits and creates pending Offers only through the repository guard/CAS port; it never assigns a Visit directly.

## Checks

- `npm run lint -- --no-warn-ignored`: PASS.
- `npm run test:unit -- --runInBand`: PASS (27 suites, 287 tests).
- Full `npm test -- --runInBand`: P21 unit suites pass; the existing P16 integration suite has six authentication failures in the current checkout and is unrelated to these files.

## Integration pending

P34/P01 still need to provide Mongo/Mongoose repositories, route/controller wiring, EligibilityGuard and sorted day occupancy guards, Visit CAS, Offer uniqueness, outbox/audit writes, and the real payment/directed proposal gates. The current tests use synthetic dependency-injected ports and do not prove database/provider integration.

UI is not in this P21 backend scope; WBS-029/P34 and P42 own the later route and directed proposal UI integration. No Figma or provider verification was performed.
