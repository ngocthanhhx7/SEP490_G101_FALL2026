# Technical Specification — UC-01 Register Account

**Use case:** UC-01 Register Account
**Status:** Draft — contact resend uses synchronous responses (Option A); other product decisions received 2026-10-09.
**Scope:** Backend registration of a Customer using a name and exactly one contact method (email or phone), verified by OTP. This document does not define frontend behavior beyond the API contract.

## 1. Feature Overview

A guest submits a full name and either an email address or a phone number. The backend validates and normalizes the submitted values, checks whether the chosen contact is already used by an account, creates a pending registration, and sends a six-digit OTP through the matching provider. A correct, unused, unexpired latest OTP verifies that contact and activates the Customer account.

No password is collected or stored. A pending registration cannot log in or use Customer functionality. The planned project stack is Node.js/Express and MongoDB/Mongoose; exact runtime and schemas are not established in the repository baseline.

## 2. Business Rules

| ID | Rule |
| --- | --- |
| BR-01 | Registration creates a Customer account only. The client cannot select another role. |
| BR-02 | A full name and exactly one contact method (email or phone) are required. Do not collect or store a password. |
| BR-03 | Email is unique system-wide. Phone is normalized to Vietnam E.164 and is unique system-wide. |
| BR-04 | The selected contact must be verified before the account can log in or access authenticated Customer functionality. |
| BR-05 | OTP is six decimal digits, valid for five minutes, and single-use. Issuing a new OTP invalidates the previous OTP for that registration/contact. |
| BR-06 | A resend is allowed only after at least 60 seconds. At most five successful OTP sends (initial send plus resends) may occur per contact in a rolling 60-minute window. |
| BR-07 | Incorrect OTP attempts are limited per pending registration; reaching the configured maximum blocks further verification for that pending registration. The pending contact remains reserved until its TTL expires. |
| BR-08 | Application logs must not contain the OTP in clear text. |
| BR-09 | Full name is trimmed, contains 2–100 characters, and supports Vietnamese/Unicode letters, spaces, apostrophe, and hyphen. Reject names with no letters or disallowed punctuation. |
| BR-10 | Normalize email by lowercasing the entire address. Do not remove dots or plus aliases. |
| BR-11 | The service operates in Vietnam. Normalize phone numbers to E.164; a phone number is unique system-wide. |
| BR-12 | A contact can have at most one pending registration. A duplicate registration attempt returns `REGISTRATION_PENDING` with guidance to enter the OTP or request resend. Do not create a record or overwrite its full name. Because registration does not collect a password, this prevents unauthorized name changes rather than direct password takeover. |
| BR-13 | Pending data is stored separately; create the Customer only after successful OTP verification. |
| BR-14 | Resend and verify accept either the registration token or normalized contact to identify the pending registration. Both paths use the same synchronous flow and return specific outcomes; resend never returns a registration token. Successful verification creates the account and does not auto-login. |
| BR-15 | OTP verifier uses HMAC-SHA-256 keyed by a server-side secret. Keep OTP records for 24 hours, then remove them using a scheduled cleanup job. OTP itself remains valid for only five minutes from issuance. |
| BR-16 | The five-OTP quota is a rolling 60-minute window, includes the initial send, and is scoped to normalized contact. |
| BR-17 | Resend cooldown starts at OTP `issuedAt`. A failed provider send consumes no contact quota and creates no active OTP. |
| BR-18 | Wrong OTP attempts and successful resends are counted per pending registration. Proposed defaults are 5 wrong attempts and 4 resends. Reaching the wrong-attempt maximum blocks both verify and resend until pending expiry. Resend does not reset the wrong-attempt count. |
| BR-19 | A pending registration expires after the configured TTL (proposed default: 30 minutes from creation). Expiration deletes/releases the pending contact so it can register again. A completed registration record is retained only until the same `expiresAt` to support completion responses by token or contact. |
| BR-20 | Do not send a security alert for UC-01 because this flow has no previously verified contact channel. |
| BR-21 | Reject registration requests from authenticated users with HTTP 403 and code `ALREADY_AUTHENTICATED`. |
| BR-22 | MongoDB transactions are required for OTP consumption, Customer creation, and registration completion; the deployment and test databases must run as replica sets. |
| BR-23 | Use separate per-IP rolling-hour buckets: proposed limits are 20 registration requests, 20 resend requests, and 60 verify requests per IP. These are separate buckets so OTP retries do not consume registration/resend capacity; confirm thresholds before implementation. |
| BR-24 | Mask email as first local-part character plus `**` and full domain (`a**@example.com`); mask Vietnamese phone as first three digits, `****`, and last three digits (`090****567`). |
| BR-25 | Contact enumeration through `CONTACT_ALREADY_USED`, `REGISTRATION_PENDING`, contact-based resend, and contact-based verify is an intentional UX tradeoff for this project. These paths return specific outcomes so users can continue registration or go to Login; this feature does not promise resistance to contact discovery. |
| POST-01 | Successful verification marks the selected contact verified and the Customer account active. |
| POST-02 | Before verification, the registration remains pending; it is not an active/login-capable Customer account. |
| POST-03 | Validation, provider, OTP, or persistence failure must not be reported as successful registration. |

**OTP delivery events:**

- Initial registration: send one OTP using Email Service for email, or SMS Gateway for phone.
- Resend by registration token: after cooldown and quota checks, send through the same channel and return delivery outcome to the token holder. Keep the old active OTP valid until provider acceptance; then invalidate it.
- Resend by contact: find the pending registration by contact, check cooldown, quota, and limits, send through the selected channel, and return the result synchronously (including `maskedDestination` on success). Do not return a token.
- Security alert: none for UC-01. Registration has no previously verified contact channel.

**Limits and timing:**

- OTP lifetime: 5 minutes from issuance.
- Resend cooldown: at least 60 seconds since the current active OTP's `issuedAt`.
- Send quota: maximum 5 successful OTP sends per normalized contact in the rolling 60 minutes, including initial registration. Failed provider sends do not consume the contact quota.
- IP quotas: proposed separate rolling 60-minute buckets per IP: 20 registration requests, 20 resend requests, and 60 verify requests. Confirm thresholds before implementation.
- Wrong-code limit: proposed maximum of 5 attempts per pending registration. Reaching the limit blocks both verification and resend until that registration expires.
- Resend limit: proposed maximum of 4 successful resends per pending registration, in addition to the five-successful-sends-per-contact rolling-hour quota (initial send plus four resends).
- OTP persistence: OTP expires for verification after 5 minutes; retain its record up to 24 hours, then remove it via scheduled cleanup. Proposed pending-registration TTL is 30 minutes from creation, pending confirmation.
- Contact send quota and cooldown are keyed by normalized contact. Wrong-attempt and resend counts are keyed by pending registration. A contact cannot create a second pending registration before the first expires.
- OTP must be invalidated when replaced, used, or expired. Expiration may be evaluated from `expiresAt` on request; a background cleanup job is not required for expiry enforcement.

