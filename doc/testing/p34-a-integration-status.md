# P34-A integration status

- **Work item:** P34-A, Shared integration and route wiring
- **Branch:** `feature/p34-a-shared-integration-and-route-wiring`
- **Owner / author:** Nguyễn Ngọc Thành (`thanh`, `ngocthanhhx7`)
- **Reviewer:** Nguyễn Hữu Anh Nhật (`nhat`, `anhnhat432`)
- **Final merge owner:** Nguyễn Ngọc Thành (`thanh`, `ngocthanhhx7`)
- **Base:** `develop`
- **Status:** implementation verified; review pending. Mini-gate only, not the final P34 gate.

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
