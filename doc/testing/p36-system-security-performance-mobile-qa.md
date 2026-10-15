# P36-A — System security, performance and mobile QA

## Handoff metadata

| Item | Value |
| --- | --- |
| Work item | P36-A |
| Scope | System security, performance and mobile QA for the 66 SRS use cases and EXT deltas |
| Owner / commit author | Phạm Thành Chung (`chung`, `Chunggrizzy11`) |
| Reviewer | Đặng Văn Hải (`hai`, `Haidvhe181849`) |
| Merge owner | Nguyễn Ngọc Thành (`thanh`, `ngocthanhhx7`) |
| Branch | `feature/p36-a-system-security-performance-and-mobile-qa` |
| Base / target | `develop` / `develop` |
| Evidence date | 15/10/2026, Asia/Ho_Chi_Minh |

The working tree contained unrelated uncommitted P20/P25/P26/P27/P29/P30/P42/P43 changes. They were left untouched. This document and the two P36 test files are the only files in this work item.

## Acceptance contract

The following are measurement targets from the current requirements. They are targets, not pass claims. A result is `VERIFIED` only when the named environment, data shape, sample count and trace are recorded.

| Gate | Target | Measurement required | Current state |
| --- | --- | --- | --- |
| Concurrent active users | 200 users on one server | Staging load profile, error rate and p95 | `INTEGRATION_PENDING` — no staging URL/provider |
| Page response | 95th percentile <= 2 s | Browser navigation on a production build at 360 px and desktop | `INTEGRATION_PENDING` |
| Booking save/confirm | 95th percentile <= 3 s | Real API and database, including validation and transaction | `INTEGRATION_PENDING` |
| First offer | <= 1 min | Assignment job trace from eligible visit to offer | `INTEGRATION_PENDING` |
| Offer expiry | >= 5 min before expiry handling | Server clock and expiry-job trace | `INTEGRATION_PENDING` |
| Paid webhook | <= 10 s | Signed provider callback to persisted state | `INTEGRATION_PENDING` — provider unavailable |
| OTP | <= 5 s | Approved SMS/email sandbox with synthetic destination | `INTEGRATION_PENDING` — provider unavailable |
| Security | No cross-role/private-data bypass | Negative API tests, logs and response projections | Automated contract checks present |
| Mobile | 360 px, keyboard, touch and offline boundaries | Browser/device run with screenshots and console log | Automated CSS/API contract checks present; PWA browser run pending |

## Test layers and commands

| Layer | Evidence in this work item | Command |
| --- | --- | --- |
| Backend security and bounded projection | `backend/tests/unit/p36-security-performance.test.js` | `npm test -- --runTestsByPath tests/unit/p36-security-performance.test.js` |
| Frontend mobile and keyboard contract | `frontend/tests/unit/p36-mobile-contract.test.js` | `npm test -- --runTestsByPath tests/unit/p36-mobile-contract.test.js` |
| Existing backend regression | All unit/integration suites | `npm test` from `backend/` |
| Existing frontend regression | All unit/integration suites | `npm test` from `frontend/` |
| Static quality | ESLint and production bundle | `npm run lint`; `npm run build` from `frontend/` |
| Dependency audit | Lockfiles in `frontend/` and `backend/` | `npm audit --omit=dev` (report output, do not infer from fixtures) |
| Browser/device | Manual runbook below | Chrome DevTools 360x800, keyboard-only, throttled Fast 3G/offline |

The P36 tests use synthetic identities and never call a payment, SMS, email or private-media provider. A fixture proves only the tested adapter/contract; it does not prove provider delivery or staging latency.

### Automated evidence captured

Environment: Node `v24.21.0`, npm `11.19.0`, Windows workspace, 15/10/2026 (Asia/Ho_Chi_Minh). The full-suite rows below were run against the current working tree, which also contained unrelated uncommitted feature files; they are regression evidence for that tree, not a claim that those unrelated files belong to this commit.