### State machine

| Current state | Event / guard | Next state | Effect |
| --- | --- | --- | --- |
| No pending registration | Valid registration; contact unused; send allowed | `PENDING_VERIFICATION` | Create pending record and issue OTP. |
| `PENDING_VERIFICATION` | Wrong OTP below configured maximum | `PENDING_VERIFICATION` | Atomically increment this pending registration's wrong-attempt count. |
| `PENDING_VERIFICATION` | Wrong OTP reaches maximum (proposed: 5) | `PENDING_VERIFICATION` with verification blocked | Reject further verify and resend attempts for this pending record until it expires. |
| `PENDING_VERIFICATION` | Resend allowed; provider accepts | `PENDING_VERIFICATION` | Activate replacement OTP and invalidate prior OTP. First successful issue sets `initialOtpIssuedAt`; later successful replacements increment `resendCount`. |
| `PENDING_VERIFICATION` | Provider rejects OTP delivery | `PENDING_VERIFICATION` | No active replacement OTP; do not consume send quota; preserve prior active OTP. |
| `PENDING_VERIFICATION` | Correct, latest, unexpired OTP; attempts not exhausted | `COMPLETED` | Consume OTP, create active Customer, and confirm selected contact atomically. |
| `PENDING_VERIFICATION` | Configured pending TTL reached (proposed: 30 minutes) | Deleted | Scheduled cleanup removes pending registration and releases the unique contact constraint. |
| `COMPLETED` | Repeated verify or resend by token or contact before `expiresAt` | `COMPLETED` | Do not create, activate, or send again; return `REGISTRATION_COMPLETED`. The record is deleted at `expiresAt`; after deletion token or contact lookup returns `REGISTRATION_NOT_FOUND`. |

OTP is valid only when `now < expiresAt`; at `now >= expiresAt` it is expired. E5 cases (expired/used/superseded) are distinct from E4 wrong-code attempts and do not increment the pending-registration counter.

## 3. Validation Rules

| Input / condition | Validation and result |
| --- | --- |
| `fullName` | Require a string, trim leading/trailing whitespace, then require 2–100 characters. Allow Unicode letters/marks, spaces, apostrophe (`'`), and hyphen (`-`); require at least one letter. Reject digits and any other punctuation/symbols. This accepts Vietnamese names and names such as `O'Connor`. |
| JSON field types | Require primitive strings for `fullName`, selected contact, and `otp`; reject arrays/objects before any database query. Never pass client-supplied objects/operators into MongoDB filters. |
| Contact selection | Registration requires exactly one of `email` or `phone`. Resend/verify require exactly one identity mode: registration token or (`contactType` + `contact`). Reject missing or mixed identity modes. |
| Email | Required when email is selected; validate email syntax and lowercase the entire address before lookup/persistence. Preserve dots and plus aliases as supplied. |
| Phone | Required when phone is selected; accept Vietnam phone numbers and normalize to E.164 (`0901234567` → `+84901234567`) before lookup/persistence. |
| Contact uniqueness | Email and phone are each unique system-wide. Check active accounts before creating/sending. If a pending registration already exists, return `REGISTRATION_PENDING`; do not create/overwrite it. Contact-based resend uses the same synchronous flow as token-based resend. Database indexes prevent concurrent duplicates. |
| `otp` | Required for verification; exactly six decimal digits. Compare only against the latest active code for the registration. Reject wrong, expired, consumed, or superseded codes. |
| Resend | Accept exactly one identifier: registration token or typed contact (`contactType` + `contact`). For a found pending registration, enforce 60-second cooldown, contact rolling quota, per-pending resend limit, and `verificationBlocked`. Contact-based resend never returns a token and returns specific outcomes synchronously. |
| Verify | Accept either registration token plus OTP or typed contact (`contactType` + `contact`) plus OTP. Resolve only the single pending registration matching that contact and verify only its newest active OTP. |
| Account state | Pending registrations cannot authenticate or use Customer-only functionality. Verification must be an atomic state transition so an OTP cannot activate more than once. |
| Authenticated caller | Reject registration with HTTP 403 and `ALREADY_AUTHENTICATED`. |
| IP limit | Use separate per-endpoint rolling windows: proposed 20 register, 20 resend, and 60 verify requests per IP per hour. Register, resend, and verify return `IP_RATE_LIMITED` when their respective bucket is exceeded, whether identified by token or contact. |

## 4. Database Design

The following is a logical model, not a committed schema. MongoDB/Mongoose is the planned database. Proposed lifecycle: store unverified data in a separate pending-registration entity; create the Customer only after successful OTP verification. This avoids exposing a pending record as an account that could authenticate.

### `customers` (or the project's shared `users` collection)

| Field | Type / constraint | Purpose |
| --- | --- | --- |
| `_id` | ObjectId / primary key | Customer identifier |
| `fullName` | string, required | Submitted name |
| `email` | string, nullable | Normalized email when email is the selected contact |
| `phone` | string, nullable | Normalized E.164 phone when phone is selected |
| `emailVerifiedAt` | date, nullable | Email verification timestamp, if applicable |
| `phoneVerifiedAt` | date, nullable | Phone verification timestamp, if applicable |
| `roleId` | ObjectId, reference to `roles` | Set server-side to the ObjectId of the `CUSTOMER` role; never accepted from client input |
| `status` | enum | `ACTIVE`; Customer record is created only after contact verification |
| `createdAt`, `updatedAt` | dates | Audit timestamps |

Create unique partial indexes for normalized email and phone. Both are unique system-wide. Nullable/absent fields must not collide for accounts using the other contact method. Do not store a password field for this flow.

### `pending_registrations`

