# P07 / WBS-001 — Customer registration and contact verification

Date: 2026-10-14. Scope: public Customer registration, email or phone OTP verification, and session issuance. The user approved extending P01 REGISTER verification to accept a display name and atomically create a Customer, verified Contact, and session. The P01 wire contract is documented in [the API contract](../api/p01-api-permission-contract-v1.md).

## Delivered

- `frontend/src/pages/public/CustomerRegistrationPage.jsx` and its stylesheet provide the registration form, email/phone choice, OTP input, expiry/resend timers, consent confirmation, validation, pending/error/success states, and session refresh after registration.
- `frontend/src/services/customer-registration-api.js` calls the same-origin P01 OTP endpoints. It normalizes name/contact input, does not retry mutations, and accepts only the authenticated registration response.
- `backend/src/services/customer-registration.service.js` creates an ACTIVE User with the fixed `CUSTOMER` role, an encrypted verified contact, and a 30-day HttpOnly session in the OTP verification transaction.
- P06 OTP verification now requires the REGISTER handler and passes the display name into it. The auth route allowlists registration fields, rejects passwords/role overrides, sets the session cookie, and returns only session metadata plus the CSRF token.
- Integration coverage exercises email and phone registration, invalid/expired/provider-failed OTP, invalid input, duplicate contact, replay, and concurrent submission against an isolated MongoDB replica set.

The screen adapts the supplied PNG and Figma CSS export into responsive layout and styling. The CSS export uses absolute positioning and is treated as a visual reference, not copied as a fixed canvas. No claim is made that the screen is pixel-identical to the reference.

## Checks

Executed in the feature worktree with locked dependencies:

| Command | Result |
| --- | --- |
| `backend/npm ci --ignore-scripts` | Passed; 469 packages installed, 0 audit vulnerabilities |
| `frontend/npm ci` | Passed; 528 packages installed, 0 audit vulnerabilities |
| `frontend/npm run lint` | Passed |
| `frontend/npm test -- --runInBand` | Passed: 9 suites, 106 tests |
| `frontend/npm run build` | Passed with Vite 8.3.4 |
| `backend/npm run lint` | Passed |
| `backend/npm test -- --runInBand` | Passed: 14 suites, 147 tests, including P34-A and P07 integration coverage |

Backend uses MongoDB 8.0.34 in an isolated in-memory replica set for integration tests. The provider port is synthetic in tests; these checks do not prove live email or SMS delivery. Backend JavaScript has no separate build script. Checks were rerun after merging the latest `develop` commit and resolving the P34-A overlaps.

## Integration gates

- P34-A now mounts the auth module when `AUTH_ENABLED=true` and provides the `/me` API adapter. P34 must still add the page to the frontend route tree, inject the P07 REGISTER handler into the runtime OTP service, and connect the cookie-backed session adapter to the app provider. This package leaves `AppRoutes`, backend runtime composition, manifests and shared runtime configuration untouched.
- Runtime must provide the configured contact delivery, contact encryption/lookup keys, OTP secret, session token secret, and CSRF secret from approved runtime configuration. Provider delivery remains pending until P11/P12 are enabled and wired by P34.
- The frontend app currently uses its pending session adapter. P34 must connect `/me` and the registration response to the app's in-memory session/CSRF flow. The registration screen itself does not persist session or CSRF tokens.
- Before production, confirm same-site HTTPS and Secure-cookie behavior, provider acceptance/delivery, session resolution, and route accessibility through the composed runtime.

**State:** implemented and checks passed in isolation; application route/runtime and provider integration remain `INTEGRATION_PENDING`. No live provider send, deployment, PR approval or merge is claimed here.