| Check | Result |
| --- | --- |
| Backend P36 security/performance test | **PASS** — 1 suite, 9 tests |
| Frontend P36 mobile/keyboard contract test | **PASS** — 1 suite, 4 tests |
| Backend ESLint | **PASS** |
| Frontend ESLint | **PASS** |
| Backend full Jest run | **PASS** — 49 suites, 481 tests |
| Frontend full Jest run | **PASS** — 53 suites, 382 tests |
| Frontend production build | **PASS** — Vite bundle generated |
| Backend production dependency audit | **PASS** — 0 vulnerabilities |
| Frontend production dependency audit | **PASS** — 0 vulnerabilities |
| Staging load/browser/device/provider checks | **SKIPPED / INTEGRATION_PENDING** — no approved staging URL, provider destination or clean P43 integration in this worktree |

## Security checks

- Same-origin CSRF is required for mutations. Missing origin, cross-origin origin and missing token return `403 CSRF_REJECTED`; a valid same-origin token is passed to the verified session actor.
- Session assertions fail closed for locked, expired, synthetic or unknown-role sessions. Role headers supplied by a caller are not authorization.
- Error responses keep a correlation ID but do not expose stack traces, provider payloads or secret text. Request bodies are strict JSON and bounded by the server limit.
- Booking and visit projections remove contact, access-note, provider-reference, staff-note and secret fields before a caller-facing response. Customer reads are owner-scoped.
- Dispatch ranking accepts an authorized candidate projection only, caps the selected page and does not return private candidate fields.
- Mutations remain single-shot on timeout/uncertain acknowledgement; retries require the operation's idempotency key and must be checked against the actual API contract.

## Performance and race checks

- List/dashboard reads must pass a bounded `limit`, cursor/filter and a safe projection to the repository. No test may treat a full collection read as a successful optimization.
- Dispatch candidate output is capped at 10 in the P36 synthetic 200-candidate check; the service never receives pet profile, address or contact fields.
- Offer, callback, assignment and expiry races require atomic repository operations, expected versions and idempotency keys. A duplicate callback must not create a second state transition.
- For staging, run 50 concurrent offer requests and repeated signed callbacks, then record request count, duplicate count, p50/p95/p99, error classes and final persisted state. Do not substitute the unit fixture for this measurement.

## Mobile and PWA checks

- At 360 px wide, verify no horizontal page scroll, readable error/empty/pending states, touch targets at least `--pwc-target` (2.75rem), visible keyboard focus and usable dialogs/forms.
- Test Customer and Pet Sitter flows on a real narrow viewport: booking, assignment, care instructions, check-in/out, evidence and complaint/report screens.
- Disable the network after the public shell is loaded. The UI must show an explicit offline state; booking, check-in/out, payment, OTP and uploads must not be represented as confirmed offline.
- Verify that the service worker caches only public shell/static assets. It must not cache API responses, private media, access notes, identity documents, OTPs or payment state. Test update notification while a care form is open and activate only after the user chooses to update.
- The PWA browser/device evidence is `INTEGRATION_PENDING` until the P43 files are integrated into the clean branch and a browser run records viewport, device/browser version, network profile and screenshots.

## Status vocabulary

`PASS` means the command or browser check was actually run and the expected result was observed. `FAIL` means a reproducible defect. `SKIPPED` means the check could not run for a stated reason. `INTEGRATION_PENDING` means a provider, staging deployment, decision or unintegrated dependency is required. `PARTIAL` means automated coverage exists but the required end-to-end evidence is still missing.

## UC and EXT traceability matrix

The detailed inventory below is generated from [`scope-coverage.md`](../implementation-prompts/scope-coverage.md). Each row identifies the security, performance and mobile observation required for that use case; it does not mark a flow as passed without its real dependency.