| Field | Type / constraint | Purpose |
| --- | --- | --- |
| `_id` | ObjectId / primary key | Pending registration identifier |
| `fullName` | string, required | Name submitted by guest |
| `contactType` | enum `email` or `phone` | Selected channel; immutable after creation |
| `contactValue` | normalized string, required | Email or international phone; immutable after creation |
| `status` | enum `PENDING_VERIFICATION`, `COMPLETED` | Registration lifecycle; expiration is determined by `expiresAt` and the document is then deleted |
| `contactStateId` | reference | Shared send quota/cooldown state for this normalized contact |
| `registrationTokenHash` | unique string | **SHA-256** hex digest of a random client-held bearer token (at least 128 bits of entropy); raw token is returned once and never stored |
| `wrongOtpAttempts` | integer | Wrong OTP attempts for this pending registration only |
| `initialOtpIssuedAt` | date, nullable | First provider-accepted OTP issue for this pending registration; remains null if the initial provider send failed |
| `resendCount` | integer | Successful replacements after the first provider-accepted OTP for this pending registration only |
| `verificationBlocked` | boolean | True after the per-pending wrong-attempt maximum is reached; remains true until pending record expires |
| `customerId` | reference, nullable | Set when Customer is created after verification |
| `expiresAt` | date | Configured TTL from creation (proposed default: 30 minutes); pending record is deleted at expiry. A completed record is retained only until this same timestamp to support stable completion responses by token or contact |
| `createdAt`, `updatedAt` | dates | Audit timestamps |

### `contact_verification_states`

One record per normalized contact. A keyed digest can be used as the lookup key if storing raw contact keys is not required. This is the source of truth for controls that must survive new registration attempts.

| Field | Type / constraint | Purpose |
| --- | --- | --- |
| `_id` | ObjectId / primary key | State identifier |
| `contactKey` | unique string | Stable key derived from normalized contact |
| `lastOtpSentAt` | date, nullable | **Denormalized** cooldown anchor; always set to `max(otpSendTimestamps)` in the same atomic update. Kept for efficient cooldown checks without array traversal. |
| `otpSendTimestamps` | dates array | Contact-scoped successful OTP send timestamps; retain enough history to evaluate rolling 60-minute quota. Updated atomically with `lastOtpSentAt`. |
| `sendReservation` | token/expiry, nullable | Prevent concurrent sends passing cooldown/quota while provider result is pending; commit quota only on provider acceptance, release on failure |
| `sendReservationExpiresAt` | date, nullable | Reservation auto-expires (recommended: 30 seconds from issuance) so a backend crash during provider call cannot permanently block quota. Any request finding an expired reservation may proceed as if none exists. |
| `revision` | integer | Compare-and-set version for serialized state transitions |
| `updatedAt` | date | Audit timestamp |

### `registration_otps`

| Field | Type / constraint | Purpose |
| --- | --- | --- |
| `_id` | ObjectId / primary key | OTP record identifier |
| `registrationId` | reference, required | Related pending registration |
| `codeVerifier` | string, required | HMAC-SHA-256 over OTP and registration context using a server-side secret; never store/log raw OTP |
| `status` | enum `DELIVERY_PENDING`, `ACTIVE`, `CONSUMED`, `INVALIDATED` | Only a provider-accepted (`ACTIVE`) OTP is verifiable. An OTP in `DELIVERY_PENDING` cannot be submitted for verification; this window is bounded by provider response time and is not user-visible in the normal flow. |
| `issuedAt`, `expiresAt` | dates | Validity window; `expiresAt = issuedAt + 5 minutes` |
| `deleteAt` | date | 24 hours after creation; scheduled cleanup removes record |
| `createdAt` | date | Audit timestamp |

Only one active OTP per pending registration/contact is allowed. Enforce this with a partial unique index on `registrationId` where `status = ACTIVE` (or an equivalent atomic active-OTP pointer). Generate/store a `DELIVERY_PENDING` record, then mark it `ACTIVE` and invalidate the previous active OTP only after provider acceptance. On provider failure, remove the new record and release its send reservation; do not count quota or invalidate the old active OTP. Use HMAC-SHA-256 keyed by a server-side secret rather than an unkeyed digest, and compare verifier values in constant time. Do not log OTP or HMAC secret. Keep records for 24 hours and run scheduled cleanup.

### `registration_ip_rate_limits`

Shared rate-limit records keyed by both a SHA-256 hash of the normalized client IP and endpoint bucket (`REGISTER`, `RESEND`, or `VERIFY`). Use atomic updates so multiple backend instances cannot exceed each endpoint's limit. Do not retain raw IP values longer than operationally required.

| Field | Type / constraint | Purpose |
| --- | --- | --- |
| `_id` | ObjectId / primary key | Identifier |
| `ipHash` | string | SHA-256 hex digest of normalized client IP |
| `endpoint` | enum `REGISTER`, `RESEND`, `VERIFY` | Separates counters so traffic to one endpoint does not consume another endpoint's quota |
| `bucketKey` | unique string | Stable key derived from `ipHash` + `endpoint` |
| `requestTimestamps` | dates array | Timestamps for this endpoint bucket in the rolling 60-minute window |
| `updatedAt` | date | Audit timestamp |

Add a TTL index on `updatedAt` to automatically remove stale bucket records when no request has arrived for more than one hour. Add a unique index on `bucketKey`. Prune timestamps older than 60 minutes during each atomic update rather than relying solely on the TTL job. Proposed limits are 20 requests/hour for each of `REGISTER` and `RESEND`, and 60 requests/hour for `VERIFY`.

### `registration_events` (audit)

Append-only operational events for registration creation, provider send result, incorrect OTP, attempt-limit reached, successful verification, and persistence failure where recording is possible. Suggested fields: `eventType`, `registrationId`, masked or keyed contact reference, timestamp, `correlationId`, and safe outcome metadata. Never include OTP, raw secret, or unnecessary full contact data.

**Persistence constraints:**

