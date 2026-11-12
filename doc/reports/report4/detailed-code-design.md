## 4. Identity, Authentication and Account Management

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 4.1 Class Diagram

Diagram source: class/class-identity.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/controllers/auth.controller.js.

OtpService operations: begin(options); verify(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

SessionService operations: authenticate(req); getCurrentUser(auth); verifyCsrf(auth, token); issueInTransaction(user, mongoSession, options); revoke(req); revokeUserSessions(userId, options); setCookie(res, issued, options); clearCookie(res, options); resumeCsrf(req, auth). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 4.2 UC-01 — Register Account

Diagram source: sequence/uc-01.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: verify REGISTER OTP and approved policy consents. create CUSTOMER + verified contact + session atomically. Server access and current source/state checks remain authoritative.

Alternative and recovery: duplicate verified contact -> 409; invalid DTO -> 422.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.3 UC-02 — Log In

Diagram source: sequence/uc-02.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: consume valid LOGIN OTP; reload current account. issue opaque session only for ACTIVE allowed account. Server access and current source/state checks remain authoritative.

Alternative and recovery: locked account -> 403 after valid OTP; never issue session.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.4 UC-03 — Log Out

Diagram source: sequence/uc-03.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: authenticate owned session. revoke session; clear pwc_session cookie. Server access and current source/state checks remain authoritative.

Alternative and recovery: expired/missing session cannot revoke another user.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.5 UC-04 — Change Email or Phone Number

Diagram source: sequence/uc-04.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: verify new contact with purpose/session binding. replace verified contact under unique lookup and audit. Server access and current source/state checks remain authoritative.

Alternative and recovery: wrong contact/purpose -> reject; lost sole channel needs verified support.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.6 UC-05 — Verify OTP

Diagram source: sequence/uc-05.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: validate challenge expiry, attempts, purpose and contact. consume once; dispatch verified purpose handler. Server access and current source/state checks remain authoritative.

Alternative and recovery: expired/wrong/replayed code -> no account or session.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.7 UC-10 — Manage User Accounts

Diagram source: sequence/uc-10.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: ADMIN route and exact action/role body; target nonsynthetic user and expectedVersion; self-role edit forbidden. LOCK/UNLOCK or distinct allowed role change atomically updates state/roles and authEpoch/version, revokes target sessions and writes audit. Server access and current source/state checks remain authoritative.

Alternative and recovery: Only CUSTOMER/PET_SITTER/STAFF/ADMIN exist; PET_SITTER membership changes remain application-managed. No command replay store; stale/version/role conflict returns explicit error.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js; backend/src/services/user-admin.service.js.

### 4.8 UC-11 — Update Customer Profile

Diagram source: sequence/uc-11.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Active CUSTOMER identity, allowlisted displayName/expectedVersion and current owned user version. Read masked profile; normalize and CAS name only when different; reload authoritative profile projection. Server access and current source/state checks remain authoritative.

Alternative and recovery: No stored key replay or contact mutation. Stale version -> PROFILE_VERSION_CONFLICT, missing ->404, invalid fields ->422, private decrypt failure ->503.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js; backend/src/services/customer-profile.service.js.

## 5. Pet Profiles and Service Addresses

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 5.1 Class Diagram

Diagram source: class/class-petandaddress.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/pet-care-management.service.js; backend/src/services/pet-care-context.service.js; backend/src/controllers/pet-care.controller.js.

PetCareManagement operations: catalog(); listPets(ownerId); listAddresses(ownerId, management); createPet(ownerId, body, key); createAddress(ownerId, body, key); update(ownerId, kind, resourceId, body, key); archive(ownerId, kind, resourceId, body, key). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PetCareContext operations: context(ownerId, input). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 5.2 UC-12 — Manage Service Addresses

Diagram source: sequence/uc-12.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owned CUSTOMER scope; explicit map pin, finite GeoJSON lon/lat, configured coverage area, label/location and bounded private notes; exact action input/version/key. Separate scoped read and guarded resource command; save current data and command result atomically; archive checks unfinished references before commit. Server access and current source/state checks remain authoritative.

Alternative and recovery: Wrong/changed active record -> conflict, invalid data ->422; archive of referenced unfinished visit rolls back. Address lookup and avatar uploads remain separate; booked snapshots are preserved.

Source references: backend/src/services/pet-care-management.service.js; backend/src/models/pet-care.model.js.

### 5.3 UC-13 — View Pet List

Diagram source: sequence/uc-13.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current CUSTOMER session; derive ownerId from session, never query parameter. 200 bounded petView[]. Server access and current source/state checks remain authoritative.

Alternative and recovery: No session ->401; non-Customer ->403; source read failure -> safe error Pet removal is the separate POST /pets/:id/archives command with CSRF/key/state/version guards; it is not a GET side effect..

Source references: backend/src/routes/pet-care.routes.js; backend/src/controllers/pet-care.controller.js; backend/src/services/pet-care-management.service.js.

### 5.4 UC-14 — Add Pet Profile

Diagram source: sequence/uc-14.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owned CUSTOMER scope; DOG/CAT, name/breed/species/weight/traits and declared care fields; verify active breed/trait catalog and preserve UNKNOWN as unknown; exact action input/version/key. Separate scoped read and guarded resource command; save current data and command result atomically; archive checks unfinished references before commit. Server access and current source/state checks remain authoritative.

Alternative and recovery: Wrong/changed active record -> conflict, invalid data ->422; archive of referenced unfinished visit rolls back. Address lookup and avatar uploads remain separate; booked snapshots are preserved.

Source references: backend/src/services/pet-care-management.service.js; backend/src/models/pet-care.model.js.

### 5.5 UC-15 — Update Pet Profile

Diagram source: sequence/uc-15.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owned CUSTOMER scope; DOG/CAT, name/breed/species/weight/traits and declared care fields; verify active breed/trait catalog and preserve UNKNOWN as unknown; exact action input/version/key. Separate scoped read and guarded resource command; save current data and command result atomically; archive checks unfinished references before commit. Server access and current source/state checks remain authoritative.

Alternative and recovery: Wrong/changed active record -> conflict, invalid data ->422; archive of referenced unfinished visit rolls back. Address lookup and avatar uploads remain separate; booked snapshots are preserved.

Source references: backend/src/services/pet-care-management.service.js; backend/src/models/pet-care.model.js.

## 6. Service Catalogue, Deterministic Pricing and Policies

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 6.1 Class Diagram

Diagram source: class/class-catalog.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/service-catalog.service.js; backend/src/services/pricing/pricing.service.js; backend/src/controllers/service-catalog.controller.js.

ServiceCatalogService operations: create(options); update(options); setPolicy(options); listAdmin(options); publicList(options); bookableSnapshot(serviceId, at). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PricingService operations: quote(ownerId, body); basket(ownerId, body); readDecision(ownerId, decisionId). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 6.2 UC-06 — View Home Page

Diagram source: sequence/uc-06.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Public read; use server effective time, catalog enabled gate and published current versions. 200 {available,services} with scope/species/published policy/current price and presentation. Server access and current source/state checks remain authoritative.

Alternative and recovery: Invalid price contract -> 503 CATALOG_INTEGRATION_PENDING; disabled catalog -> available:false; invalid client DTO -> INVALID_RESPONSE No AI pricing. Starting/catalog price is not a confirmed booking quote. Home static introduction/navigation is rendered locally; HomeProductPreview independently reads products. Loading the home page does not create a booking or cart..

Source references: backend/src/services/service-catalog.service.js; backend/src/routes/service-catalog.routes.js; frontend/src/services/public-catalog-api.js; frontend/src/pages/public/HomePage.jsx.

### 6.3 UC-07 — View Service List

Diagram source: sequence/uc-07.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Public read; use server effective time, catalog enabled gate and published current versions. 200 {available,services} with scope/species/published policy/current price and presentation. Server access and current source/state checks remain authoritative.

Alternative and recovery: Invalid price contract -> 503 CATALOG_INTEGRATION_PENDING; disabled catalog -> available:false; invalid client DTO -> INVALID_RESPONSE No AI pricing. Starting/catalog price is not a confirmed booking quote..

Source references: backend/src/services/service-catalog.service.js; backend/src/routes/service-catalog.routes.js; frontend/src/services/public-catalog-api.js.

### 6.4 UC-08 — View Service Details

Diagram source: sequence/uc-08.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Public read; use server effective time, catalog enabled gate and published current versions. 200 {available,services} with scope/species/published policy/current price and presentation. Server access and current source/state checks remain authoritative.

Alternative and recovery: Invalid price contract -> 503 CATALOG_INTEGRATION_PENDING; disabled catalog -> available:false; invalid client DTO -> INVALID_RESPONSE No AI pricing. Starting/catalog price is not a confirmed booking quote. ServiceDetailsPage loads GET /services and selects serviceId in the returned catalog; no separate backend service-detail GET is invented. Missing ID gives the client not-found state. Supplements/final quote require the separate deterministic quote flow..

Source references: backend/src/services/service-catalog.service.js; backend/src/routes/service-catalog.routes.js; frontend/src/services/public-catalog-api.js; frontend/src/pages/public/ServiceDetailsPage.jsx.

### 6.5 UC-09 — View Service Areas and Policies

Diagram source: sequence/uc-09.drawio. Actor: Guest / Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Read enabled public coverage catalog and current published service-policy versions independently. Render public areas and effective service policy text; unavailable source has its own empty/pending state. Server access and current source/state checks remain authoritative.

Alternative and recovery: Do not invent approved cancellation/refund/liability policy; map pin does not establish coverage.

Source references: backend/src/services/service-catalog.service.js; backend/src/routes/service-catalog.routes.js; frontend/src/services/public-catalog-api.js; backend/src/services/public-service-areas.service.js; backend/src/services/public-policy-catalog.service.js; frontend/src/pages/public/ServiceAreasPage.jsx.

### 6.6 UC-22 — Manage Services

Diagram source: sequence/uc-22.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Admin route, allowed service fields and expected latest version. Create identity/first version or append new immutable service revision plus audit in a transaction. Server access and current source/state checks remain authoritative.

Alternative and recovery: Duplicate code/effective revision or stale version ->409; nonbookable current state prevents new booking while historical snapshots remain unchanged.

Source references: backend/src/routes/service-catalog-runtime.js; backend/src/services/service-catalog.service.js; backend/src/services/pricing/pricing.service.js.

### 6.7 UC-23 — Configure Service Prices

Diagram source: sequence/uc-23.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: ADMIN route, actual service, safe integer VND, valid effective timestamp and expected price version. Append immutable base price + audit atomically; quotes use separate approved deterministic policy versions. Server access and current source/state checks remain authoritative.

Alternative and recovery: Stale/duplicate revision ->409; missing price or approved rule blocks quote. Older SRS discount examples do not replace approved current policy.

Source references: backend/src/services/service-price.service.js; backend/src/services/pricing/pricing.service.js; backend/src/routes/service-catalog-runtime.js.

### 6.8 UC-24 — Configure Booking Policies

Diagram source: sequence/uc-24.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: ADMIN visibility/service-policy input and expected immutable revision; public policy reads enforce approval/source/hash/effective gates. Separate visibility revision and service-policy revision transactions append audits; public catalog reads approved versions only. Server access and current source/state checks remain authoritative.

Alternative and recovery: Full SRS booking/cancellation/refund/liability configuration remains partial; no old unapproved percentage/deadline is silently enabled.

Source references: backend/src/services/system-settings.service.js; backend/src/services/service-catalog.service.js; backend/src/services/public-policy-catalog.service.js.

## 7. Booking Lifecycle, Changes and Cancellations

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 7.1 Class Diagram

Diagram source: class/class-booking.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js; backend/src/controllers/booking-checkout.controller.js.

BookingCheckoutService operations: options(actor); confirm(actor, body, key); read(actor, bookingId); paymentLink(actor, bookingId, key). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

CustomerBookingsService operations: list(actor, query). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 7.2 UC-25 — Create Booking

Diagram source: sequence/uc-25.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: validate owner-bound nonexpired QUOTE/MATCH and schedule feasibility. transaction: booking + visit snapshots + intent + idempotency/outbox. Server access and current source/state checks remain authoritative.

Alternative and recovery: pet-time overlap/stale quote -> 409; PREPAY deadline 15 min.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js.

### 7.3 UC-26 — View My Bookings

Diagram source: sequence/uc-26.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: ACTIVE CUSTOMER; only limit/cursor accepted, limit1..50; enabled and bookings collection provisioned. 200 owned booking summaries + nextCursor; expired AWAITING_PAYMENT projected PAYMENT_EXPIRED. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422; disabled/unprovisioned source ->503 BOOKING_READ_UNAVAILABLE; malformed state ->503 INVALID_PROJECTION State filter from SRS is not currently accepted by this list API; expiry projection does not persist a new booking state..

Source references: backend/src/services/customer-bookings.service.js; backend/src/routes/customer-read-runtime.js; backend/src/controllers/customer-bookings.controller.js.

### 7.4 UC-27 — View Booking Details

Diagram source: sequence/uc-27.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current CUSTOMER; valid id and owned booking; source storage ready. 200 booking/payment summary, visits, careShifts and scheduleProposals. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422; ownership/missing resource ->404; source not ready ->503 Customer booking detail is a read only. Stored payment amount/state is not proof of a new provider payment..

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/routes/booking-checkout.routes.js; backend/src/controllers/booking-checkout.controller.js.

### 7.5 UC-28 — View Visit Schedule

Diagram source: sequence/uc-28.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current CUSTOMER; valid id and owned booking; source storage ready. 200 booking/payment summary, visits, careShifts and scheduleProposals. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422; ownership/missing resource ->404; source not ready ->503 Customer booking detail is a read only. Stored payment amount/state is not proof of a new provider payment. Customer visit snapshots and operational care shifts are distinct arrays; do not substitute one for another..

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/routes/booking-checkout.routes.js; backend/src/controllers/booking-checkout.controller.js.

### 7.6 UC-32 — View All Bookings

Diagram source: sequence/uc-32.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: STAFF/ADMIN session; customer/date/status filters and bounded signed cursor; approved operational visibility. Proposed booking page/detail DTO + scoped cursor. Server access and current source/state checks remain authoritative.

Alternative and recovery: Missing source/route -> integration pending; invalid filter/access -> safe422/403; never reuse CUSTOMER-only checkout read for Staff Current source readers are Customer-owned, not the full Staff all-booking search. Implement/mount this reader before claiming runtime coverage..

Source references: backend/src/services/customer-bookings.service.js; backend/src/services/booking-proposals/booking-checkout.service.js.

### 7.7 UC-39 — Cancel Booking or Visit

Diagram source: sequence/uc-39.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Proposed current owner/operational authorization, uncancelled aggregate version and approved effective cancellation policy. Proposed replayable aggregate transaction cancels eligible visits/invitations and records deterministic policy-bound decisions/audit/notification; financial reconciliation remains separate. Server access and current source/state checks remain authoritative.

Alternative and recovery: Missing approved policy blocks financial effect; stale state or conflicting command rolls back; no auto-success refund or unapproved 30% fee.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js.

### 7.8 UC-84 — Request Booking Change

Diagram source: sequence/uc-84.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owned booking/visit, explicit requested slot, current source version, approved change cutoff/expiry and deterministic quote context. Create one PENDING time-change request per visit with immutable slots/source hashes and scoped submit replay. Server access and current source/state checks remain authoritative.

Alternative and recovery: No guaranteed occupancy or price mutation on submit; stale source/pending conflict and unapproved policy fail explicitly.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js; doc/reports/report4/planned-schema-inventory.json.

### 7.9 UC-85 — Approve Booking Change

Diagram source: sequence/uc-85.drawio. Actor: Staff / Admin / proposed expiry worker. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current role, PENDING request/version, unexpired exact customer slot and fresh eligibility/occupancy. Separate approve/reject commands and bounded expiry CAS; approval commits schedule effects with request/result preserving price. Server access and current source/state checks remain authoritative.

Alternative and recovery: Conflict rolls back source/request/intents; expiry grants no refund or assignment; no guessed fee/cutoff.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js; doc/reports/report4/planned-schema-inventory.json.

### 7.10 UC-49 — Pay for Booking

Diagram source: sequence/uc-49.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owned Customer booking/intent, authoritative server VND amount, UNPAID AWAITING_PAYMENT and unexpired deadline. CAS intent link creation, validate payOS response and persist trusted link; independent verified webhook records receipt. Server access and current source/state checks remain authoritative.

Alternative and recovery: Provider failure/mismatch persists RECONCILIATION_REQUIRED; redirects are not receipts. Full POSTPAY/tip/bill rules remain separately gated.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/providers/payos/payment-webhook.service.js; backend/src/services/providers/payos/mongo-payment-webhook.repository.js.

### 7.11 UC-50 — View Unpaid Bookings

Diagram source: sequence/uc-50.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Staff scope; bounded due-date/state/cursor filters; integer VND from authoritative stored payment snapshot. Proposed unpaid/overdue page with amount/deadline/asOf/cursor. Server access and current source/state checks remain authoritative.

Alternative and recovery: Missing read route/source ->pending; no automatic reminder, provider charge or payment success from a list Customer checkout detail and dashboard counters do not implement this operational unpaid-booking list..

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/providers/payos/mongo-payment-webhook.repository.js.

### 7.12 BOOK-01 — Quote and confirm a multi-line service basket

Diagram source: sequence/book-01.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: PricingService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate one to twenty owned service selections, current pet/service/approved policy versions and common basket-level adjustment parameters; total visits<=60. Calculate item prices deterministically with deferred order adjustments, then one basket combo and one order fee; persist owner-bound ten-minute QUOTE and use pure largest-remainder per-visit checkout allocation. Server access and current source/state checks remain authoritative.

Alternative and recovery: Changed selection needs requote; unknown trait rule, incompatible policy, excessive tier or overflow rejects. No AI pricing, guessed tax or booking/payment mutation.

Source references: backend/src/services/pricing/pricing.service.js; backend/src/services/pricing/pricing-calculation.service.js; backend/src/services/booking-proposals/checkout-snapshot.service.js.

### 7.13 BOOK-02 — Split boarding into employee care shifts

Diagram source: sequence/book-02.drawio. Actor: Checkout / Staff. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: BoardingCarePlan. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Staff preview or authorized system finalize; matching checkout policy, booking NEEDS_REVIEW/version, valid confirmed customer durations and configured shift size. Pure boardingCarePlan returns <=480-minute shift specifications with exact service-net remainder allocation; separate finalize transaction CASes booking, supersedes untouched old visits, inserts shifts and command/event. Persistence semantics: Return in-memory shift specifications; parent checkout transaction performs persistence.

Alternative and recovery: More than sixty shifts, past shifts, changed old visit count or stale version conflicts and rolls back; preview/helper themselves never write or certify attendance.

Source references: backend/src/services/booking-proposals/boarding-care-plan.service.js; backend/src/services/booking-proposals/booking-care-plan.service.js.

## 8. Employee Availability, Invitations and Dispatch

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 8.1 Class Diagram

Diagram source: class/class-scheduling.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/controllers/employee-scheduling.controller.js.

EmployeeDispatchService operations: readContext(visitId, session); previewCandidates(actor, visitId, input); queue(actor); invite(actor, visitId, body, key); runBatch(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

EmployeeScheduleRepository operations: col(name); employeeGuard(sitterId, session, authEpoch); eligible(sitterId, visit, session, options); runGuard(options, work); find(sitterId, session); contractAt(sitterId, start, end, session); areaKeys(code). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 8.2 UC-29 — Set Working Hours

Diagram source: sequence/uc-29.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: PET_SITTER ownership, current ACTIVE employee/status guard, future effective windows/area input, signed contract and availability version. Separate read/calendar and command: conflict-check confirmed visits, CAS availability, persist effective revision plus scoped command/event in same transaction. Server access and current source/state checks remain authoritative.

Alternative and recovery: Invalid/overlap/backdated input, contract gap, lost assigned coverage or stale version rejects; exact stored command may replay. FT40/PT20 contract terms are not inferred attendance or payroll.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.3 UC-30 — View Unassigned Visits

Diagram source: sequence/uc-30.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current STAFF/ADMIN session; source storage must be available; GET never calls invite/runBatch. 200 {items,queueHasMore,workAreas,today} with dispatchState/deadline/reviewCode and late flags. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403 access; source failure ->safe error; no expired invitation auto-write in this read The full SRS Needs action catalog and corrective close/cancel/reassign commands are separate requirements; this query shows only source-backed queue/today fields. No fictional unpaid/late escalation record is created..

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/dispatch-workspace.service.js; backend/src/routes/employee-scheduling.routes.js.

### 8.4 UC-31 — Assign Sitter to Visit

Diagram source: sequence/uc-31.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Staff/Admin current context, future SCHEDULED approved care plan/payment, manual dispatchReview and employee eligibility/version/key. Atomically create bounded PENDING invitations/events/result; actual assignment is UC-35 acceptance with its own recheck. Server access and current source/state checks remain authoritative.

Alternative and recovery: AI preview never assigns; manual bypass before system exhaustion or ineligible/occupied/stale selection fails; do not invent override of hard eligibility.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.5 UC-33 — Monitor Today's Visits

Diagram source: sequence/uc-33.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current STAFF/ADMIN session; source storage must be available; GET never calls invite/runBatch. 200 {items,queueHasMore,workAreas,today} with dispatchState/deadline/reviewCode and late flags. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403 access; source failure ->safe error; no expired invitation auto-write in this read The full SRS Needs action catalog and corrective close/cancel/reassign commands are separate requirements; this query shows only source-backed queue/today fields. No fictional unpaid/late escalation record is created..

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/dispatch-workspace.service.js; backend/src/routes/employee-scheduling.routes.js.

### 8.6 UC-34 — View My Assignments

Diagram source: sequence/uc-34.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: ACTIVE PET_SITTER; limit1..50; allowlisted state/cursor; derive sitterId from actor. 200 separate offer and assignment pages with nextCursor. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422; source scope/shape invalid ->503; unsafe or inaccessible offer ->404 Source pagination order is _id descending; JOB-06 route planning is not implemented and is not implied by displaying assignments..

Source references: backend/src/services/sitter-offer.service.js; backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/routes/employee-scheduling.routes.js.

### 8.7 UC-35 — Accept or Decline Visit Offer

Diagram source: sequence/uc-35.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Active owned PET_SITTER offer; command replay guard; read current PENDING offer/deadline/version before deciding. DECLINE CAS records refusal and reopens dispatch context; ACCEPT separately checks booking/payment/directed identity and eligibility/occupancy, CAS assigns visit, revokes rivals and commits events/result. Server access and current source/state checks remain authoritative.

Alternative and recovery: Same-key exact replay only through EmployeeDispatch command; changed payload or stale/expired/occupied/unpaid visit -> conflict and rollback; AI never assigns directly.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.8 UC-36 — View Visit Details

Diagram source: sequence/uc-36.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: PET_SITTER session; offered record scoped to sitter; care requires assigned active visit and allowed parent booking. 200 safe assignment detail / current confirmed care snapshot and access time bounds. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403; inaccessible or inactive assignment ->404; handover missing ->403; legacy care snapshot ->503 Current offered/assigned reads are distinct. Legacy SitterVisitService.detail requires an injected repository and does not expose private address. Home access notes use a separate time-window read, never unconditional disclosure to an offered sitter..

Source references: backend/src/services/sitter-offer.service.js; backend/src/services/care/assigned-care.service.js; backend/src/services/sitter-visit.service.js; backend/src/routes/employee-scheduling.routes.js.

### 8.9 UC-38 — Reassign Sitter

Diagram source: sequence/uc-38.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Staff/Admin, ASSIGNED current version/future visit, different eligible nonsuspended replacement and free slot. Domain port calls guarded reassignVisit, requires version+1 and handover, appends audit/outbox/notifications; schedule and payout unchanged. Server access and current source/state checks remain authoritative.

Alternative and recovery: Runtime repository/composition is a release gate; stale/started/suspended/occupied rejects, missing port returns unavailable.

Source references: backend/src/services/visit-reassignment.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js.

### 8.10 UC-79 — Request Day Off

Diagram source: sequence/uc-79.drawio. Actor: Pet Sitter / Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Approved leave policy, signed active employee, current availability and affected visit versions. Separate submit, Staff decision and withdrawal; approval atomically updates exclusions/visit intents and result. Server access and current source/state checks remain authoritative.

Alternative and recovery: Cutoffs remain approved-policy gates; overlapping/stale visits conflict; no automatic salary decrease.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js; doc/reports/report4/planned-schema-inventory.json.

### 8.11 UC-80 — Manage Shift Schedule

Diagram source: sequence/uc-80.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: PET_SITTER ownership, current ACTIVE employee/status guard, future effective windows/area input, signed contract and availability version. Separate read/calendar and command: conflict-check confirmed visits, CAS availability, persist effective revision plus scoped command/event in same transaction. Server access and current source/state checks remain authoritative.

Alternative and recovery: Invalid/overlap/backdated input, contract gap, lost assigned coverage or stale version rejects; exact stored command may replay. FT40/PT20 contract terms are not inferred attendance or payroll.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.12 UC-82 — Withdraw from Visit

Diagram source: sequence/uc-82.drawio. Actor: Pet Sitter. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Assigned active PET_SITTER, ASSIGNED current version/no check-in and at least inclusive 60-minute lead; validated reason/key. Domain port records WITHDRAWN/version+1 plus audit/outbox; flags need for reassignment while leaving schedule and payout unchanged. Server access and current source/state checks remain authoritative.

Alternative and recovery: Inside 60 minutes routes to Staff; missing runtime ports unavailable. No automatic replacement/refund/payout is promised; older 12-hour SRS wording differs.

Source references: backend/src/services/visit-withdrawal.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js.

## 9. Care Instructions, Execution, Reports and Location

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 9.1 Class Diagram

Diagram source: class/class-care.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/controllers/assigned-care.controller.js.

AssignedCareService operations: get(actor, visitId); acknowledge(actor, visitId, body, key); accessNotes(actor, visitId). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

BookingFinanceSourceService operations: readVisit(current, visitId); checkIn(input); updateChecklist(input); checkOut(input); confirmAssessment(options); drain(options); enqueue(booking, session); touch(booking, session, fields). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 9.2 UC-37 — View Home Access Notes

Diagram source: sequence/uc-37.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current assigned active visit/booking, accepted handover if required, care schema1, one-hour-before/endAt window and current sitter-bound care hash acknowledgement. Read only privateAccessNotes from immutable checkout care snapshot; return expiresAt without source rewrite or access-note audit write. Server access and current source/state checks remain authoritative.

Alternative and recovery: Wrong assignment/state ->404; handover/time/acknowledgement denial ->403; missing care snapshot503. Current endAt window and absent read audit remain SRS/design gaps.

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/employee-scheduling/visit-travel.service.js.

### 9.3 UC-40 — Confirm Care Instructions

Diagram source: sequence/uc-40.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Customer owner, active session, normalized allowed instructions, nonterminal visit and at least two hours before start; repository transaction/version support required. Source boundary can save next care version with requiresAcknowledgement plus optional audit/outbox/replay via injected ports; full current-snapshot update integration remains pending. Server access and current source/state checks remain authoritative.

Alternative and recovery: Late change is rejected, not automatically applied to next visit; stale version conflicts. Adapter, snapshot propagation, notification and assignee acknowledgement linkage remain implementation gates.

Source references: backend/src/services/care/care-instructions.service.js; backend/src/services/care/assigned-care.service.js.

### 9.4 UC-41 — Confirm Handover

Diagram source: sequence/uc-41.drawio. Actor: Customer owner / Staff / Admin; replacement sitter acknowledges care separately. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owner Customer or operational caller confirms; replacement assignment must be eligible, differ from current sitter and acknowledge exact latest care version; current visit version required. Handover service port requires atomic replacement/access capability/CONFIRMED result with optional audit/outbox/replay; full composed runtime remains pending. Server access and current source/state checks remain authoritative.

Alternative and recovery: Unacknowledged/stale/revoked replacement fails; replacement sitter cannot call confirm solely by PET_SITTER role in current service. Do not invent self-confirm authorization.

Source references: backend/src/services/care/handover.service.js; backend/src/services/care/care-instructions.service.js; backend/src/services/care/assigned-care.service.js.

### 9.5 UC-42 — Check In

Diagram source: sequence/uc-42.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Assigned ACTIVE sitter/current visit version, accepted handover, start-minus30-minutes through endAt, PREPAY exact verified receipt where required, owned unique READY CHECK_IN photo. Transaction binds photo once, CASes visit IN_PROGRESS/checkInAt, touches booking, writes source event/Customer notification and command replay result. Server access and current source/state checks remain authoritative.

Alternative and recovery: No careAcknowledgement hash check exists in this check-in command; treat that SRS condition as remaining gap. Reused/unowned photo, stale version, missing receipt or time violation rejects.

Source references: backend/src/services/settlements/booking-finance-source.service.js; backend/src/routes/finance-source-runtime.js; backend/src/controllers/finance-source.controller.js; backend/src/services/care/assigned-care.service.js.

### 9.6 UC-43 — Check Out

Diagram source: sequence/uc-43.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Assigned active sitter/current version, IN_PROGRESS with check-in, <=endAt+2h, complete required checklist and unique owned READY checkout evidence. Transaction completes visit; only when all authoritative care visits finish, completes booking and records immutable employee service credits plus BookingCompleted event; always records visit notification/command. Server access and current source/state checks remain authoritative.

Alternative and recovery: No automatic payout or legacy accrual task in EMPLOYEE mode. Incomplete checklist/media/CAS failure rolls back; late Staff closure and real customer report delivery remain separate acceptance.

Source references: backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/payroll/completion-payroll-source.service.js; backend/src/routes/finance-source-runtime.js.

### 9.7 UC-44 — Complete Visit Checklist

Diagram source: sequence/uc-44.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current assigned IN_PROGRESS visit/checkInAt/version; required snapshot item IDs unique<=100 and exact input coverage, DONE or SKIPPED with reason<=1000. Transaction CASes checklist/version, touches booking and stores source event/Customer notification/command result. Server access and current source/state checks remain authoritative.

Alternative and recovery: Unknown/duplicate/missing item or missing skipped reason rejects. This DTO has no report photo/general notes/photo-waiver field; those SRS details remain outside this endpoint.

Source references: backend/src/services/settlements/booking-finance-source.service.js; backend/src/controllers/finance-source.controller.js.

### 9.8 UC-45 — View Care Report

Diagram source: sequence/uc-45.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: CUSTOMER owns parent booking or STAFF authorized scope; validate visit/report identity and publication/ready state. Proposed care report DTO with ready/pending state. Server access and current source/state checks remain authoritative.

Alternative and recovery: No current Customer/Staff report route established; pending until composed; cross-owner ->404; absent/incomplete evidence ->explicit pending AssignedCare.get is sitter-only and provides owner-declared care instructions, not a Customer report read. Report readiness requires actual completion/checklist/media source; no fabricated care evidence..

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js.

### 9.9 UC-46 — View Dog Walk Location

Diagram source: sequence/uc-46.drawio. Actor: Customer owner / assigned Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current travel authorization/session/assignment and freshness guards; current window is active ASSIGNED/IN_PROGRESS start-minus120-minutes to endAt. Replace latest consented coordinate and expose only fresh authorized map projection; explicit STOP/ARRIVED clears sharing and coordinates. Server access and current source/state checks remain authoritative.

Alternative and recovery: Dog-walk-only service filter, exact check-in-to-checkout window and immediate stored-coordinate deletion at checkout are not enforced by current travel service; retain PARTIAL status.

Source references: backend/src/services/employee-scheduling/visit-travel.service.js; backend/src/services/settlements/booking-finance-source.service.js.

### 9.10 UC-78 — Track Visit Status

Diagram source: sequence/uc-78.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current CUSTOMER; valid id and owned booking; source storage ready. 200 booking/payment summary, visits, careShifts and scheduleProposals. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422; ownership/missing resource ->404; source not ready ->503 Customer booking detail is a read only. Stored payment amount/state is not proof of a new provider payment. Refresh careShifts/checkInAt/checkOutAt from source; optional travel GET is separately owner/window/consent/freshness guarded. No arrival/check-in is inferred from map coordinates..

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/routes/booking-checkout.routes.js; backend/src/controllers/booking-checkout.controller.js.

### 9.11 TRAVEL-01 — Start, update and stop consented foreground travel sharing

Diagram source: sequence/travel-01.drawio. Actor: Assigned sitter / Authorized viewer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: VisitTravelService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current assignee/active booking and start-minus120-minutes to endAt window; explicit sharing/version/session, fresh monotonic coordinates and current employee guard for writes. Separate START/ARRIVED/STOP replace latest travel row and event; locate replaces only current observation; authorized ETA rechecks assignment/session/observedAt after provider call. Server access and current source/state checks remain authoritative.

Alternative and recovery: No generic idempotency-key result store. Closed/stale/reassigned/stopped sessions hide coordinates; no append-only GPS trail or real-device/background acceptance claim.

Source references: backend/src/services/employee-scheduling/visit-travel.service.js; backend/src/models/employee-scheduling.model.js.

## 10. Incidents, Complaints and Refund Decisions

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 10.1 Class Diagram

Diagram source: class/class-cases.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/incidents/incident.service.js; backend/src/services/complaints/complaint.service.js; backend/src/controllers/complaint.controller.js.

IncidentService operations: report(options); create(options); list(options); listIncidents(options); detail(options); get(options); resolve(options); resolveIncident(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

ComplaintService operations: submit(options); create(options); createComplaint(options); submitComplaint(options); list(options); get(options); detail(options); review(options); resolve(options); object(options); disagree(options); decide(options); finalize(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 10.2 UC-47 — Report Incident

Diagram source: sequence/uc-47.drawio. Actor: Customer / assigned Pet Sitter / Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Authorized Customer owner, assigned sitter or operational actor; active session, normalized incident fields, optional visit version and noncancelled visit; repository transaction port required. Source boundary creates OPEN incident and optional audit/operation result; emergency/critical only marks financialHold PENDING_REVIEW. Server access and current source/state checks remain authoritative.

Alternative and recovery: Complete runtime, evidence ownership and real booking financial hold adapter remain pending. Report does not itself freeze every bill, calculate liability, charge or refund.

Source references: backend/src/services/incidents/incident.service.js; backend/src/routes/incident.routes.js.

### 10.3 UC-48 — Resolve Incident

Diagram source: sequence/uc-48.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Operational actor/current incident version and allowed state transition; Admin required for CLOSED and any financialDecision field. Source boundary records versioned resolution/actions/follow-up and optional audited operation result via injected repository. Server access and current source/state checks remain authoritative.

Alternative and recovery: Financial decision enums are review labels, not amount calculation or transfer. Real hold/release/refund and unpaid-bill effects require separate approved integrated finance ports.

Source references: backend/src/services/incidents/incident.service.js; backend/src/services/refunds/refund.service.js.

### 10.4 UC-51 — Process Refund

Diagram source: sequence/uc-51.drawio. Actor: Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Staff proposal/Admin decision, source authorization, approved ready refundable capacity, positive integer VND and current refund version/command identity. Port-based propose/approve-or-reject/reserve then external-transfer record with exact CONFIRMED, uncertain TRANSFER_PENDING or constrained FAILED release; ledger/event/command share transaction. Server access and current source/state checks remain authoritative.

Alternative and recovery: Current decide cannot lower amount; unpaid-bill reduction/product refund integration and complete adapters remain pending. UNKNOWN/mismatch never means paid or safe retry.

Source references: backend/src/services/refunds/refund.service.js.

### 10.5 UC-52 — Submit Complaint

Diagram source: sequence/uc-52.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Customer owner of assigned completed visit, within seven days after completion, current optional visit version, no open complaint and valid owned/care-bound READY evidence. Transaction inserts OPEN complaint, applies CASE financial hold through shared booking/earning guards, and stores source event plus command result; owned listing is scoped. Server access and current source/state checks remain authoritative.

Alternative and recovery: Late/duplicate/foreign/stale/evidence errors reject. Paid earnings create pending reviewed adjustment, not automatic recovery/refund.

Source references: backend/src/services/complaints/complaint.service.js; backend/src/services/complaints/mongo-complaint.repository.js; backend/src/services/settlements/booking-financial-holds.service.js; backend/src/routes/finance-source-runtime.js.

### 10.6 UC-53 — Handle Complaint

Diagram source: sequence/uc-53.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Action-specific Staff/Customer-owner/Admin authorization, current case version and payload-bound command replay; current state transitions and at-most-one objection. Separate Staff review/resolve, Customer objection and Admin close; Mongo adapter keeps all nonfinal CASE holds and releases only explicit Admin CLOSED/financialHold=false with audit/event/command. Server access and current source/state checks remain authoritative.

Alternative and recovery: No three-day objection deadline; current object transition helper also permits OPEN->UNDER_REVIEW. Refund amount/bill adjustment is separate, not the financialDecision text.

Source references: backend/src/services/complaints/complaint.service.js; backend/src/services/complaints/mongo-complaint.repository.js.

### 10.7 UC-86 — View Incidents

Diagram source: sequence/uc-86.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: ACTIVE authorized actor; operational list role STAFF/ADMIN; limit1..100; enum/cursor input guards. 200 {items,nextCursor} only when real repository is provided. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422; missing/bad adapter or malformed source ->503 INCIDENT_UNAVAILABLE The router/service exports are source capabilities; a mounted production incident read adapter has not been established here..

Source references: backend/src/services/incidents/incident.service.js; backend/src/controllers/incident.controller.js; backend/src/routes/incident.routes.js.

## 11. Employee Payroll, Salary Advances and Adjustments

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 11.1 Class Diagram

Diagram source: class/class-payroll.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/payroll/payroll.service.js; backend/src/services/payroll/payroll-adjustment.service.js; backend/src/controllers/payroll.controller.js.

PayrollService operations: payrollEmployees(actor); previewStatement(actor, body); prepareAutomaticStatement(actor, body, key); recordContract(actor, body, key); own(actor, query); submitAdvance(actor, body, key); decideAdvance(actor, advanceId, body, key); overview(actor); prepareStatement(actor, body, key, sourceDraft); decideStatement(actor, statementId, body, key); listStatements(actor, query); listAdvances(actor, query). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PayrollAdjustmentService operations: submitAdjustment(actor, body, key); decideAdjustment(actor, adjustmentId, body, key); listAdjustments(actor, query). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 11.2 UC-20 — View Sitter Earnings

Diagram source: sequence/uc-20.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: PET_SITTER session; scope userId=targetId=actor; validate dates/limit/cursor and financial policy gate. 200 source-backed PAGE earnings subtotals/items or 202 INTEGRATION_PENDING. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422 for session/role/filter; invalid source/ledger ->503; missing/undecided source ->202, never guessed pay/tips This legacy per-source read is separate from employee PayrollService.own and approved FT/PT salaries; it does not calculate new compensation, equal tip split or execute external payout..

Source references: backend/src/services/dashboards/earnings.service.js; backend/src/services/dashboards/mongo-earnings.repository.js; backend/src/services/dashboards/read-projection.js; backend/src/routes/earnings.routes.js.

### 11.3 UC-75 — Review Pay Statement

Diagram source: sequence/uc-75.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: PET_SITTER session; scoped own() query and validated independent pagination cursors; payroll storage available. Read owned contracts, salary advances, statements and adjustments; return public projections and next cursors without write transaction. Server access and current source/state checks remain authoritative.

Alternative and recovery: No statement acceptance/complaint/three-day auto-close command is implemented; discrepancy correction is a separate Admin PAY-03 flow.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/models/payroll.model.js; backend/src/services/settlements/settlement.service.js.

### 11.4 UC-76 — Close Pay Statement

Diagram source: sequence/uc-76.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: ADMIN action input/key and current statement version; PREPARED for APPROVE/REJECT, APPROVED for RECORD_PAYMENT. Selected command atomically APPROVES, VOIDS or records PAID with unique transfer claim, PayrollEvent, notification and replay result. Server access and current source/state checks remain authoritative.

Alternative and recovery: Version/state/duplicate transfer -> 409; statement absent -> 404. No payroll UNKNOWN state or three-day auto-close; legacy settlement uncertainty remains FIN-03.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/models/payroll.model.js; backend/src/services/settlements/settlement.service.js.

### 11.5 PAY-01 — Request and decide a salary advance

Diagram source: sequence/pay-01.drawio. Actor: Pet Sitter / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: PayrollService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Signed effective active contract, approved advance policy, positive agreed amount<=50% monthly base, no concurrent pending advance and unused approved monthly quota. Separate submit/approve/reject/owner-withdraw/payment-record commands serialize employee/month guards, version, exact replay and event/notification; only evidenced unique external transfer records PAID. Server access and current source/state checks remain authoritative.

Alternative and recovery: Rejected/withdrawn requests release pending quota; stale/prior month/used quota/cap or reference conflict rejects. No interest, automatic transfer or invented statutory case.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/models/payroll.model.js.

### 11.6 PAY-02 — Prepare source-based payroll and selected payslip print

Diagram source: sequence/pay-02.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: PayrollService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Admin source preview with signed covering terms, completed single-month period and explicit attendance/statutory/consent references; current service credits/source versions. Read-only preview returns deterministic breakdown/sourceHash; separate prepare revalidates sources in transaction, checks overlap/credit/advance allocation and creates PREPARED snapshot/source claims/event/command; selected print is presentation. Server access and current source/state checks remain authoritative.

Alternative and recovery: SELF_REGISTERED automatic draft only supports full month without unpaid exceptions; availability is not attendance. Missing sources/changed hash/overlap fails instead of guessing salary deductions or KPI.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/services/payroll/payroll-draft.service.js.

### 11.7 PAY-03 — Record a separate payroll adjustment

Diagram source: sequence/pay-03.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: PayrollAdjustmentService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Admin submits a version-bound positive integer SUPPLEMENT or RECOVERY with unique assessmentReference; only APPROVED/PAID original statements allow submission, RECOVERY requires PAID. Separate SUBMITTED decisions APPROVE or REJECT require current version/reason. APPROVED SUPPLEMENT RECORD_PAYMENT requires original statement PAID and unique transfer claim, then becomes PAID. APPROVED RECOVERY RECONCILE requires agreement/resolution references, then becomes RECONCILED without automatic payroll/advance deduction. Server access and current source/state checks remain authoritative.

Alternative and recovery: Wrong direction/action/state, reused assessment/transfer reference, stale version or changed replay fingerprint returns conflict; unresolved external payment is not recorded as confirmed.

Source references: backend/src/services/payroll/payroll-adjustment.service.js; backend/src/models/payroll.model.js.

## 12. Product Catalogue, Cart, Orders and Returns

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 12.1 Class Diagram

Diagram source: class/class-productsales.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/controllers/product-order-management.controller.js.

ProductOrderService operations: place(actor, body, idempotencyKey); list(actor, query); read(actor, orderId). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

ProductOrderManagementService operations: list(actor, query); read(actor, orderId); handToCarrier(actor, orderId, body); markReady(actor, orderId, body); handToCustomer(actor, orderId, body); markDelivered(actor, orderId, body); markReturning(actor, orderId, body); confirmReturned(actor, orderId, body); recordPayment(actor, orderId, body); cancel(actor, orderId, body). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 12.2 UC-55 — Browse Products

Diagram source: sequence/uc-55.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Public catalog route when PRODUCT_SALES is mounted; validated allowlisted search/category/petType/page/limit. 200 paged current product summaries. Server access and current source/state checks remain authoritative.

Alternative and recovery: Invalid filters ->422; disabled module has no mounted route; source failure ->controlled error Public stock is sellable availability, not the confidential physical-stock/history screen..

Source references: backend/src/services/product-sales/product-catalog.service.js; backend/src/controllers/product-catalog.controller.js; backend/src/routes/product-sales.routes.js.

### 12.3 UC-56 — View Product Details

Diagram source: sequence/uc-56.drawio. Actor: Guest / Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Parse product ObjectId; require visible:true and deletedAt:null. 200 public product detail. Server access and current source/state checks remain authoritative.

Alternative and recovery: Invalid id ->422; inaccessible product ->404; source failure ->safe error Tier discount is not applied by this source read. Add-to-cart is a separate authenticated CUSTOMER mutation with CSRF, not a GET effect..

Source references: backend/src/services/product-sales/product-catalog.service.js; backend/src/controllers/product-catalog.controller.js; backend/src/routes/product-sales.routes.js.

### 12.4 UC-57 — Manage Products

Diagram source: sequence/uc-57.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current Admin MANAGE_PRODUCTS, allowlisted fields and observed detailsVersion; deletion also reads stock/order history. Create hidden zero-stock product with transactional code; CAS details edits; block deletion with stock/history or soft-delete reason/actor/time under stock-version guard. Server access and current source/state checks remain authoritative.

Alternative and recovery: No command-key replay store; missing/stale/blocked errors are explicit. Product photo deletion/retention is MEDIA-02, not avatar history.

Source references: backend/src/services/product-sales/product-management.service.js; backend/src/services/product-sales/product-photo.service.js; backend/src/models/product.model.js.

### 12.5 UC-61 — Manage Shopping Cart

Diagram source: sequence/uc-61.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Active CUSTOMER, owned cart and validated per-action product/quantity; fresh visible product/sellable stock check. Separate READ projection, ADD transactional increment, SET exact quantity and REMOVE no-op for absent line; no stock hold until order placement. Server access and current source/state checks remain authoritative.

Alternative and recovery: No cart command replay store: repeated ADD is additive. Out-of-stock/quantity/line/full errors are explicit; preview amounts are recomputed authoritatively at checkout.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js; backend/src/services/product-sales/product-cart.service.js.

### 12.6 UC-62 — Place Product Order

Diagram source: sequence/uc-62.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Active CUSTOMER, validated full-cart receive/payment inputs, owned supported-area delivery address and customer-scoped key/fingerprint. Allocate code outside transaction; stable conditional per-product holds, canonical price snapshots and deterministic VND totals; create PLACED order/notification and empty cart atomically. Server access and current source/state checks remain authoritative.

Alternative and recovery: Same customer/key exact input replays stored order; changed input conflicts. Stock/address/cart failure rolls back holds; order creation does not prove payment or carrier delivery.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.7 UC-63 — View My Orders

Diagram source: sequence/uc-63.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: ACTIVE CUSTOMER membership; derive customerId from actor; validate page/limit or ObjectId. 200 owned order page/detail with lines, paid/state, snapshot totals and trackingCode. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422; inaccessible detail ->404; no placement replay or stock change during read Listing/detail does not reread mutable product prices into historical order lines or confirm external payment..

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/controllers/product-order.controller.js; backend/src/routes/product-sales.routes.js.

### 12.8 UC-64 — Prepare and Ship Order

Diagram source: sequence/uc-64.drawio. Actor: Admin (HANDLE_ORDERS permission). State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current ADMIN through HANDLE_ORDERS permission, validated action body, current order status/version read inside UnitOfWork. hand-to-carrier: release hold and decrement stock exactly once; notification and affected stock/refusal writes commit together under state/version CAS; notification and affected stock/refusal writes commit together under state/version CAS. Server access and current source/state checks remain authoritative.

Alternative and recovery: No command-key/result store in management controller/service; a repeated or stale action can return ORDER_STATE_CONFLICT. Read current order after uncertain acknowledgement; carrier and actual refund/payment acceptance are separate.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.9 UC-65 — Update Delivery Status

Diagram source: sequence/uc-65.drawio. Actor: Admin (HANDLE_ORDERS permission). State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current ADMIN through HANDLE_ORDERS permission, validated action body, current order status/version read inside UnitOfWork. mark delivered or returning with reason; no return stock credit here; notification and affected stock/refusal writes commit together under state/version CAS; notification and affected stock/refusal writes commit together under state/version CAS. Server access and current source/state checks remain authoritative.

Alternative and recovery: No command-key/result store in management controller/service; a repeated or stale action can return ORDER_STATE_CONFLICT. Read current order after uncertain acknowledgement; carrier and actual refund/payment acceptance are separate.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.10 UC-66 — Confirm Returned Order

Diagram source: sequence/uc-66.drawio. Actor: Admin (HANDLE_ORDERS permission). State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current ADMIN through HANDLE_ORDERS permission, validated action body, current order status/version read inside UnitOfWork. confirm return once; credit only sellable units; record attributable refusal; notification and affected stock/refusal writes commit together under state/version CAS; notification and affected stock/refusal writes commit together under state/version CAS. Server access and current source/state checks remain authoritative.

Alternative and recovery: No command-key/result store in management controller/service; a repeated or stale action can return ORDER_STATE_CONFLICT. Read current order after uncertain acknowledgement; carrier and actual refund/payment acceptance are separate.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.11 UC-67 — Hand Over Pick-up Order

Diagram source: sequence/uc-67.drawio. Actor: Admin (HANDLE_ORDERS permission). State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current ADMIN through HANDLE_ORDERS permission, validated action body, current order status/version read inside UnitOfWork. guarded hand-to-customer; release hold and decrement stock once; notification and affected stock/refusal writes commit together under state/version CAS; notification and affected stock/refusal writes commit together under state/version CAS. Server access and current source/state checks remain authoritative.

Alternative and recovery: No command-key/result store in management controller/service; a repeated or stale action can return ORDER_STATE_CONFLICT. Read current order after uncertain acknowledgement; carrier and actual refund/payment acceptance are separate.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.12 UC-68 — Sell at Counter

Diagram source: sequence/uc-68.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Approved sales capability, actual product prices/sellable quantities and optional verified Customer/tier policy. Shared PICKUP/PAY_AT_SHOP held order; confirmed receipt releases hold and decrements stock once; unpaid cancel releases only hold. Server access and current source/state checks remain authoritative.

Alternative and recovery: No new SALE_STAFF role/receive enum or phone-as-auth; current ProductOrder requires customerId, so guest aggregate extension/receipt allocation and tier rates remain gated, never fabricate a Customer.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js; doc/reports/report4/planned-schema-inventory.json.

### 12.13 UC-92 — Report Faulty Product

Diagram source: sequence/uc-92.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owned delivered/picked-up order, purchased quantities, private evidence and approved faulty-goods policy. Per-order transactional source capacity guard and scoped submit identity create SUBMITTED claim; no stock/refund effect. Server access and current source/state checks remain authoritative.

Alternative and recovery: Policy/retention adapters gated; no guessed deadline or change-of-mind return; duplicate/exhausted source conflicts.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js; doc/reports/report4/planned-schema-inventory.json.

### 12.14 UC-93 — Handle Faulty Product Claim

Diagram source: sequence/uc-93.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Separate Staff review and current Admin decision, actual source/evidence, expected versions and approved policy. Separate decision then evidenced exchange or external-refund resolution; faulty units never restock, replacement stock once. Server access and current source/state checks remain authoritative.

Alternative and recovery: Uncertain external refund remains approved/unresolved for reconciliation; no fabricated UNKNOWN claim state or blind second transfer.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js; doc/reports/report4/planned-schema-inventory.json.

## 13. Suppliers, Goods Receipts and Stock Control

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 13.1 Class Diagram

Diagram source: class/class-stock.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/product-sales/supplier-management.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/controllers/supplier-management.controller.js.

SupplierManagementService operations: list(actor, query); read(actor, supplierId); create(actor, body); update(actor, supplierId, body); stop(actor, supplierId, body); resume(actor, supplierId, body). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

ProductOrderManagementService operations: list(actor, query); read(actor, orderId); handToCarrier(actor, orderId, body); markReady(actor, orderId, body); handToCustomer(actor, orderId, body); markDelivered(actor, orderId, body); markReturning(actor, orderId, body); confirmReturned(actor, orderId, body); recordPayment(actor, orderId, body); cancel(actor, orderId, body). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 13.2 UC-69 — Manage Suppliers

Diagram source: sequence/uc-69.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Admin supplier permission, normalized unique name, valid contact/product ids and per-action state/version. Separate create/edit/stop/resume writes preserve supplier identity/history; Vietnamese ordered list and counts are read projections. Server access and current source/state checks remain authoritative.

Alternative and recovery: No command-key replay guarantee; missing/stale/state/name/product/contact error is explicit. Recorded associations do not restrict allowed receipt products.

Source references: backend/src/routes/product-sales.routes.js; backend/src/services/product-sales/supplier-management.service.js; backend/src/models/product.model.js.

### 13.3 UC-70 — Record Goods Receipt

Diagram source: sequence/uc-70.drawio. Actor: Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Reviewed receiving/stock adapter, valid supplier/products, exact typed quantities and initial key/fingerprint. Record immutable receipt, accepted stock changes, unique ledger source events and result atomically; all-rejected delivery still recorded. Server access and current source/state checks remain authoritative.

Alternative and recovery: Same-key replay; changed payload/stale stock conflicts; later correction uses UC-95, no receipt rewrite.

Source references: backend/src/routes/product-sales.routes.js; backend/src/services/product-sales/supplier-management.service.js; backend/src/models/product.model.js; doc/reports/report4/planned-schema-inventory.json.

### 13.4 UC-71 — View Stock

Diagram source: sequence/uc-71.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current authorized Admin; SALE_STAFF role remains a separate unresolved role gate; validate product/filter/cursor. Proposed stock and independent history page DTO. Server access and current source/state checks remain authoritative.

Alternative and recovery: Absent stock reader/history implementation ->pending, not invented receipt history; missing low-stock policy remains unresolved Public availability is not the complete stock screen; ProductManagement excludes stock by contract. Proposed schema remains DESIGN_PENDING_RUNTIME..

Source references: backend/src/services/product-sales/product-management.service.js; backend/src/services/product-sales/product-order-pricing.js; backend/src/constants/product-permissions.js.

### 13.5 UC-95 — Adjust Stock

Diagram source: sequence/uc-95.drawio. Actor: Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Evidenced reason/source receipt where required, safe signed delta, expected stock version and sellable capacity. Atomic guarded stock/version, immutable adjustment and unique ledger event with command result. Server access and current source/state checks remain authoritative.

Alternative and recovery: No unexplained positive stock; insufficiency/version/identity conflict rolls back; no historical receipt mutation.

Source references: backend/src/routes/product-sales.routes.js; backend/src/services/product-sales/supplier-management.service.js; backend/src/models/product.model.js; doc/reports/report4/planned-schema-inventory.json.

## 14. Shop Grooming and Pet Handover

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 14.1 Class Diagram

Diagram source: class/class-grooming.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/booking-proposals/boarding-care-plan.service.js; backend/src/controllers/booking-checkout.controller.js.

BookingCheckoutService operations: options(actor); confirm(actor, body, key); read(actor, bookingId); paymentLink(actor, bookingId, key). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

BoardingCarePlan operations: boardingCarePlan(booking, shiftMinutes). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 14.2 UC-58 — Book Grooming Appointment

Diagram source: sequence/uc-58.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owned pet/service sources, explicit declared care and requested slot, approved risk/capacity policy and deterministic quote. Confirm per-pet final quote and create shared Booking/Visit grooming context with immutable snapshots and scoped replay. Server access and current source/state checks remain authoritative.

Alternative and recovery: Very risky pet stops online flow for shop guidance; stale quote/occupied slot conflicts; no AI price.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/booking-proposals/boarding-care-plan.service.js; doc/reports/report4/planned-schema-inventory.json.

### 14.3 UC-59 — Check In Pet at Shop

Diagram source: sequence/uc-59.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current BOOKED appointment/versions, actual reception/photo/condition, approved surcharge consent and qualified free employee. Separate queue read, receive, Customer consent/no-consent disposition, assignment and no-show commands. Server access and current source/state checks remain authoritative.

Alternative and recovery: No surcharge without actual consent, no invented arrival/no-show cutoff; any cancellation/no-charge policy remains explicit gate.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/booking-proposals/boarding-care-plan.service.js; doc/reports/report4/planned-schema-inventory.json.

### 14.4 UC-60 — Hand Back Pet and Take Payment

Diagram source: sequence/uc-60.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: READY pet/authorized pickup, deterministic payable balance, verified counter receipt adapter and actual handover. Separate real collection, unique receipt allocation and handed-back command with parent/extension guards. Server access and current source/state checks remain authoritative.

Alternative and recovery: CASH/VietQR are not proved by current PAYOS-only payments; uncertain/unpaid stays pending, no fabricated pet return.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/booking-proposals/boarding-care-plan.service.js; doc/reports/report4/planned-schema-inventory.json.

### 14.5 UC-91 — Update Grooming Status

Diagram source: sequence/uc-91.drawio. Actor: Pet Sitter. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Actual assigned qualified on-shift employee, parent/extension versions, current care acknowledgement and consent. Separate own queue read, start, READY or STOPPED commands with guarded atomic event/result; evidenced observation separate. Server access and current source/state checks remain authoritative.

Alternative and recovery: No inferred assignment/medical facts or original snapshot rewrite; stale assignment conflicts, safety stop grants no automatic fee/refund.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/booking-proposals/boarding-care-plan.service.js; doc/reports/report4/planned-schema-inventory.json.

## 15. Public Sitter Profiles and Verified Ratings

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 15.1 Class Diagram

Diagram source: class/class-engagement.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/reviews/review.service.js; backend/src/services/sitter-public-profile.service.js; backend/src/controllers/review.controller.js.

ReviewService operations: rateVisit(options); rate(options); create(options); createRating(options); get(options); detail(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

SitterPublicProfileService operations: readOwn(options); listPending(options); submit(input); review(input). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 15.2 UC-72 — View Sitter Profile

Diagram source: sequence/uc-72.drawio. Actor: Customer / Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Guest is not authorized; directory CUSTOMER/STAFF/ADMIN; full private operational detail STAFF permission. 200 approved public projection or authorized operational sitter detail. Server access and current source/state checks remain authoritative.

Alternative and recovery: Guest/no session ->401; wrong role ->403; bad/inaccessible target ->404; missing projection ->202 or invalid source ->503 The two readers are different services. No general Guest public profile endpoint or arbitrary target access through the sitter own-profile route is invented..

Source references: backend/src/services/dashboards/sitter-list.service.js; backend/src/services/dashboards/mongo-sitter-profile.repository.js; backend/src/services/sitter-management.service.js; backend/src/routes/sitter-management.routes.js.

### 15.3 UC-73 — Update Sitter Profile

Diagram source: sequence/uc-73.drawio. Actor: Pet Sitter; separate Staff/Admin moderator. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Active eligible sitter/current profile version or independent Staff-role moderator; validated bio/areas and storage indexes; current account/status rechecked transactionally. SUBMIT creates/CASes SUBMITTED public bio/areas and resets review; separate non-self REVIEW sets APPROVED/REJECTED with contentHash audit and stored command result. Server access and current source/state checks remain authoritative.

Alternative and recovery: Only APPROVED profile is public. Avatar image uses separate media service; application/private identity and AI profile are not used as public content.

Source references: backend/src/services/sitter-public-profile.service.js; backend/src/validators/sitter-public-profile.validator.js; backend/src/routes/sitter-public-profile.routes.js; backend/src/models/sitter-public-profile.model.js.

### 15.4 UC-74 — View Sitter List

Diagram source: sequence/uc-74.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current STAFF permission (ADMIN inherits); bounded allowlisted filters and cursor scoped to actor/filters. 200 list with current status/type/areas/source and independent detail/activity snapshots. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403; invalid filter/cursor ->422; target missing ->404; malformed published rating ->503 The list does not include every SRS 30-day withdrawal/late-check-in metric. Detail/activity queries are independent read-only snapshots, not command replay..

Source references: backend/src/services/sitter-management.service.js; backend/src/controllers/sitter-management.controller.js; backend/src/routes/sitter-management.routes.js.

### 15.5 UC-87 — Rate Visit

Diagram source: sequence/uc-87.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current owned Customer account and assigned completed visit, optional version/unique direction, verified whole-booking completion plus matching immutable credit/event/source timestamps. Transaction creates SUBMITTED role-scoped review and verified-source outcome with trainingEligible=false, source event and command result; later exporter checks captured features and provenance. Server access and current source/state checks remain authoritative.

Alternative and recovery: Customer rating has no seven-day deadline in current service/repository. Only PUBLISHED customer-to-sitter ratings enter public aggregate; no public comments or automatic model training approval.

Source references: backend/src/services/reviews/review.service.js; backend/src/services/reviews/mongo-customer-review.repository.js; backend/src/models/customer-review.model.js; backend/src/services/ai-training/dataset-export.service.js.

## 16. Role Dashboards, Operational Reports and Audit

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 16.1 Class Diagram

Diagram source: class/class-dashboards.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/payroll.service.js; backend/src/controllers/dashboard-read.controller.js.

MongoOperationalDashboardRepository operations: readSnapshot(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PayrollService operations: createPayrollService(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 16.2 UC-54 — View Admin Dashboard

Diagram source: sequence/uc-54.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: ADMIN session; actor-derived scope; validated dates/limit1..50/signed scoped cursor. 200 metrics/items/asOf/sourceVersion/nextCursor or 202 INTEGRATION_PENDING. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422 for session/role/filter/cursor; invalid source ->503; missing source ->202 SRS widgets beyond the listed current metrics remain partial; no revenue/order/complaint-age value is fabricated. A read-only snapshot transaction has no command identity, audit event or money effect..

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/controllers/dashboard-read.controller.js; backend/src/services/dashboards/read-projection.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/admin-dashboard.service.js.

### 16.3 UC-77 — View Customer Dashboard

Diagram source: sequence/uc-77.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: CUSTOMER session; actor-derived scope; validated dates/limit1..50/signed scoped cursor. 200 metrics/items/asOf/sourceVersion/nextCursor or 202 INTEGRATION_PENDING. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422 for session/role/filter/cursor; invalid source ->503; missing source ->202 SRS widgets beyond the listed current metrics remain partial; no revenue/order/complaint-age value is fabricated. A read-only snapshot transaction has no command identity, audit event or money effect..

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/controllers/dashboard-read.controller.js; backend/src/services/dashboards/read-projection.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/customer-dashboard.service.js.

### 16.4 UC-81 — View Staff Dashboard

Diagram source: sequence/uc-81.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: STAFF (ADMIN inherits Staff permission) session; actor-derived scope; validated dates/limit1..50/signed scoped cursor. 200 metrics/items/asOf/sourceVersion/nextCursor or 202 INTEGRATION_PENDING. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422 for session/role/filter/cursor; invalid source ->503; missing source ->202 SRS widgets beyond the listed current metrics remain partial; no revenue/order/complaint-age value is fabricated. A read-only snapshot transaction has no command identity, audit event or money effect..

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/controllers/dashboard-read.controller.js; backend/src/services/dashboards/read-projection.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/staff-dashboard.service.js.

### 16.5 UC-83 — View Pet Sitter Dashboard

Diagram source: sequence/uc-83.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: PET_SITTER session; actor-derived scope; validated dates/limit1..50/signed scoped cursor. 200 metrics/items/asOf/sourceVersion/nextCursor or 202 INTEGRATION_PENDING. Server access and current source/state checks remain authoritative.

Alternative and recovery: 401/403/422 for session/role/filter/cursor; invalid source ->503; missing source ->202 SRS widgets beyond the listed current metrics remain partial; no revenue/order/complaint-age value is fabricated. A read-only snapshot transaction has no command identity, audit event or money effect..

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/controllers/dashboard-read.controller.js; backend/src/services/dashboards/read-projection.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/sitter-dashboard.service.js.

### 16.6 UC-89 — View Operational Reports

Diagram source: sequence/uc-89.drawio. Actor: Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: ADMIN session; approved report visibility, UTC/local-time range and bounded signed pagination; no arbitrary export fields. Proposed report rows/asOf/sourceVersion/filters/cursor with explicit reconciliation gaps. Server access and current source/state checks remain authoritative.

Alternative and recovery: Current analytics invalid days ->422, missing collections ->503; complete financial report pending until reader and policy/source gates are implemented Do not relabel operational count analytics as revenue/payment/refund acceptance or invent financial totals..

Source references: backend/src/services/dashboards/workspace-analytics.service.js; backend/src/routes/dashboard-runtime.routes.js.

### 16.7 UC-90 — View Audit Log

Diagram source: sequence/uc-90.drawio. Actor: Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Current authorized audit reader and bounded scoped filter/cursor, no private secret projection. Read immutable actor/time/visit/decision metadata; writer is a separate proposed assigned-care integration. Server access and current source/state checks remain authoritative.

Alternative and recovery: No audit event is fabricated from current accessNotes; query performs no write/replay; denied-before-load may lack source hash/version.

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/mongo-payroll.repository.js; doc/reports/report4/planned-schema-inventory.json.

### 16.8 UC-94 — View Sale Staff Dashboard

Diagram source: sequence/uc-94.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Role assignment/permissions must be approved and implemented first; current order/product permissions are Admin-only. Proposed authorized sales workspace DTO after role/source gates pass. Server access and current source/state checks remain authoritative.

Alternative and recovery: Current nonexistent role cannot be treated as authorized; keep DESIGN_PENDING_RUNTIME until actual role, reader and dependent schema are implemented Admin inherits no invented SALE_STAFF identity; a design page is not a mounted dashboard or approved role migration..

Source references: backend/src/constants/product-permissions.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/services/product-sales/product-management.service.js.

## 17. Notifications and Delivery Preferences

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 17.1 Class Diagram

Diagram source: class/class-notifications.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/notifications/notification.service.js; backend/src/services/notifications/domain-notifications.service.js; backend/src/controllers/notification.controller.js.

NotificationService operations: list(options); markRead(options); publish(options); updatePreferences(options); registerPushSubscription(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

DomainNotifications operations: productOrder(options, session); payment(options, session); payroll(options, session); application(options, session); visit(options, session). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 17.2 UC-88 — View Notifications

Diagram source: sequence/uc-88.drawio. Actor: Signed-in user (CUSTOMER / PET_SITTER / STAFF / ADMIN). State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Authenticate recipient/current roles and bounded signed-cursor query; GET is read-only. GET lists scoped notifications. Separate POST /api/v1/notifications/:id/read-receipts with CSRF sets readAt only on an owned notification; repeat returns ALREADY_READ. Server access and current source/state checks remain authoritative.

Alternative and recovery: Foreign recipient or hidden role scope -> not found; invalid session/CSRF rejected; no cross-user read receipt.

Source references: backend/src/services/reviews/review.service.js; backend/src/services/notifications/notification.service.js; backend/src/models/sitter-public-profile.model.js.

## 18. AI Feature Provenance, Training and Model Lifecycle

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 18.1 Class Diagram

Diagram source: class/class-ai-lifecycle.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

ModelRegistry operations: status(actor); importArtifact(actor, body); review(actor, modelId, body, key). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

TrainingDatasetExporter operations: collect(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 18.2 AI-01 — Inspect training readiness

Diagram source: sequence/ai-01.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: TrainingReadinessService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Active Admin and bounded500-row/eight-second source join; verify booking/review/completion credit/event and decision-time features, excluding synthetic or changed sources. Return counts, exclusions, truncation, missing200-observation/50-group amounts and next step without private training rows or export key. Persistence semantics: Return counts/blockers only; no export/train/approval or business write.

Alternative and recovery: Readiness does not export/train/import/approve/assign; budget timeout503 or truncation requires offline full audit.

Source references: backend/src/services/ai-training/training-readiness.service.js; backend/src/services/ai-training/dataset-export.service.js.

### 18.3 AI-02 — Export verified training observations

Diagram source: sequence/ai-02.drawio. Actor: Operator CLI. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: TrainingDatasetExporter. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Explicit --apply, new private backend/storage/ai JSONL path and32-character export secret; verified exact source join, >=200 observations, >=50 booking groups, no truncation. HMAC opaque booking/review IDs and write private immutable wx/0600 JSONL, then source/hash manifest; dry run emits aggregate counts only. Server access and current source/state checks remain authoritative.

Alternative and recovery: Source/path/existing output/data gate failure rejects. JSONL and manifest are sequential files and partial output may remain; no representative-quality, training or approval claim.

Source references: backend/src/services/ai-training/dataset-export.service.js; backend/scripts/ai/export-training-data.js.

### 18.4 AI-03 — Train and bundle a draft additive model

Diagram source: sequence/ai-03.drawio. Actor: Offline trainer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: OfflinePythonTrainer. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Offline verified-label JSONL with unique opaque observations, five finite features and featuresAsOf<=decision<outcome; >=200 observations/50 booking groups. Group-aware chronological80/20 holdout, purge crossing training groups, projected-gradient five weights and baseline MAE; write DRAFT model then evidence sequentially; separately validate and ZIP matching files. Server access and current source/state checks remain authoritative.

Alternative and recovery: Insufficient disjoint rows/groups, temporal leakage or hash mismatch rejects; partial files may remain. Bundle does not import/approve/activate and OSRM is not satisfaction ground truth.

Source references: backend/scripts/ai/train_model.py; backend/scripts/ai/bundle_model.py.

### 18.5 AI-04 — Import draft artifact and evidence

Diagram source: sequence/ai-04.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: ModelRegistry. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Authenticated Admin; exact DRAFT artifact<=32KB, past trainedUntil, valid weights/MAE/counts, matching original-byte SHA256 and chronological verified-label evidence. Read immutable model version; same artifact/evidence returns existing view, otherwise create DRAFT with private original artifact/evidence/content hash and reviewVersion0. Server access and current source/state checks remain authoritative.

Alternative and recovery: Version with different bytes/evidence409; import has content/version idempotence, not a generic command-key store. Separate independent source/evaluation review required before approval.

Source references: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

### 18.6 AI-05 — Approve and activate a reviewed model

Diagram source: sequence/ai-05.drawio. Actor: Admin after independent source review. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: ModelRegistry. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Separate DRAFT import and independent source/evaluation process; review request validates current ADMIN, operation fingerprint, activation guard and reviewVersion. APPROVE verifies original artifact/evidence hashes, chronological provenance and improved MAE, retires prior approved models, CAS activates selected model and records durable review in one transaction; RETIRE is a separate alternative. Server access and current source/state checks remain authoritative.

Alternative and recovery: Missing/mismatched evidence, unimproved MAE or stale review version rejects with no partial activation. ReviewReference is not proof of independent actor; inference falls back to rules if no usable approved model.

Source references: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

### 18.7 AI-06 — Retire model and use rule fallback

Diagram source: sequence/ai-06.drawio. Actor: Admin / Runtime. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: ModelRegistry / RuleScoring. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Admin RETIRE request with current model reviewVersion/key/reason/reference; current active Admin and activation guard rechecked transactionally. Explicit RETIRE CAS and review audit/result share transaction; separate ranking read validates approved model hash/weights/improved MAE and falls back to approved explainable policy when absent/invalid. Server access and current source/state checks remain authoritative.

Alternative and recovery: Runtime validation failure does not persist RETIRE. Another approved usable model may remain; otherwise rules apply. No pricing/eligibility/assignment or financial mutation.

Source references: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

### 18.8 AI-07 — Check vet-escort route and appointment feasibility

Diagram source: sequence/ai-07.drawio. Actor: Customer; Staff handles review exceptions. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: RecommendationService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owned confirmed pets/home/clinic and same-day slot; vet-specific appointment/wait15..240/return scope; real road legs and buffered whole plan must fit. Validate clinic outward/optional return legs<=45minutes with buffers, then bounded capability/schedule insertion/score and five-minute MATCH snapshot. Server access and current source/state checks remain authoritative.

Alternative and recovery: Missing/long/unavailable/infeasible clinic plan returns review/conflict. Specialized clinic MATCH checkout explicitly returns MATCH_SCOPE_REVIEW_REQUIRED; recommendation never assigns or pays hospital costs.

Source references: backend/src/services/sitter-matching/recommendation.service.js; backend/src/services/booking-proposals/match-selection.service.js.

### 18.9 AI-08 — Advise an operational employee invitation shortlist

Diagram source: sequence/ai-08.drawio. Actor: Dispatch service. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: OperationalRanker. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Authoritative eligible sitter IDs supplied by dispatch, confirmed HOME point/pets; validate optional model and bounded schedule/statistics/routing with abort signal. Up to four workers score feasible known profiles; return exact permutation including unscored original IDs and in-memory point-in-time feature snapshot. Persistence semantics: Return ranked IDs and featureSnapshot in memory; no invitation/assignment/money write. Route cache may persist separately.

Alternative and recovery: Routing/statistics failure cannot delete an otherwise eligible supplied ID; dispatch validates permutation or retains deterministic order. Only technical route cache may write, no invitation/assignment/money mutation.

Source references: backend/src/services/sitter-matching/operational-ranker.service.js; backend/src/services/employee-scheduling/employee-dispatch.service.js.

## 19. Employment Documents and Applicant Self-Service

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 19.1 Class Diagram

Diagram source: class/class-employment.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/payroll/employment-document.service.js; backend/src/services/applications/application-status-runtime.service.js; backend/src/controllers/employment-document.controller.js.

EmploymentDocumentService operations: get(actor, applicationId); save(actor, applicationId, body, key); decide(actor, applicationId, documentId, body, key); activate(application, employeeId, actor, session). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

ApplicationStatusRuntimeService operations: createApplicationStatusRuntimeService(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 19.2 EMP-01 — Track and edit an owned pending application

Diagram source: sequence/emp-01.drawio. Actor: Signed-in applicant. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: SitterApplicationService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Verified active applicant account/current authEpoch, owned application or unowned legacy verified-contact match; edit requires PENDING/current version and exact allowed fields. Owned GET decrypts allowlisted status/particulars/timeline without second OTP; separate update verifies new private documents then CASes encrypted PENDING fields and audit replay result under current owner guard. Server access and current source/state checks remain authoritative.

Alternative and recovery: Processed record is read-only; current Admin review/owner edit race409, duplicate identity/cooldown denied. Self-edit cannot grant PET_SITTER or activate contract.

Source references: backend/src/services/sitter-application.service.js; backend/src/routes/sitter-application.routes.js.

### 19.3 EMP-02 — Issue, sign and activate an employment document

Diagram source: sequence/emp-02.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: EmploymentDocumentService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Each request requires current Admin/session/CSRF and its own payload-bound operation key. Save requires INTERVIEW stage, matching identity, applicationVersion and expectedRevision. Separate save creates DRAFT; separate ISSUE checks latest DRAFT/hash/version and marks ISSUED; separate SIGN records real both-party/archive/date evidence and marks SIGNED. A later application APPROVE transaction promotes the eligible account, calls activate with the same session, creates the contract/status and commits application/audit/mail intent together. Server access and current source/state checks remain authoritative.

Alternative and recovery: Each request replays only its own same-key/payload outcome; stale revision/hash/state or missing signed contract returns conflict and approval rollback. No signature is fabricated.

Source references: backend/src/services/payroll/employment-document.service.js; backend/src/services/applications/application-status-runtime.service.js; backend/src/controllers/employment-document.controller.js.

### 19.4 EMP-03 — Prefill and print a versioned contract

Diagram source: sequence/emp-03.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: EmploymentDocumentService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Admin-authorized application and selected immutable document revision; optional prefill only at INTERVIEW when latest document is not SIGNED/ACTIVATED. Read private application/revisions, write separate CONTRACT_READ PayrollEvent audit, then allowlist verified contact/identity suggestions; browser prints selected saved revision without source rewrite. Persistence semantics: Return authorized prefill/document data; print is browser presentation, no source rewrite.

Alternative and recovery: This GET has an audit DB write. Missing historical originals warn; private identity HMAC/decrypt failure503. Saved terms override suggestions and print does not sign/issue/save.

Source references: backend/src/services/payroll/employment-document.service.js; backend/src/services/payroll/employment-prefill.service.js.

## 20. Legacy Earnings, Holds and Settlement Reconciliation

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 20.1 Class Diagram

Diagram source: class/class-settlement.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/admin-settlement.service.js; backend/src/controllers/admin-settlement.controller.js.

CommandRunner operations: readOwn(options); withdraw(options); submit(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

AdminSettlementService operations: list(options); decide(input); recordTransfer(input). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 20.2 FIN-01 — Reserve and submit legacy weekly settlement

Diagram source: sequence/fin-01.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: SettlementService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owned eligible legacy earning IDs, ready approved financial policy/decision versions, durable indexes and transactionally sampled Vietnam weekly quota. Command fingerprint replay, unique sitter/week claim, guarded exact AVAILABLE-to-RESERVED slices, SUBMITTED immutable request and ledger/event/result commit together. Server access and current source/state checks remain authoritative.

Alternative and recovery: Missing policy/payment/tax/completion, active holds, invalid ledger/quota or stale reservation blocks. Separate employee payroll is not this legacy settlement and no bank send occurs.

Source references: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/mongo-settlement.repository.js.

### 20.3 FIN-02 — Approve, reject or withdraw settlement

Diagram source: sequence/fin-02.drawio. Actor: Admin / Owner. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: SettlementService /
AdminSettlementService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Admin APPROVE/REJECT or owning sitter WITHDRAW, exact current request version, SUBMITTED state and approved action policy. Separate guarded commands approve immutable reserved amount or release slices to HELD/AVAILABLE as active locks require; request CAS, audit/ledger/event/result share transaction. Server access and current source/state checks remain authoritative.

Alternative and recovery: Approved onward cannot be silently withdrawn; any transfer, hold, version or reservation mismatch blocks/rolls back. Approval does not execute bank transfer.

Source references: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/admin-settlement.service.js.

### 20.4 FIN-03 — Record transfer and reconcile uncertain result

Diagram source: sequence/fin-03.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: AdminSettlementService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Admin/current approved request version, immutable reserved amount, exact owned private transfer evidence and unique transfer/evidence references; valid real paidAt for confirmed result. Exact CONFIRMED transfer settles reserved ledger slices and request PAID atomically; UNKNOWN or amount mismatch records attempt and TRANSFER_PENDING retaining reserved funds and reference claims. Server access and current source/state checks remain authoritative.

Alternative and recovery: UNKNOWN is transfer outcome, not a payroll state. Reconcile real evidence before later confirmation; replay or conflicting reference must not double-pay, release or reuse uncertain reference.

Source references: backend/src/services/settlements/admin-settlement.service.js; backend/src/services/settlements/mongo-settlement.repository.js.

### 20.5 FIN-04 — Apply and release a case or refund money hold

Diagram source: sequence/fin-04.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: BookingFinancialHolds. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Authorized case/refund caller supplies actual shared transaction session, audited actor and exact CASE/REFUND source reference; touch shared booking finance guard and bounded earnings. Lock exact source and AVAILABLE-to-HELD ledger slices; already paid sources create pending Admin-reviewed adjustment; explicit final release only unlocks exact lock and moves funds when no other active lock remains. Server access and current source/state checks remain authoritative.

Alternative and recovery: No automatic clawback or guessed liability amount; outer caller commits/rolls back. Other active locks and invalid ledger still block availability.

Source references: backend/src/services/settlements/booking-financial-holds.service.js; backend/src/services/settlements/mongo-settlement.repository.js.

## 21. Background Jobs and Durable Application Mail

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 21.1 Class Diagram

Diagram source: class/class-jobs.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

ApplicationMailService operations: enqueue(application, session); runBatch(options); list(applicationId). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

EmployeeDispatchWorker operations: stop(). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 21.2 JOB-01 — Publish visit reminders

Diagram source: sequence/job-01.drawio. Actor: Scheduled job. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: VisitReminderJob. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Exported helper has repository/notifier ports, local inFlight coalescing, bounded upcoming query and Vietnam-time future active visit/reminder/recipient checks. Per eligible schedule-version reminder, optional obsolete invalidation/atomic reservation, notifier send and optional delivered/failed recording; stable identity deduplication is adapter contract. Server access and current source/state checks remain authoritative.

Alternative and recovery: Job does not mutate Visit. Optional port methods do not prove durable runtime deduplication or startup; ACCEPTED is not inbox delivery.

Source references: backend/src/jobs/visit-reminder.job.js.

### 21.3 JOB-02 — Dispatch invitations and expire unanswered offers

Diagram source: sequence/job-02.drawio. Actor: Employee dispatch worker. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: EmployeeDispatchService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Non-overlapping worker; bounded current SCHEDULED queue with approved care plan/payment context, retryAt and current version. For each row call replayable invite with deterministic visit/version key; bounded eligibility and advisory ordering, expire old offers, CAS visit and create next bounded invitations/events; known no-candidate/schedule conflicts CAS Staff review. Server access and current source/state checks remain authoritative.

Alternative and recovery: Started shifts escalate for real customer schedule resolution; guard/CAS failure rolls back one invitation command, non-409 logs batch failure; UC-35 separately accepts/declines and rechecks occupancy.

Source references: backend/src/jobs/employee-dispatch.job.js; backend/src/services/employee-scheduling/employee-dispatch.service.js.

### 21.4 JOB-03 — Reconcile payment reminders and overdue state

Diagram source: sequence/job-03.drawio. Actor: Payment job. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: PaymentReminderOverdueJob. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Repository-supplied due array; payment UNPAID, hold CLEAR, provider NONE or FAILED and valid dueAt<=asOf; local concurrent run coalescing. Send reminder with stable paymentId/dueAt identity via notifier; count only ACCEPTED as reminded and isolate failed/uncertain/missing responses. Server access and current source/state checks remain authoritative.

Alternative and recovery: Current helper does not reconcile provider, change payment/bill or mark OVERDUE; cadence/deadline policies are integration gates. It does not itself enforce a numeric candidate-count bound.

Source references: backend/src/jobs/payment-reminder-overdue.job.js.

### 21.5 JOB-04 — Expire unpaid or uncollected product holds

Diagram source: sequence/job-04.drawio. Actor: Scheduled job. State: DESIGN_PENDING_RUNTIME. Service owner: ProductHoldExpiryJob «design». Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Proposed bounded scheduler requires approved payment/pickup deadline policy, authoritative current order/payment/deadline/version and explicit composition ownership. Proposed transaction deduplicates order/deadline/source identity, cancels only still-eligible unshipped order and releases exact quantityHeld once, preserving stockOnHand and notification intent. Server access and current source/state checks remain authoritative.

Alternative and recovery: DESIGN_PENDING_RUNTIME: current manual cancel is guarded CAS without stored replay; no full deadline job inferred. Uncertain payment, shipped state or missing policy requires review; prepaid timeout is not automatic refusal.

Source references: backend/src/services/product-sales/product-order-management.service.js; doc/reports/report4/planned-schema-inventory.json.

### 21.6 JOB-05 — Recompute approved customer tier

Diagram source: sequence/job-05.drawio. Actor: Scheduled job. State: DESIGN_PENDING_RUNTIME. Service owner: TierAssessmentJob «design». Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Proposed annual assessment requires approved effective tier thresholds/discount policy and verified paid receipt IDs/versions, with explicit refund eligibility rules. Proposed source-hash assessment deduplicates customer/year/policy/receipts, computes safe integer annual eligible spend and CASes tier projection/event. Server access and current source/state checks remain authoritative.

Alternative and recovery: DESIGN_PENDING_RUNTIME: no approved tier source means no invented rank, discount or points; changed receipts/policy must be reviewed and recomputed.

Source references: doc/reports/report4/planned-schema-inventory.json.

### 21.7 JOB-06 — Plan a feasible sitter visit order

Diagram source: sequence/job-06.drawio. Actor: Route planning job. State: DESIGN_PENDING_RUNTIME. Service owner: RouteOrderPlanner «design». Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Proposed bounded route-order advice uses current authorized visits, registered day origin/windows, source versions and validated road matrix. Reuse existing insertion/timeline feasibility checks for nonoverlap/buffers/handover/breaks/caps; proposed bounded comparison returns advice after version recheck. Server access and current source/state checks remain authoritative.

Alternative and recovery: DESIGN_PENDING_RUNTIME: current scheduling helper is not a complete global route-order job. No assignment or traffic-model training; OSRM ETA is not live traffic/label.

Source references: backend/src/services/sitter-matching/scheduling.service.js.

### 21.8 JOB-07 — Flag late check-in and operational attention

Diagram source: sequence/job-07.drawio. Actor: Operational sweep. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: OperationalSweepJob. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Exported operational-deadlines sweep requires durable lease/fencing repository ports, limit<=100, expected state/version/time facts and60-second renewed lease. Normalize due no-arrival/no-checkout/handover/change events; atomic repository contract rechecks fencing/current facts and commits operational outbox, isolating candidates and releasing lease finally. Server access and current source/state checks remain authoritative.

Alternative and recovery: Visit/handover work emits notice, not terminal completion, salary fine or charge. Lost lease stops work; exported helper is not proof of composed live adapters/startup.

Source references: backend/src/jobs/operational-sweep.job.js.

### 21.9 MAIL-01 — Retry durable application-status email

Diagram source: sequence/mail-01.drawio. Actor: Application mail worker. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: ApplicationMailService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Application version intent committed before worker; one bounded batch, atomic due-PENDING lease, recheck exact verified recipient. Call SMTP after claim; CAS to ACCEPTED, UNKNOWN, bounded safe-retry PENDING, terminal FAILED or contact SKIPPED. Server access and current source/state checks remain authoritative.

Alternative and recovery: Uncertain SMTP outcome or expired SENDING lease -> UNKNOWN, no automatic retry; known-safe retry only below three attempts; acceptance is not inbox delivery.

Source references: backend/src/jobs/application-mail.job.js; backend/src/services/applications/application-mail.service.js.

## 22. Map, Private Media and Public Contact Boundaries

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 22.1 Class Diagram

Diagram source: class/class-media-maps.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/maps/location-search.service.js; backend/src/services/private-image.service.js; backend/src/controllers/private-image.controller.js.

LocationSearchService operations: search(body); resolve(body). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PrivateImageService operations: upload(options); read(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 22.2 MAP-01 — Search and confirm a service-address map point

Diagram source: sequence/map-01.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: LocationSearchService (read provider); PetCareManagement (persist address). Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Search and resolve use separate session/CSRF-protected map requests and bounded provider calls; explicit pin confirmation is a later Customer decision. LocationSearchService returns suggestions/coordinates only. A separate POST or PATCH /api/v1/pet-care/addresses invokes PetCareManagement with owner/version/area/pin validation and a guarded replayable MongoDB command. Server access and current source/state checks remain authoritative.

Alternative and recovery: Provider timeout or invalid reference yields map error with no address write; unsupported area, missing pin confirmation, stale version or foreign owner fails the separate address command; existing booking snapshots stay unchanged.

Source references: backend/src/services/maps/location-search.service.js.

### 22.3 MAP-02 — Read road ETA and bounded route matrix

Diagram source: sequence/map-02.drawio. Actor: Matching / Dispatch service. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: RoutingService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Exact validated coordinates/directed namespace, deployed coverage, global<=50 points and commercial<=10points/100elements; bounded trusted provider/network/response. Vietmap commercial cacheTtlMs0 skips cache reads/writes; permitted OSRM path reads current edges and writes valid nonnull road ETA edges with15-minute expiry on misses. Server access and current source/state checks remain authoritative.

Alternative and recovery: No fabricated straight-line ETA, live-traffic/label claim or financial/assignment write. Null route or timeout/invalid response remains explicit unavailable/review.

Source references: backend/src/services/sitter-matching/routing.service.js; backend/src/services/sitter-matching/commercial-routing.service.js.

### 22.4 MEDIA-01 — Upload and read private care or applicant evidence

Diagram source: sequence/media-01.drawio. Actor: Owner / authorized Admin applicant reviewer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: PrivateImageService /
SitterApplicationService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owner-bound authenticated image key/digest/MIME/size/pixels/quota; separate Admin applicant-document authorization and application-bound reference. Reserve PENDING/quota transaction then normalize/upload private R2 outside transaction and mark READY; owner read verifies content digest/type/length; Admin document read commits quota/audit before provider read. Server access and current source/state checks remain authoritative.

Alternative and recovery: Private image API has no blanket Staff/Admin ownership bypass. Provider uncertainty retains upload slot; R2 read failure does not roll back recorded applicant-document read audit.

Source references: backend/src/services/private-image.service.js; backend/src/services/sitter-application.service.js.

### 22.5 MEDIA-02 — Replace an avatar or product photo

Diagram source: sequence/media-02.drawio. Actor: Owner / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: AvatarService /
ProductPhotoService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Avatar requires owner/pet scope, expectedVersion/key and bounded JPEG/PNG; product photo requires current Admin permission, Product.detailsVersion/index and bounded supported image. Avatar CAS retains version/present/fingerprint and unsets removed body; product flow updates Product.photos/detailsVersion, upserts normalized digest and deletes unretained product photo blobs transactionally. Server access and current source/state checks remain authoritative.

Alternative and recovery: No historical media-byte preservation is promised. ProductPhoto has no avatar-style tombstone or stored key replay; stale product operation must reload. Unauthorized, invalid image, stale version and missing reference fail explicitly.

Source references: backend/src/services/avatar.service.js; backend/src/services/product-sales/product-photo.service.js.

### 22.6 CONTACT-01 — Send a public contact enquiry

Diagram source: sequence/contact-01.drawio. Actor: Guest. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: ContactService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Same-origin public POST with three-per-hour limiter, exact six bounded validated consented fields and configured server inbox/provider. Await direct SYSTEM EMAIL notificationDelivery.send with a new random operationId for each request; return ACCEPTED or safe unavailable/uncertain error without contact DB write. Persistence semantics: External delivery only; no contact database write.

Alternative and recovery: Uncertain acknowledgement can mean mail was sent; no contact record/outbox/durable retry or cross-request deduplication store, and acceptance is not inbox delivery.

Source references: backend/src/services/contact.service.js.

### 22.7 PWA-01 — Install and recover the web application shell

Diagram source: sequence/pwa-01.drawio. Actor: Browser user. State: DESIGN_PENDING_RUNTIME. Service owner: ApplicationShell «design». Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Proposed HTTPS/browser capability, reviewed manifest/icons/service worker scope/version and lifecycle/privacy gates; manifest/SW absent in current frontend. Proposed cache allowlisted public shell assets only, explicit install/update UI; online authenticated API remains authoritative with private no-store. Server access and current source/state checks remain authoritative.

Alternative and recovery: DESIGN_PENDING_RUNTIME: no offline payment/booking/signature success, cached private API data, guaranteed background GPS or safe automatic financial replay.

Source references: doc/architecture/p37-sds-api-diagram-synchronization-v1.md.