| UC | Flow | Primary roles | Security / negative | Performance / race | Mobile / state coverage | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UC-01 | Register Account (WBS 1, 66, 53) | Guest, Customer, Sitter, Staff, Admin | OTP scope, expiry, replay, role | OTP <=5s; resend/rate limit | 360px form, keyboard, error/pending | PARTIAL |
| UC-02 | Log In (WBS 2, 66, 53) | Guest, Customer, Sitter, Staff, Admin | OTP scope, expiry, replay, role | OTP <=5s; resend/rate limit | 360px form, keyboard, error/pending | PARTIAL |
| UC-03 | Log Out (WBS 2) | Guest, Customer, Sitter, Staff, Admin | OTP scope, expiry, replay, role | OTP <=5s; resend/rate limit | 360px form, keyboard, error/pending | PARTIAL |
| UC-04 | Change Email or Phone Number (WBS 3, 66, 53) | Guest, Customer, Sitter, Staff, Admin | OTP scope, expiry, replay, role | OTP <=5s; resend/rate limit | 360px form, keyboard, error/pending | PARTIAL |
| UC-05 | Verify OTP (WBS 70, 66, 53) | Guest, Customer, Sitter, Staff, Admin | OTP scope, expiry, replay, role | OTP <=5s; resend/rate limit | 360px form, keyboard, error/pending | PARTIAL |
| UC-06 | View Home Page (WBS 8) | Guest, Customer | public-only, no private DTO | list/detail p95 <=2s | 360px, touch, empty/error | PARTIAL |
| UC-07 | View Service List (WBS 9) | Guest, Customer | public-only, no private DTO | list/detail p95 <=2s | 360px, touch, empty/error | PARTIAL |
| UC-08 | View Service Details (WBS 10) | Guest, Customer | public-only, no private DTO | list/detail p95 <=2s | 360px, touch, empty/error | PARTIAL |
| UC-09 | View Service Areas and Policies (WBS 11) | Guest, Customer | public-only, no private DTO | list/detail p95 <=2s | 360px, touch, empty/error | PARTIAL |
| UC-10 | Manage User Accounts (WBS 6, 7) | Admin | role + tenant scope, PII projection | cursor/page bound | 360px table scroll, focus | PARTIAL |
| UC-11 | Update Customer Profile (WBS 12) | Customer, Admin | owner scope, private media | bounded list, no N+1 | 360px form, upload/error | PARTIAL |
| UC-12 | Manage Service Addresses (WBS 13) | Customer, Admin | owner scope, private media | bounded list, no N+1 | 360px form, upload/error | PARTIAL |
| UC-13 | View Pet List (WBS 14) | Customer, Admin | owner scope, private media | bounded list, no N+1 | 360px form, upload/error | PARTIAL |
| UC-14 | Add Pet Profile (WBS 15) | Customer, Admin | owner scope, private media | bounded list, no N+1 | 360px form, upload/error | PARTIAL |
| UC-15 | Update Pet Profile (WBS 15) | Customer, Admin | owner scope, private media | bounded list, no N+1 | 360px form, upload/error | PARTIAL |
| UC-16 | Submit Sitter Application (WBS 16) | Guest, Admin | scoped applicant proof | rate limit, lookup bound | 360px OTP, locked/error | PARTIAL |
| UC-17 | View Sitter Applications (WBS 17) | Guest, Admin | scoped applicant proof | rate limit, lookup bound | 360px OTP, locked/error | PARTIAL |
| UC-18 | Approve or Reject Sitter Application (WBS 18) | Guest, Admin | scoped applicant proof | rate limit, lookup bound | 360px OTP, locked/error | PARTIAL |
| UC-19 | Suspend or Reinstate Pet Sitter (WBS 18) | Guest, Admin | scoped applicant proof | rate limit, lookup bound | 360px OTP, locked/error | PARTIAL |
| UC-20 | View Sitter Profile (WBS 57) | Sitter, Admin | role/owner scope | profile/list projection | 360px list, loading/empty | PARTIAL |
| UC-21 | Update Sitter Profile (WBS 57) | Sitter, Admin | role/owner scope | profile/list projection | 360px list, loading/empty | PARTIAL |
| UC-22 | View Sitter List (WBS 58) | Sitter, Admin | role/owner scope | profile/list projection | 360px list, loading/empty | PARTIAL |
| UC-23 | View Sitter Earnings (WBS 47) | Sitter, Admin | role/owner scope | profile/list projection | 360px list, loading/empty | PARTIAL |
| UC-24 | Manage Services (WBS 19) | Staff, Admin | admin mutation + CSRF | catalog query bound | 360px controls, keyboard | PARTIAL |
| UC-25 | Configure Service Prices (WBS 20) | Staff, Admin | admin mutation + CSRF | catalog query bound | 360px controls, keyboard | PARTIAL |
| UC-26 | Configure Booking Policies (WBS 21) | Staff, Admin | admin mutation + CSRF | catalog query bound | 360px controls, keyboard | PARTIAL |
| UC-27 | Create Booking (WBS 24) | Customer, Staff | booking ownership, payment gate | booking <=3s, cursor | 360px slot/payment pending/error | PARTIAL |
| UC-28 | View My Bookings (WBS 25) | Customer, Staff | booking ownership, payment gate | booking <=3s, cursor | 360px slot/payment pending/error | PARTIAL |
| UC-29 | View Booking Details (WBS 26) | Customer, Staff | booking ownership, payment gate | booking <=3s, cursor | 360px slot/payment pending/error | PARTIAL |
| UC-30 | View Customer Dashboard (WBS 67) | Customer, Staff | booking ownership, payment gate | booking <=3s, cursor | 360px slot/payment pending/error | PARTIAL |
| UC-31 | View Visit Schedule (WBS 27) | Customer, Staff | booking ownership, payment gate | booking <=3s, cursor | 360px slot/payment pending/error | PARTIAL |
| UC-32 | Track Visit Status (WBS 28) | Customer, Staff | booking ownership, payment gate | booking <=3s, cursor | 360px slot/payment pending/error | PARTIAL |
| UC-33 | Set Working Hours (WBS 22) | Sitter, Staff | actor scope, time cutoff | calendar overlap query | 360px calendar, timezone | PARTIAL |
| UC-34 | Request Day Off (WBS 23) | Sitter, Staff | actor scope, time cutoff | calendar overlap query | 360px calendar, timezone | PARTIAL |
| UC-35 | View Unassigned Visits (WBS 29) | Staff, Admin | operational scope, no PII | dashboard <=2s, bounded | 360px board, empty/error | PARTIAL |
| UC-36 | Assign Sitter to Visit (WBS 30) | Staff, Admin | operational scope, no PII | dashboard <=2s, bounded | 360px board, empty/error | PARTIAL |
| UC-37 | View All Bookings (WBS 29) | Staff, Admin | operational scope, no PII | dashboard <=2s, bounded | 360px board, empty/error | PARTIAL |
| UC-38 | Monitor Today's Visits (WBS 29) | Staff, Admin | operational scope, no PII | dashboard <=2s, bounded | 360px board, empty/error | PARTIAL |
| UC-39 | View Staff Dashboard (WBS 69) | Staff, Admin | operational scope, no PII | dashboard <=2s, bounded | 360px board, empty/error | PARTIAL |
| UC-40 | View My Assignments (WBS 31) | Sitter, Staff, Admin | assignment/access notes | offer <=1m; atomic race | 360px offer/care pending | PARTIAL |
| UC-41 | Accept or Decline Visit Offer (WBS 31) | Sitter, Staff, Admin | assignment/access notes | offer <=1m; atomic race | 360px offer/care pending | PARTIAL |
| UC-42 | View Visit Details (WBS 59) | Sitter, Staff, Admin | assignment/access notes | offer <=1m; atomic race | 360px offer/care pending | PARTIAL |
| UC-43 | View Home Access Notes (WBS 59) | Sitter, Staff, Admin | assignment/access notes | offer <=1m; atomic race | 360px offer/care pending | PARTIAL |
| UC-44 | Withdraw from Visit (WBS 60) | Sitter, Staff, Admin | assignment/access notes | offer <=1m; atomic race | 360px offer/care pending | PARTIAL |
| UC-45 | Reassign Sitter (WBS 32) | Sitter, Staff, Admin | assignment/access notes | offer <=1m; atomic race | 360px offer/care pending | PARTIAL |
| UC-46 | View Pet Sitter Dashboard (WBS 68) | Sitter, Staff, Admin | assignment/access notes | offer <=1m; atomic race | 360px offer/care pending | PARTIAL |
| UC-47 | Request Booking Change (WBS 33) | Customer, Staff | version/actor/cutoff | preview/write single-shot | 360px choice/error | PARTIAL |
| UC-48 | Approve Booking Change (WBS 33) | Customer, Staff | version/actor/cutoff | preview/write single-shot | 360px choice/error | PARTIAL |
| UC-49 | Cancel Booking or Visit (WBS 34) | Customer, Staff | version/actor/cutoff | preview/write single-shot | 360px choice/error | PARTIAL |
| UC-50 | Confirm Care Instructions (WBS 35) | Customer, Sitter, Staff | visit assignment, private evidence | evidence upload bound | 360px camera/form/offline | PARTIAL |
| UC-51 | Confirm Handover (WBS 36) | Customer, Sitter, Staff | visit assignment, private evidence | evidence upload bound | 360px camera/form/offline | PARTIAL |
| UC-52 | Check In (WBS 37) | Customer, Sitter, Staff | visit assignment, private evidence | evidence upload bound | 360px camera/form/offline | PARTIAL |
| UC-53 | Check Out (WBS 37) | Customer, Sitter, Staff | visit assignment, private evidence | evidence upload bound | 360px camera/form/offline | PARTIAL |
| UC-54 | Complete Visit Checklist (WBS 38) | Customer, Sitter, Staff | visit assignment, private evidence | evidence upload bound | 360px camera/form/offline | PARTIAL |
| UC-55 | View Care Report (WBS 39) | Customer, Sitter, Staff | visit assignment, private evidence | evidence upload bound | 360px camera/form/offline | PARTIAL |
| UC-56 | Report Incident (WBS 40) | Customer, Sitter, Staff, Admin | case projection, private notes | idempotent state change | 360px evidence/loading/error | PARTIAL |
| UC-57 | View Incidents (WBS 41) | Customer, Sitter, Staff, Admin | case projection, private notes | idempotent state change | 360px evidence/loading/error | PARTIAL |
| UC-58 | Resolve Incident (WBS 42) | Customer, Sitter, Staff, Admin | case projection, private notes | idempotent state change | 360px evidence/loading/error | PARTIAL |
| UC-59 | Pay for Booking (WBS 43, 44, 45) | Customer, Staff, Admin | signature, amount, role | webhook <=10s, duplicate | 360px payment/pending/error | PARTIAL |
| UC-60 | View Unpaid Bookings (WBS 65) | Customer, Staff, Admin | signature, amount, role | webhook <=10s, duplicate | 360px payment/pending/error | PARTIAL |
| UC-61 | Process Refund (WBS 46) | Customer, Staff, Admin | signature, amount, role | webhook <=10s, duplicate | 360px payment/pending/error | PARTIAL |
| UC-62 | Rate Visit (WBS 48) | Customer, Sitter, Staff, Admin | direction, ownership, moderation | one write/visit, bounded list | 360px textarea/error/empty | PARTIAL |
| UC-63 | Submit Complaint (WBS 49) | Customer, Sitter, Staff, Admin | direction, ownership, moderation | one write/visit, bounded list | 360px textarea/error/empty | PARTIAL |
| UC-64 | Handle Complaint (WBS 50) | Customer, Sitter, Staff, Admin | direction, ownership, moderation | one write/visit, bounded list | 360px textarea/error/empty | PARTIAL |
| UC-65 | View Notifications (WBS 51) | Customer, Sitter, Staff, Admin | role-scoped notifications | cursor/no N+1 | 360px deep link/offline | PARTIAL |
| UC-66 | View Admin Dashboard (WBS 54) | Admin | admin-only projection | dashboard p95 <=2s | 360px navigation/focus | PARTIAL |