- Enforce uniqueness for active account contacts at database level to handle concurrent registration requests.
- Add a unique partial index on normalized contact for records with status `PENDING_VERIFICATION`, so only one pending record can exist for a contact. If one exists, do not mutate its name or create another; return `REGISTRATION_PENDING` with guidance to enter the OTP or request resend. The distinct response is an intentional contact-enumeration tradeoff for this project.
- Add a non-partial lookup index on `{ contactType, contactValue }` across all pending-registration statuses. Contact-based verify/resend must find a retained `COMPLETED` record and return `REGISTRATION_COMPLETED` until `expiresAt`; the separate unique partial index above continues to enforce at most one `PENDING_VERIFICATION` record per contact.
- Expire pending registrations when their configured TTL elapses (proposed default: 30 minutes from creation) and remove the record so the contact becomes available again. Prefer a TTL index on `expiresAt`; TTL deletion is asynchronous, so application checks must treat `expiresAt <= now` as expired immediately and atomically remove/expire it before accepting a new registration.
- Enforce uniqueness for active OTPs with a partial unique index on `registrationId` where `status = ACTIVE`, or an equivalent atomic active-OTP pointer.
- Claim contact quota/cooldown with conditional atomic updates against `contact_verification_states`; do not use read-then-write checks that concurrent requests can both pass. Reserve a send slot during provider delivery; commit the send timestamp only on provider acceptance and release reservation on failure. Rely on `sendReservationExpiresAt` to recover from backend crashes.
- Claim per-pending resend and wrong-OTP counts with conditional atomic updates so parallel calls cannot exceed configured maximums. Once the wrong-attempt maximum is reached, block both verify and resend until pending expiry. Resend does not reset wrong-attempt count. If the initial provider send failed, the first later successful delivery sets `initialOtpIssuedAt` and counts against contact quota, but does not consume one of the four successful resends.
- Use a rolling 60-minute ledger of successful sends; initial send counts. A failed provider send does not count. Cooldown is measured from successful OTP `issuedAt`. Keep `lastOtpSentAt` synchronized with `max(otpSendTimestamps)` in the same atomic operation.
- Ensure verification consumes the active OTP, changes pending state, and creates the Customer exactly once in the same MongoDB transaction. Wrong-attempt counts are per pending registration; there is no contact-scoped attempt counter to reset. MongoDB replica set is mandatory for all environments that run this flow.
- Do not persist an active/verified Customer if OTP verification or the activation write fails.
- Add scheduled cleanup for OTP records older than 24 hours. Pending registrations use the configured TTL (proposed default: 30 minutes); TTL index deletion is asynchronous, with application-side expiry checks.
- Enforce separate per-IP rolling-hour buckets using a shared atomic rate limiter: proposed limits are 20 registration, 20 resend, and 60 verify requests per IP.
- Define indexes for: normalized contact lookup on customers, unique partial normalized contact on pending registrations in `PENDING_VERIFICATION`, non-partial `{ contactType, contactValue }` lookup across pending-registration statuses, unique registration-token hash, OTP lookup and active-OTP uniqueness, contact send-rate windows, and unique IP+endpoint bucket key.

## 5. API Design

Proposed REST endpoints under `/api/v1/auth/register`. All endpoints must be HTTPS in deployed environments. The optional registration token is a cryptographically random opaque token with at least 128 bits of entropy; store only its SHA-256 hash and do not use a guessable database ObjectId as a bearer credential. Never include the token in URL paths, query strings, or logs; pass it in the `Authorization` header only.

### `POST /api/v1/auth/register`

Create a pending registration and request the initial OTP.

Email request:

```json
{
  "fullName": "Nguyen Van A",
  "email": "a@example.com"
}
```

Phone request:

```json
{
  "fullName": "Nguyen Van A",
  "phone": "+84901234567"
}
```

Success response (`201 Created`) is returned after provider acceptance:

```json
{
  "registrationToken": "<random-opaque-token>",
  "contactType": "email",
  "maskedDestination": "a**@example.com",
  "message": "OTP sent"
}
```

Do not return an OTP or create an active Customer at this point. Return the token only at creation; subsequent calls present it as a bearer credential in the `Authorization: Bearer <token>` header, never in logs or URL. A separate database `registrationId` remains internal.

If the normalized contact already has a pending registration, return `409 Conflict` with `REGISTRATION_PENDING` and guidance such as “Enter the code already sent or request a new code.” Do not create a new record, change its name, or return a token. The guest can use the contact-based resend flow without a registration token. The distinct `CONTACT_ALREADY_USED` and `REGISTRATION_PENDING` responses intentionally disclose that the contact is associated with an account or pending registration; this tradeoff is accepted for clearer project UX.

### `POST /api/v1/auth/register/verify`

Verify the most recently issued OTP and activate the account. Accept either (a) `Authorization: Bearer <registrationToken>` plus OTP, or (b) exactly one contact field plus OTP. Contact-based verification resolves the single unexpired pending registration for that normalized contact.

Request body:

```json
{ "otp": "012345" }
```

For contact-based verification, include:

```json
{ "contactType": "email", "contact": "a@example.com", "otp": "012345" }
```

Success response (`200 OK`):

```json
{
  "status": "ACTIVE",
  "message": "Registration successful",
  "nextAction": "LOGIN"
}
```

The Use Case offers the user a Login choice; it does not say to issue a login session or token, so this endpoint must not implicitly log the user in without a separate decision.

### `POST /api/v1/auth/register/resend`

Request a replacement OTP using either the registration token in the `Authorization` header or a typed contact (`contactType` + `contact`) in the body. Both modes check the same pending registration, cooldown, contact send quota, per-pending resend limit, and `verificationBlocked` state. Keep the existing active OTP valid until the provider accepts its replacement. Never return a registration token.

Contact-based resend request:

```json
{ "contactType": "email", "contact": "a@example.com" }
```

Process both token and contact requests synchronously in the request handler, including provider delivery. On accepted delivery, return `200 OK` with `contactType`, `maskedDestination`, and a success message. Return specific errors: `REGISTRATION_NOT_FOUND`, `OTP_RESEND_TOO_SOON` (with `retryAfterSeconds`), `OTP_RATE_LIMITED`, `PENDING_RESEND_LIMIT_REACHED`, `PENDING_OTP_ATTEMPTS_EXHAUSTED`, `IP_RATE_LIMITED`, or `OTP_DELIVERY_FAILED`. Never return a registration token.

Example success:

```json
{
  "contactType": "email",
  "maskedDestination": "a**@example.com",
  "message": "A new OTP has been sent."
}
```

Neither resend path returns a registration token.

### Suggested response conventions

Use a consistent error envelope:

```json
{
  "error": {
    "code": "OTP_EXPIRED",
    "message": "OTP expired. Request a new code."
  }
}
```

For rate-limit errors, include `retryAfterSeconds` to allow the client to display a countdown:

```json
{
  "error": {
    "code": "OTP_RESEND_TOO_SOON",
    "message": "Please wait before requesting a new OTP.",
    "retryAfterSeconds": 47
  }
}
```

Error code and HTTP mapping for this feature:

