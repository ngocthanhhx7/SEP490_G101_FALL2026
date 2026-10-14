# P34-A integration status

- **Work item:** P34-A, Shared integration and route wiring
- **Branch:** `feature/p34-a-shared-integration-and-route-wiring`
- **Owner / author:** Nguyễn Ngọc Thành (`thanh`, `ngocthanhhx7`)
- **Reviewer:** Nguyễn Hữu Anh Nhật (`nhat`, `anhnhat432`)
- **Final merge owner:** Nguyễn Ngọc Thành (`thanh`, `ngocthanhhx7`)
- **Base:** `develop`
- **Status at this handoff:** historical first mini-gate verified and merged through PR #15; the follow-up below is a separate integration pass. Mini-gate only, not the final P34 gate. Check GitHub for the live review/merge state.

## Integrated contracts

- P06 auth routes register only when `AUTH_ENABLED=true`; startup requires separate OTP, session, CSRF, contact lookup, and AES-256 contact-encryption secrets. Missing/short secrets fail before database connection with field names only.
- The route registry includes OTP challenge/verification, session creation/revocation, contact change, and authenticated `GET /me`. `/me` returns only user ID, display name, and roles after rechecking active session, account state, synthetic flag, and auth epoch.
- `EMAIL_ENABLED` and `SMS_ENABLED` default to false. SMTP uses Nodemailer 10.1.1. eSMS remains its existing adapter; P34 composes both behind one contact-delivery port and maps P06 `PHONE` to P12 `SMS`.
- Provider configuration is validated before listen. No provider call occurs at startup. Disabled or unavailable channels retain the P02 fail-closed behavior.
- The frontend has an API session adapter for the `/me` DTO, but the app continues to use its pending session adapter until OTP UI and CSRF handoff are complete.
- Root CSS imports P04's shared stylesheet while P03 keeps structural layout styles.

## Verification record

Checked 14/10/2026 in Asia/Ho_Chi_Minh on Node 24.21.0 / npm 11.19.0:

| Area | Command | Result |
| --- | --- | --- |
| Backend | `npm ci --ignore-scripts` | PASS; 469 packages installed, 0 audit vulnerabilities |
| Backend | `npm run lint` | PASS |
| Backend | `npm test` | PASS; 13 suites / 139 tests, including isolated MongoDB 8.0.34 auth route/session integration |
| Frontend | `npm ci --ignore-scripts` | PASS; 528 packages installed, 0 audit vulnerabilities |
| Frontend | `npm run lint` | PASS |
| Frontend | `npm test` | PASS; 7 suites / 95 tests |
| Frontend | `npm run build` | PASS; Vite production bundle generated |
| Provider delivery | SMTP/eSMS send | NOT RUN; no credentials or approved destination |

The auth runtime integration uses MongoDB Memory Server and a synthetic user/contact with a fake contact-delivery port; it does not call SMTP or eSMS. The first frontend test attempt caught eager API-client construction without a global `fetch`; the adapter now creates the client only when `resolve()` runs, and the final frontend test run passed.

## INTEGRATION_PENDING

- No OTP sign-in or registration UI; P07 registration provisioning and a `REGISTER` verification handler are not part of P34-A.
- No CSRF-token rehydration after a page reload and no frontend logout flow. The API session adapter reads `/me` only; it is not evidence of a complete login journey.
- SMTP credentials, sender verification, eSMS account/Brandname/template approval and an authorized synthetic recipient are unavailable. No live provider send has been performed. Sandbox validation does not establish delivery.
- The SMTP/eSMS adapters have only in-process deduplication. A durable outbox, cross-process deduplication and uncertain-send reconciliation remain separate work.
- P41–P48 and the remaining registration, pet, booking/prepayment, offer, care, partial-cancellation, refund and settlement flows remain outside this mini-gate. Complete the full execution map and rerun P34 before P35; do not label staging or the app complete while those gates remain open.

## Follow-up: public route composition and unpublished-consent gate — 14/10/2026

Base: develop `4530836` at the start of this pass. The original P34 PR #15 was already merged; the screenshot referred to the old feature head, not an unmerged original P34 PR.

- Register merged P07/P16 public pages; P17 Admin service/price/settings and application review routes; Customer address and Sitter availability routes. Admin/Customer/Sitter routes remain behind the existing role-aware session gate. The session adapter, module API mounts and provider/CSRF prerequisites remain their existing explicit integration gates.
- `App({ publicPolicyRouteElements, registrationPolicies })` hosts P45's exported route fragment inside the real router. Default public policy routes are reachable by guests at index/slug/version paths and expose only an unpublished state. PR #29 is not indirectly merged into this branch.
- The default policy source is empty. Customer registration cannot check consent, dispatch OTP or submit until approved/effective/unexpired/unambiguous Terms and Privacy metadata is supplied. Submit independently rechecks time and the version pair actually accepted; changing versions requires consent again. No legal copy, effective date, price or policy approval is invented.
- Readiness metadata is a UI integration projection, not a final server DTO and not proof of a persisted consent receipt. P45 must use its approved source and extend server-side registration validation/receipts before enabling this port in production. The current runtime still fails closed when REGISTER provisioning is not injected.

Verification: frontend lint PASS; 20 suites / 171 tests PASS; build PASS; production dependency audit is recorded in the PR after its run. The new actual-App tests cover guest deep links during unresolved session, replacement of fallback by an injected policy fragment, disabled consent/OTP and forced form submission, guarded role paths, invalid/future/expired/duplicate policy metadata, renewed consent after a version change and policy expiry at forced submission without a source refresh. P07 functional tests explicitly supply synthetic approved metadata; this does not publish a policy. Backend unchanged in this pass; live providers and final end-to-end gates are not rerun or claimed.

Next P45 task: integrate its actual route fragment, approved/versioned policy source and matching consent receipt contract; rereview PR #29 latest head. Source content approval is a real remaining dependency, not a missing GitHub reviewer authorization. P34 needs further passes for later packages and final P35/P36 readiness.