### EXT delta matrix

| EXT | Required QA observation | Status |
| --- | --- | --- |
| EXT-01/02 | single-visit postpay and multi-visit prepay: payment gate and no offer before verification | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-03 | self-cancel cutoff exactly 60 minutes: 59:59 rejected | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-04 | customer selects visits and replacement slots without silent mutation | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-05 | paid multi-visit cancellation retains the defined eligible amount once | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-06 | one settlement request per Vietnam week; duplicate/race safe | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-07 | sitter rating direction and assignment scope | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-08 | public policy version before consent | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-09 | role dashboard/avatar keyboard and outside-click behavior | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-10 | PWA installation capability | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-11 | directed sitter confirmation before offer; auto-ranking unchanged | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-12 | query optimization with bounded projections and no N+1 | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-13 | operator/sitter caused cancellation does not charge customer without approved rule | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-14 | replacement/reschedule fairness and actor audit | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-15 | reschedule request cutoff and stale slot response | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-16 | replacement slot expiry is server-clock based | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-17 | refund basis/rounding is explicit and idempotent | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-18 | settlement request states distinguish approved from paid | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-19 | two-way rating/complaint privacy and moderation | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-20 | directed proposal rejection/expiry/fallback keeps no offer | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-21 | public shell only in cache; transactions require network | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-22 | public service/payment/cancellation/privacy policy coverage | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-23 | explain plan/index evidence and before/after query counts | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-24 | applicant rejection reason and 30-day reapply date | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-25 | application tracking requires scoped proof and rate limit | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-26 | OTP-only auth; email and phone each verified before use | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-27 | complete dog/cat care profile and private files | PARTIAL / INTEGRATION_PENDING where provider or decision is required |
| EXT-28 | sitter complaint visibility/create permission remains contract-scoped | PARTIAL / INTEGRATION_PENDING where provider or decision is required |