| Condition | HTTP | Code | Notes |
| --- | --- | --- | --- |
| Invalid/missing fields | 400 | `VALIDATION_ERROR` | Include field-level details |
| Caller is authenticated | 403 | `ALREADY_AUTHENTICATED` | |
| Contact already belongs to an active account | 409 | `CONTACT_ALREADY_USED` | Include `suggestedAction: "LOGIN"` |
| Contact has a pending registration (duplicate create request) | 409 | `REGISTRATION_PENDING` | Include guidance to enter OTP or request resend; do not disclose token |
| OTP resend cooldown not elapsed | 429 | `OTP_RESEND_TOO_SOON` | Resend by token or contact; include `retryAfterSeconds` |
| Contact OTP quota exceeded | 429 | `OTP_RATE_LIMITED` | Register or resend by token or contact; include `retryAfterSeconds` until the oldest successful send exits the rolling 60-minute window |
| Per-pending resend maximum reached | 429 | `PENDING_RESEND_LIMIT_REACHED` | Resend by token or contact |
| Wrong-OTP maximum reached | 429 | `PENDING_OTP_ATTEMPTS_EXHAUSTED` | Verify or resend by token or contact; blocks verify and resend until pending TTL expires |
| IP quota exceeded | 429 | `IP_RATE_LIMITED` | Register, resend, or verify according to its endpoint bucket |
| OTP is wrong (E4) | 400 | `OTP_INVALID` | Verify by token or contact |
| OTP expired, used, or superseded (E5) | 400 | `OTP_NOT_VALID` | Verify by token or contact; does not increment wrong-attempt count |
| Registration token unknown or expired | 404 | `REGISTRATION_NOT_FOUND` | Same response for unknown and expired token; no persisted `EXPIRED` status is needed |
| OTP provider definitively failed | 502 | `OTP_DELIVERY_FAILED` | Resend by token or contact |
| Contact has no pending registration (resend or verify) | 404 | `REGISTRATION_NOT_FOUND` | Contact-based lookup |
| Persistence/internal failure | 500 | `INTERNAL_ERROR` | Do not expose internal details |
| Verify repeated after successful completion (before `expiresAt`) | 409 | `REGISTRATION_COMPLETED` | Include `status: "COMPLETED"`; after TTL deletion the token returns `REGISTRATION_NOT_FOUND` |
| Resend after successful completion (before `expiresAt`) | 409 | `REGISTRATION_COMPLETED` | Do not send another OTP; after TTL deletion the token or contact returns `REGISTRATION_NOT_FOUND` |

The API must keep messages safe and stable; frontend maps codes to localized Vietnamese text. Error responses must not disclose registration tokens or unnecessary full contact details. Contact-based resend and verify return specific outcomes, so their existence and completion errors can reveal registration state; this is an intentional project tradeoff documented in BR-25. Apply the appropriate per-endpoint IP bucket before processing. Malformed input may return `400 VALIDATION_ERROR`.

Example `CONTACT_ALREADY_USED` response:

```json
{
  "error": {
    "code": "CONTACT_ALREADY_USED",
    "message": "This contact is already registered.",
    "suggestedAction": "LOGIN"
  }
}
```

## 6. Backend Flow

### Initial registration

1. Reject authenticated callers with `403 ALREADY_AUTHENTICATED`.
2. Apply the `REGISTER` IP bucket (proposed: 20 requests per IP per rolling hour). Reject over-limit requests before creating registration or sending OTP.
3. Validate required fields and types; trim/validate name. Normalize the selected email to lowercase or phone to Vietnam E.164.
4. Check normalized contact against active accounts; if used, return `409 CONTACT_ALREADY_USED` without sending OTP.
5. If a pending registration already exists for the contact, return `409 REGISTRATION_PENDING` with guidance to enter the sent OTP or request resend; do not create/modify it or send another OTP. Contact-based resend does not require the existing token.
6. Read contact verification state. Enforce cooldown and rolling 60-minute successful-send quota. If the contact send quota is exhausted, return `429 OTP_RATE_LIMITED` with `retryAfterSeconds` equal to the time until the oldest successful send exits the rolling 60-minute window. Atomically reserve a send slot (setting `sendReservation` and `sendReservationExpiresAt`) so concurrent registration/resend requests cannot exceed the limits.
7. Create pending registration and token, generate a cryptographically secure six-digit decimal OTP (preserve leading zeroes), store an HMAC-SHA-256 verifier with status `DELIVERY_PENDING`, and call the matching provider with a bounded timeout.
8. On provider acceptance: atomically activate the new OTP (set status to `ACTIVE`), set `initialOtpIssuedAt`, invalidate the prior active OTP if applicable, append `issuedAt` to the send ledger and update `lastOtpSentAt`, and release the send reservation. Return `201 Created` with opaque registration token and masked destination.
9. On definitive provider failure or ambiguous timeout: delete the new `DELIVERY_PENDING` OTP, release the send reservation (clear `sendReservation` and `sendReservationExpiresAt`), do not invalidate any existing active OTP, and return `502 OTP_DELIVERY_FAILED`. Do not consume contact quota. Keep the pending registration (without an active OTP) until its configured TTL (proposed: 30 minutes) so the guest can recover through contact-based resend even if no registration token was returned. Do not blindly retry; treat an ambiguous timeout as a failure for this request.

### Verify OTP

1. Apply the `VERIFY` IP bucket (proposed: 60 requests per IP per rolling hour). Over-limit requests return `429 IP_RATE_LIMITED` for both token and contact paths; do not process the code.
2. Resolve the registration from either the SHA-256 hash of the bearer token or exactly one typed normalized contact from the payload; reject if both or neither identifier forms are supplied. If contact lookup finds no pending record, return `404 REGISTRATION_NOT_FOUND`. If the registration is completed and retained before `expiresAt`, return `409 REGISTRATION_COMPLETED`. An expired/deleted registration returns `404 REGISTRATION_NOT_FOUND`.
3. Enforce the per-pending wrong-attempt maximum. If exhausted, reject verification until that pending record expires with `429 PENDING_OTP_ATTEMPTS_EXHAUSTED`. This does not create a contact-wide counter or lock.
4. Load the newest active OTP (status `ACTIVE`). If no active OTP exists, or it is expired, consumed, or superseded, return `400 OTP_NOT_VALID` (E5). E5 rejections do not increment the wrong-attempt counter. Direct the guest to request a replacement, subject to resend limits.
5. Compare submitted value to the HMAC-SHA-256 verifier using a constant-time comparison. Use one consistent server/database time source for expiry and cooldown comparisons.
6. If wrong (E4): atomically increment this pending registration's wrong-attempt counter using a conditional update and set `verificationBlocked` when the configured maximum is reached. Concurrent requests must not exceed `MAX_WRONG_OTP_ATTEMPTS_PER_PENDING`. No contact-wide lock is created. Both token-based and contact-based verification return `400 OTP_INVALID` below the maximum.
7. If correct: in a single MongoDB transaction, conditionally consume the active OTP (set status to `CONSUMED`), transition pending registration to `COMPLETED`, and create the Customer with role `CUSTOMER` and status `ACTIVE`. A repeated or concurrent verification request cannot consume the same OTP or create another Customer. Keep the completed pending record only until its original `expiresAt`; token retries before then return `REGISTRATION_COMPLETED`, while retries after TTL deletion return `REGISTRATION_NOT_FOUND`.
8. Return registration success and indicate Login as the next action. Do not issue a session unless the project explicitly decides that registration also logs the user in.

