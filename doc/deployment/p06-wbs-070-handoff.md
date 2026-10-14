# P06 WBS-070 — OTP Verification handoff

**Work item:** WBS-070, UC-05
**Branch:** `feature/wbs-070-otp-verification`
**Owner/commit author:** Nguyễn Hữu Anh Nhật (`nhat`)
**Reviewer:** Phạm Thành Chung (`chung`)
**Merge owner:** Nguyễn Ngọc Thành (`thanh`)
**Base:** `develop` at `28bf288` when this branch was created.

## Delivered

- Six-digit cryptographically random OTPs, five-minute expiry, 60-second resend cooldown, five sends per rolling hour per keyed contact, five failed attempts followed by a 15-minute contact lock.
- Challenge HMAC binds the code to challenge ID, contact lookup and purpose. A resend invalidates the prior challenge; verification is single-use, purpose-bound and bound to both session and user for contact changes.
- Contact lookup values use keyed HMAC; stored contact values use AES-256-GCM. OTP challenges and rate-limit records expire through TTL cleanup; expiry/lock checks run in application code and do not rely on TTL timing.
- Provider delivery occurs outside Mongo transactions. Only an accepted delivery leaves a usable challenge. Logs contain event/status/provider code only; code, contact and session token are omitted.
- Opaque session tokens are stored only as HMAC digests and issued as HttpOnly/SameSite=Lax cookies. Customer/Pet Sitter sessions last 30 days; Staff/Admin sessions last 12 hours. Every authentication checks expiry, user state and `authEpoch`. CSRF tokens are stored as digests.
- `lockUserAndRevokeSessions` requires an injected authorization decision and transactional audit writer, increments `authEpoch` and revokes the user's sessions atomically with the account lock.
- `authModule` exports `/otp-challenges`, `/otp-verifications`, `/sessions`, contact-change and logout routes as a module factory. P34 still owns registration and runtime/provider composition.

## Checks

Run in `backend/` with the locked package set:

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Passed; 0 reported vulnerabilities |
| `npm run lint` | Passed |
| `npm run test:unit` | Passed, 5 suites / 79 tests |
| `npm run test:integration` | Passed, 2 suites / 18 tests on isolated MongoDB 8.0.34 replica set |

Coverage includes code-digest storage, expiry, resend invalidation, cooldown/hourly limits, five-failure lock and recovery, cross-purpose/session rejection, replay, concurrent first send and concurrent verify, contact replacement, session durations/CSRF/logout/account-lock revocation, generic route DTOs and secret-free logs. The delivery port is controlled in tests; this is not a live email/SMS delivery check.

## Integration gates and open decisions

- P34 must provide `otpSecret`, `lookupSecret`, a 32-byte `encryptionKey`, `tokenSecret`, and `csrfSecret` from a secret store/environment; no key values are committed and `loadConfig`/`.env.example` are not yet wired. All HMAC secrets require at least 32 bytes; the AES key must be exactly 32 bytes.
- P34 must inject the real `contactDelivery` adapter and register `authModule` with `requireSession(sessionService)` and `requireCsrf(sessionService)`. This branch does not merge or rewrite P11/P12 provider branches. The shared delivery port defaults to unavailable, and the HTTP module is not mounted in the P02 runtime.
- P03's API client currently requires a CSRF token for every unsafe request. P34 must support the unauthenticated OTP challenge/session exchange and map the returned in-memory CSRF token/session into the frontend adapter. The existing `/sign-in` page remains a placeholder; no UI or Figma change is claimed.
- `REGISTER` OTP proves contact possession but does not provision a Customer account or create a durable registration grant. P16 must supply that verified-contact handler/flow. Contact-change verification is implemented, but the authorized `/me` profile projection and product audit policy remain feature integration work.
- Account-lock authorization and audit are injected into the lock helper. The feature that exposes an Admin lock-decision route must connect these ports and enforce P01 field/audit policy.
- Deployment still needs a same-site HTTPS decision for the Secure cookie flag and a documented key-rotation/retention procedure. SMS/email accounts and live provider secrets were not used.

**Figma:** not inspected; the sign-in UI is outside this WBS implementation.
**Provider:** `contactDelivery` fake only in tests; live provider integration remains pending P34/P11/P12.
**State:** implementation checks passed; provider/runtime/frontend integration, PR approval and merge are separate states.
