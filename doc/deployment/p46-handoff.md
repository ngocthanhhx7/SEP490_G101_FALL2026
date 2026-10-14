# P46 WBS-N01 handoff — applicant status and scoped verification

| Field | Value |
| --- | --- |
| Work item | WBS-N01 / UC-N01 / EXT-APPLICANT |
| Assigned code owner and intended commit author | Đặng Văn Hải (`hai`) |
| Assigned reviewer | Nguyễn Hữu Anh Nhật (`nhat`) |
| Merge owner | Nguyễn Ngọc Thành (`thanh`) |
| Branch | `feature/wbs-n01-applicant-status-and-scoped-verification` |
| Base | `origin/develop` at `82c862c8cc6410df3938b67154a19e494fb8acef` when this handoff was refreshed |
| Worktree | `D:\WW\SEP490_G101_FALL2026-p46` |

## State

**INTEGRATION_PENDING.** This work adds a public-facing page and a backend service seam. No route is registered and no live OTP or database integration is claimed. P34-A's shared auth/provider/root wiring is merged, but its P46 route and guest-flow composition are not present. P16's application-form PR (#36) and application-list PR (#39) are merged into `develop`, but the merged code still has no public tracking endpoint or `INTERVIEW` state; its local worktree was read for contract alignment and left unchanged.

## Git and review state

- Feature commits: `f0cba2b2c57e68538de73ff44dd5d0e7d0ba99c2` and `84655accc3b237ad8e9e33a4190a2637839d897c`; author and committer are Đặng Văn Hải (`danghaix27@gmail.com`). The latter closes a fail-open date parsing case for null or missing status dates and adds regression coverage.
- Push account and PR author: `Haidvhe181849`.
- PR: [#30 — feat: applicant status and scoped verification](https://github.com/ngocthanhhx7/SEP490_G101_FALL2026/pull/30), base `develop`, open, not draft. Use the PR as the source of truth for its latest head SHA.
- Review request: Nguyễn Hữu Anh Nhật (`anhnhat432`) requested. The reviewer posted an independent review comment for head `84655ac`; no formal GitHub approval is recorded because integration gates remain open.
- GitHub check runs: none reported. Commit status: pending with no status entries. PR mergeable state: blocked. The PR is not merged.

## Scope delivered in this worktree

- `backend/src/services/applications/application-status.service.js` requires an application-bound OTP adapter before any status lookup. It rejects malformed or extra request fields, reads only by the application ID returned after OTP verification, exposes a narrow status DTO, and computes the 30-day reapplication deadline from the server-side rejection timestamp.
- `frontend/src/pages/public/application-status/ApplicationStatusPage.jsx` keeps the application code, challenge and OTP in component memory, submits them through injected methods, uses generic verification errors, displays status/rejection reason/reapplication date, and does not open a sitter session after approval.
- The page uses P04 shared controls and provisional tokens, includes responsive styles, and remains unregistered for P34 integration.
- Unit tests use synthetic values and stubbed ports. They do not demonstrate OTP delivery, cross-application isolation against MongoDB, server-side throttling, or a working route.

## Contract required to integrate

1. **P16 / P01:** issue a high-entropy opaque application code in the submission receipt; store a keyed digest rather than a plaintext code; define lookup and retention; expose a status-only repository projection. The merged P16 code contains submission/admin application code but no public tracking endpoint. Its current state enum is `PENDING`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`; `INTERVIEW` is not yet supported.
2. **P06:** add an `APPLICATION_STATUS` OTP purpose bound to the resolved application, with one-time challenge consumption and server-side per-application resend, hourly-send and failed-attempt limits. Unknown codes and valid codes must have indistinguishable responses. Do not reuse contact-only throttling as the application scope.
3. **P34:** register public same-origin POST routes with no application code or personal data in the URL; inject the status repository and scoped OTP port; define the unauthenticated CSRF/origin policy for this guest flow. Keep application documents Admin-only and do not create a sitter session from status verification.
4. **P00 decision:** `APPLICANT-ACCESS` / EXT-25 still needs a recorded decision on the access proof and rate-limit policy. The current P46 code fails closed until an adapter meeting that contract is supplied.

The injected service ports are `statusOtp.beginForApplication({ applicationCode, purpose })`, `statusOtp.verifyForApplication({ applicationCode, challengeId, code, purpose })`, and `applications.findApplicantStatusById({ applicationId })`. The OTP verifier must return an internal application ID only after atomically consuming a valid challenge bound to the same application. The repository must return `state`, `submittedAt`, and, for rejected applications, `decisionReason`, `rejectedAt`, and `reapplyAt`.

## Decisions and inputs

- **Decided by source contract:** applicant does not need a Pet Sitter account to track a submission; only the verified applicant sees status/reason/reapply eligibility; the reapplication period is 30 days; private documents remain Admin-only.
- **Open:** access method and final limits under EXT-25; application-code issuance and storage with P16/P01; an `INTERVIEW` state and applicant-safe reason projection; P34 route and guest CSRF composition.
- **Figma:** `NOT_INSPECTED`; no frame, URL or screenshot was provided. Styling uses the provisional P04 system and is not a Figma verification.
- **Provider:** no SMS/email adapter was invoked. P06, P11 and P12 remain integration dependencies for real delivery.

## Checks

- `backend`: `npm ci --ignore-scripts` completed; audit reported 0 vulnerabilities; `npm run lint` passed; `npm run test:unit` passed (12 suites, 129 tests).
- `frontend`: `npm ci --ignore-scripts` completed; audit reported 0 vulnerabilities; `npm run lint` passed; `npm test -- --runInBand` passed (10 suites, 111 tests); `npm run build` passed.
- The first frontend test run had four label-query failures; tests were corrected to query the accessible textbox role and the full suite then passed.
- Route/database/provider, cross-application ownership, replay/race and server throttle checks were not run because the P06/P16/P34 integrations are absent. Unit tests stub those ports and do not claim live verification.

## Next owner actions

- P00/P01 records the EXT-25 access decision and application-code contract.
- P16 adds code issuance, interview state if approved, and the status-only repository adapter.
- P06 implements the application-bound challenge purpose and rate limits.
- P34 registers and composes the public routes and guest API adapter. The shared auth/provider/root wiring from PR #15 is merged, but it did not include the P46 tracking route.
- Re-run negative, ownership, replay, race, cooldown and deadline checks against the integrated runtime before marking this flow `VERIFIED`.