### Resend OTP

1. Apply the `RESEND` IP bucket (proposed: 20 requests per IP per rolling hour). If exceeded, return `429 IP_RATE_LIMITED`.
2. Resolve the registration by token hash or normalized contact. If no record exists, or it is expired/deleted, return `404 REGISTRATION_NOT_FOUND`. If its status is `COMPLETED` and the record is retained before `expiresAt`, return `409 REGISTRATION_COMPLETED` without sending another OTP.
3. Reject with the corresponding specific error if `verificationBlocked` is true (`PENDING_OTP_ATTEMPTS_EXHAUSTED`), the per-pending resend maximum is reached (`PENDING_RESEND_LIMIT_REACHED`), cooldown has not elapsed (`OTP_RESEND_TOO_SOON` with `retryAfterSeconds`), or contact quota is exhausted (`OTP_RATE_LIMITED`). Reaching the wrong-attempt maximum blocks both verify and resend until pending expiry.
4. Atomically reserve a contact send slot, generate a replacement OTP, and send it through the original channel. Keep the previous active OTP valid until provider acceptance.
5. On provider acceptance: activate the new OTP, invalidate the previous active OTP, append `issuedAt` to the rolling send ledger, update `lastOtpSentAt`, and release the reservation. If `initialOtpIssuedAt` is null because the first provider send failed, set it now and do not increment `resendCount`; this is the first successful OTP issue for the pending registration. Otherwise increment `resendCount`. The successful send counts toward the contact quota in either case. Return `200 OK` with `contactType`, `maskedDestination`, and a success message.
6. On provider failure or ambiguous timeout: remove the `DELIVERY_PENDING` OTP, release the reservation, preserve the old active OTP, and do not consume quota or increment `resendCount`. Return `502 OTP_DELIVERY_FAILED`.
7. Record a safe audit outcome. Never include OTP, token, or unnecessary full contact data in logs.

### Guest returns later (A2)

The client may retain the opaque registration token issued at creation and use it for verify/resend. If the token is lost or unavailable, the guest can resend using contact and verify using contact plus OTP. The token must never appear in URL paths, query strings, or logs.

## 7. Error Handling

| Case | Expected behavior |
| --- | --- |
| Missing name/contact or malformed value | Field-specific `400 VALIDATION_ERROR`; no pending registration and no OTP send. |
| Email/phone already used by active account | `409 CONTACT_ALREADY_USED`; no duplicate account and no OTP send; include `suggestedAction: "LOGIN"`. |
| Email/SMS provider failure or ambiguous timeout | Registration and resend (token or contact) return `502 OTP_DELIVERY_FAILED`; no active replacement OTP, quota use, or invalidation of a prior active OTP. |
| Wrong OTP below per-pending maximum | Verify by token or contact: `400 OTP_INVALID`. Atomically increment this pending registration's `wrongOtpAttempts`. |
| Per-pending wrong-OTP maximum reached | Verify or resend (token or contact): `429 PENDING_OTP_ATTEMPTS_EXHAUSTED`. Both verify and resend are blocked until pending expiry. |
| Expired, used, or superseded OTP (E5) | Verify by token or contact: `400 OTP_NOT_VALID`; do not increment wrong-attempt counter. |
| Resend before 60 seconds | Resend by token or contact: `429 OTP_RESEND_TOO_SOON` with `retryAfterSeconds`. |
| Contact OTP quota exhausted | Register or resend by token or contact: `429 OTP_RATE_LIMITED` with `retryAfterSeconds` until the oldest successful send exits the rolling 60-minute window. |
| IP quota exceeded | Per-endpoint buckets: register (20/hour), resend (20/hour), verify (60/hour), per IP. Exceeded bucket returns `429 IP_RATE_LIMITED` for register, resend, or verify. |
| Existing pending registration on create | `409 REGISTRATION_PENDING` with guidance to enter OTP or request resend; do not create/modify pending data or disclose token. The state disclosure is intentional for this project. |
| Authenticated caller | `403 ALREADY_AUTHENTICATED`. |
| Unknown or expired registration token | `404 REGISTRATION_NOT_FOUND`; expired pending records are deleted, so there is no persisted `EXPIRED` status. |
| Persistence failure on create or verify | Do not claim success. Record diagnostic details safely and return `500 INTERNAL_ERROR`. Do not log OTP or secrets. |
| Concurrent duplicate registration / resend / verification | Contact-scoped send claims, per-pending counter updates, unique indexes, and MongoDB transactions must prevent bypassing limits, multiple active OTPs, duplicate active accounts, or multiple OTP consumption. Return a controlled conflict/retry response. |
| Non-string or object-shaped input | `400 VALIDATION_ERROR`; reject schema/type mismatch before database query construction. Do not pass client objects/operators into MongoDB filters. |
| Resend by token or contact | Process synchronously; return `200` with `contactType`, `maskedDestination`, and message on accepted delivery. Return specific errors for missing registration, cooldown/quota/attempt/IP limits, and provider failure. Never return a token. |
| Per-pending resend maximum reached | Resend by token or contact returns `429 PENDING_RESEND_LIMIT_REACHED`. |

Error responses must not contain OTP values, stack traces, secrets, or provider credentials. Avoid logging full contact details where they are not needed; BR-08 expressly prohibits clear-text OTP logging.

For contact-based verify, use the same specific error codes as token-based verify: `REGISTRATION_NOT_FOUND`, `OTP_INVALID`, `OTP_NOT_VALID`, `PENDING_OTP_ATTEMPTS_EXHAUSTED`, `REGISTRATION_COMPLETED`, and `IP_RATE_LIMITED`, as applicable.