## Browser/device runbook

1. Build the frontend and serve the production output from the same-origin host used by the API.
2. Run Chrome DevTools at 360x800 and 412x915, then a desktop viewport. Check no horizontal overflow, focus order, visible focus, target size, text wrapping and each loading/empty/error/forbidden/pending state.
3. Run Customer and Pet Sitter role flows with synthetic accounts. Repeat the same write with a duplicate idempotency key and submit two requests concurrently; record the server response and final resource version.
4. Throttle to Fast 3G, then take the network offline after the public shell loads. Confirm only public shell/static assets remain usable and all server transactions explain that they require a connection.
5. Trigger a service-worker update while a care form is open. Confirm the current worker remains active until the user selects the update action. Capture console output and screenshots; do not include private data in evidence.
6. For performance, use a synthetic dataset with at least 200 active users and 50 concurrent offer/callback requests. Export request timings and database query counts. A single browser navigation or a Jest fixture is not a 200-user or provider SLA measurement.

## Open gates and handoff

- P35 staging deployment and operational URL are required for real p95 and 200-user measurements.
- P43 PWA integration must be present in the clean branch for service-worker/browser evidence.
- P44 query optimization must provide explain plans and before/after query counts; P36 only verifies the caller-facing bounded contract.
- P31/P12 providers and approved synthetic destinations are required for webhook/OTP timing. No provider credential or destination is stored here.
- P37/P51 decisions remain the source of truth for unresolved refund, reschedule, settlement and complaint policy cases.

At handoff, copy the final command output, browser/device versions, viewport, data profile, trace IDs and unresolved gates into the PR body. Do not label this QA package `VERIFIED` while any required external gate remains `INTEGRATION_PENDING`.