**Known tradeoffs:** The API intentionally distinguishes `CONTACT_ALREADY_USED`, `REGISTRATION_PENDING`, and contact-based resend/verify outcomes to support the registration UX. A caller can discover whether a contact has an account or pending registration and whether verification is complete or blocked. A caller who knows a contact can consume its per-pending wrong-attempt limit and block verification and resend until TTL expiry; before that point, an attacker may exhaust the resend quota and temporarily prevent the owner from receiving another OTP. These contact-based denial-of-service and enumeration risks are accepted for this project and are bounded by the pending TTL and IP/contact send limits. An ambiguous provider timeout may mean the OTP was delivered even though the backend treats the attempt as failed, deletes its verifier, and returns `OTP_DELIVERY_FAILED`; that code will not verify, so the user must request a replacement.

## 8. Acceptance Criteria

1. Given a guest submits a valid name and email only, when registration succeeds, then a pending Customer registration is created and one six-digit OTP is sent through Email Service.
2. Given a guest submits a valid name and phone only, when registration succeeds, then a pending Customer registration is created and one six-digit OTP is sent through SMS Gateway.
3. Given both or neither contact fields are supplied, when registration is submitted, then field validation fails and no registration/OTP is created/sent.
4. Given required input is missing or malformed, when registration is submitted, then the response identifies the field to fix and no pending registration is created.
5. Given the normalized contact is already used by an active account, when registration is submitted, then no duplicate account is created and no OTP is sent; the response returns `CONTACT_ALREADY_USED` with `suggestedAction: "LOGIN"`.
6. Given a pending registration with a valid latest OTP, when the guest submits it within five minutes, then the OTP is consumed once, the selected contact is confirmed, the Customer becomes active, and success with a Login option is returned.
7. Given verification is submitted by token or contact, then a wrong code returns `400 OTP_INVALID`; an expired, used, or superseded code returns `400 OTP_NOT_VALID`; an exhausted attempt limit returns `429 PENDING_OTP_ATTEMPTS_EXHAUSTED`; no pending registration returns `404 REGISTRATION_NOT_FOUND`; and a completed registration returns `409 REGISTRATION_COMPLETED` while its record is retained. No failure activates an account.
8. Given the guest requests resend before 60 seconds have elapsed since the latest successful OTP `issuedAt`, then no new OTP is sent and resend by token or contact returns `429 OTP_RESEND_TOO_SOON` with `retryAfterSeconds`.
9. Given five OTPs have already been successfully sent in the rolling 60-minute window for the contact, when another resend is requested, then no OTP is sent and resend by token or contact returns `429 OTP_RATE_LIMITED`.
10. Given resend is allowed and the provider accepts the replacement OTP, then the new OTP becomes active, the prior OTP is invalidated, and the new code is delivered through the same channel. If the provider rejects delivery, the prior active OTP remains valid and no contact quota or per-pending resend count is consumed.
11. Given the provider rejects an OTP send, when registration or resend by token/contact is attempted, then the response is `502 OTP_DELIVERY_FAILED`. No new active OTP or send quota entry is created, and any previous active OTP remains valid.
12. Given the maximum wrong-OTP attempts for a pending registration is reached, then both verify and resend are blocked for that pending registration until its configured TTL expires (proposed: 30 minutes); a different contact registration is unaffected. This creates a known temporary lockout risk for an attacker who knows the contact.
13. Given the pending TTL expires, then the pending registration is removed and its contact can start a new registration, subject to contact/IP send limits.
14. Given an OTP is issued, when application logs are inspected, then the clear-text OTP is absent.
15. Given a guest abandons a pending registration, then it remains unverified and cannot log in or access Customer-protected functionality.
16. Given persistence fails during registration or activation, then the API does not return success and does not leave a falsely active/unverified Customer.
17. Given repeated registration attempts for the same normalized contact while pending, then `REGISTRATION_PENDING` is returned and the record/name/counters are not overwritten.
18. Given two concurrent resend requests for the same contact, then at most one claims the cooldown/quota slot and at most one active OTP remains.
19. Given concurrent wrong OTP requests for one pending registration, then atomic updates prevent exceeding `MAX_WRONG_OTP_ATTEMPTS_PER_PENDING`.
20. Given a registration has completed, then repeated verify or resend by token or contact before `expiresAt` returns `409 REGISTRATION_COMPLETED` and does not create a Customer or send an OTP again. After the completed record is deleted at `expiresAt`, token or contact lookup returns `404 REGISTRATION_NOT_FOUND`. Concurrent valid verify requests still create the Customer at most once.
21. Given a pending registration already exists for a contact, then a second registration attempt returns `409 REGISTRATION_PENDING` without creating a record, changing the full name, or sending an initial OTP.
22. Given OTP verification at exactly `expiresAt`, then the OTP is rejected as expired (E5); it is valid only before that instant.
23. Given an opaque registration token is used, then its raw value is not stored or logged, its SHA-256 hash is the server-side identifier, and a database ObjectId alone cannot authorize verify/resend.
24. Given the guest returns without a registration token, then contact-based resend processes synchronously under the configured limits and returns a specific result; contact-plus-OTP verification can complete registration and returns the specific verify result.
25. Given E5 occurs (expired/used/superseded OTP), then it does not increment the wrong-attempt counter and no account is activated.
26. Given audit events are written, then they identify the relevant safe outcome without containing OTP, provider secrets, or unnecessary raw contact data.
27. Given OTP is expired, consumed, or superseded (E5), then it is rejected as `OTP_NOT_VALID` and does not increment the E4 wrong-code counter.
28. Given contact-based resend is requested with valid syntax, then it processes synchronously; success returns `200` with `contactType`, `maskedDestination`, and message, while failures return their specific documented codes.
29. Given a name is trimmed, when it has 2–100 allowed Unicode letters/marks, spaces, apostrophes, and hyphens with at least one letter, then it is accepted; all-whitespace, numeric-only, and disallowed-symbol names are rejected.
30. Given an email is normalized, then only lowercase conversion occurs; dot and plus aliases remain distinct.
31. Given a valid Vietnam phone is entered in national or international form, then it is stored as E.164 and is unique across all accounts.
32. Given a contact already has a pending registration, then a second registration attempt returns `409 REGISTRATION_PENDING`, does not alter the name, and does not create or send another initial OTP.
33. Given the provider rejects OTP delivery, then no new active OTP is created, the previous active OTP remains valid, and no contact send quota is consumed.
34. Given five OTPs were successfully sent in the preceding rolling 60 minutes, including an initial send, then the next send is rejected; failed sends do not count toward the quota.
35. Given a pending registration is reached by token or contact, then both identifier forms resolve only that same pending record and its newest active OTP.
36. Given a new OTP is sent after cooldown, then cooldown was measured from the previous OTP's `issuedAt`; resend does not reset wrong attempts.
37. Given a registration token is issued, then the client may use it to verify/resend; contact-plus-OTP works without token, and successful verification does not auto-login.
38. Given a pending registration has reached its configured TTL (proposed: 30 minutes) or an OTP record is 24 hours old, then the scheduled/TTL cleanup removes the record; application logic treats pending as expired at `expiresAt` even before asynchronous TTL deletion.
39. Given registration is called by an authenticated user, then the API returns `403 ALREADY_AUTHENTICATED`.
40. Given one IP exceeds its endpoint bucket in a rolling 60-minute window (proposed: 20 register, 20 resend, 60 verify), then register, resend, and verify by token or contact return `429 IP_RATE_LIMITED` without processing the request.
41. Given a verification succeeds, then OTP consumption, Customer creation, and registration completion commit in one MongoDB transaction on a replica set; partial failure leaves no falsely active account.
42. Given a destination is returned, email is masked as first local-part character plus `**` and domain (`a**@example.com`), and Vietnamese phone is masked as first three digits plus `****` plus last three digits (`090****567`).
43. Given the initial provider send fails and a later contact-based resend succeeds, then that first successful OTP issue counts toward contact quota and cooldown, sets `initialOtpIssuedAt`, and does not increment the per-registration `resendCount`.
44. Given five successful OTP sends remain in the contact's preceding rolling 60-minute window after a pending registration expires, when the contact starts a new registration before the oldest send leaves the window, then registration returns `429 OTP_RATE_LIMITED` with `retryAfterSeconds` for the oldest send's remaining time in that window and sends no OTP.

### UC traceability

| Use Case item | Specification coverage | Acceptance criteria |
| --- | --- | --- |
| Normal Flow, steps 1–2; BR-01–03 | Sections 2, 3, 5, 6 | AC 1–5 |
| Normal Flow, step 3; BR-04–05 | Sections 2, 3, 4, 5, 6 | AC 6–7, 14 |
| A1 resend; BR-05–06 | Sections 2, 4, 5, 6, 7 | AC 8–11, 18 |
| A2 abandon/return | Sections 2, 5, 6 | AC 15, 24 |
| E1 validation | Sections 3, 7 | AC 3–4 |
| E2 duplicate contact | Sections 3, 4, 7 | AC 5, 21, 32 |
| E3 provider failure | Sections 2, 6, 7 | AC 11, 33 |
| E4 incorrect OTP/attempt limit; BR-07 | Sections 2, 4, 6, 7 | AC 12, 19 |
| E5 expired/used/replaced OTP | Sections 2, 3, 6, 7 | AC 7, 22, 25, 27 |
| E6 persistence failure | Sections 4, 7 | AC 16, 41 |
| BR-08 OTP log secrecy | Sections 2, 4, 5, 7 | AC 14, 23, 26 |

## 9. Questions / Assumptions

The decisions supplied on 2026-10-09 resolve the prior product questions. The following implementation details remain to be confirmed before coding begins:

1. **Phone input formats:** Accept Vietnamese national format and E.164. Confirm whether formatted inputs with spaces, parentheses, or hyphens are accepted before normalization (e.g., `(090) 123-4567`).
2. **Name length counting:** Confirm whether the 2–100 limit counts Unicode code points or grapheme clusters. Validation must support Vietnamese combining marks either way.
3. **IP identification:** Confirm the trusted proxy configuration used to determine client IP (e.g., `X-Forwarded-For` trust list). Never trust arbitrary client-supplied forwarding headers; the IP limit must work consistently across backend instances.
4. **IP limits:** This draft proposes separate per-IP buckets of 20 register, 20 resend, and 60 verify requests per rolling hour. Confirm these thresholds. Separate buckets reduce accidental exhaustion across endpoints, but users behind the same school/NAT IP can still share each endpoint's quota.
5. **Provider timeout treatment:** A definitive provider rejection produces no active OTP and no quota use. Confirm the bounded timeout duration and whether an ambiguous timeout is treated identically to a failure (this spec assumes yes and does not blindly retry). Resend by token or contact reports provider failure synchronously.
6. **Cleanup schedule and pending TTL:** Confirm cleanup job frequency and pending TTL. This spec proposes `expiresAt = createdAt + 30 minutes` and OTP `deleteAt` (`+24 hours`); the job removes records whose expiry passed. Application logic treats pending registration as expired immediately at `expiresAt`, even before MongoDB TTL deletion.
7. **Token loss and A2 cross-device recovery (Resolved):** Verify and resend support either the opaque registration token or contact. Contact-based resend never returns a token and uses the same synchronous outcomes as token-based resend. Contact-plus-OTP verification can complete registration without the token and returns specific outcomes matching token-based verification. Pending TTL is proposed as 30 minutes and remains to be confirmed; after expiration, the contact is freed.
8. **HTTP retry details:** Confirm whether `Retry-After` should accompany token-path `retryAfterSeconds` in the response body. Unknown and expired tokens both use `404 REGISTRATION_NOT_FOUND` because expired pending records are deleted and have no persisted `EXPIRED` status.
9. **Audit retention/access:** Confirm retention period and authorized access roles for `registration_events`, IP-limit state, and provider outcome metadata.
10. **Email syntax policy:** Confirm the project's accepted email syntax validation library and whether internationalized email addresses (RFC 6530) are supported. Normalization remains lowercase only; no alias rewriting.
11. **Per-pending limits:** Proposed defaults are 5 wrong OTP attempts and 4 successful resends per pending registration (initial send plus four resends matches the five-send rolling contact quota). The draft blocks both verify and resend after the wrong-attempt maximum. Confirm the numeric values.
12. **Known denial-of-service and enumeration tradeoffs:** A caller who knows a contact can discover its registration state, consume its wrong-attempt limit, or exhaust its resend quota; this can block verification/resend temporarily until pending TTL or rolling quota expiry. This limitation is accepted in the draft and bounded by the TTL and rate limits.
