## 4. Identity, Authentication and Account Management

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 4.1 Class Diagram

Diagram source: class/class-identity.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/controllers/auth.controller.js.

OtpService operations: begin(options); verify(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

SessionService operations: authenticate(req); getCurrentUser(auth); verifyCsrf(auth, token); issueInTransaction(user, mongoSession, options); revoke(req); revokeUserSessions(userId, options); setCookie(res, issued, options); clearCookie(res, options); resumeCsrf(req, auth). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 4.2 UC-01 — Register Account

Diagram source: sequence/uc-01.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: verify REGISTER OTP and approved policy consents. create CUSTOMER + verified contact + session atomically. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: duplicate verified contact -> 409; invalid DTO -> 422. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.3 UC-02 — Log In

Diagram source: sequence/uc-02.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: consume valid LOGIN OTP; reload current account. issue opaque session only for ACTIVE allowed account. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: locked account -> 403 after valid OTP; never issue session. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.4 UC-03 — Log Out

Diagram source: sequence/uc-03.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: authenticate owned session. revoke session; clear pwc_session cookie. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: expired/missing session cannot revoke another user. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.5 UC-04 — Change Email or Phone Number

Diagram source: sequence/uc-04.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: verify new contact with purpose/session binding. replace verified contact under unique lookup and audit. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: wrong contact/purpose -> reject; lost sole channel needs verified support. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.6 UC-05 — Verify OTP

Diagram source: sequence/uc-05.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate challenge expiry, attempts, purpose and contact. consume once; dispatch verified purpose handler. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: expired/wrong/replayed code -> no account or session. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.7 UC-10 — Manage User Accounts

Diagram source: sequence/uc-10.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: authorize ADMIN; validate account target/version. update allowed membership/state and authEpoch + audit. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: no role escalation by customer; preserve membership constraints. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

### 4.8 UC-11 — Update Customer Profile

Diagram source: sequence/uc-11.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: authorize owner; allowlist displayName/profile input. persist profile; return acknowledgement and safe session projection. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: server validation keeps submitted form; no tier fabricated. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/otp-verification.service.js; backend/src/services/session.service.js; backend/src/services/customer-registration.service.js; backend/src/services/account-settings.service.js.

## 5. Pet Profiles and Service Addresses

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 5.1 Class Diagram

Diagram source: class/class-petandaddress.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/pet-care-management.service.js; backend/src/services/pet-care-context.service.js; backend/src/controllers/pet-care.controller.js.

PetCareManagement operations: catalog(); listPets(ownerId); listAddresses(ownerId, management); createPet(ownerId, body, key); createAddress(ownerId, body, key); update(ownerId, kind, resourceId, body, key); archive(ownerId, kind, resourceId, body, key). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PetCareContext operations: context(ownerId, input). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 5.2 UC-12 — Manage Service Addresses

Diagram source: sequence/uc-12.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate owner, area, confirmed map point and version. save/archive address without changing booked snapshots. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: active visits block archive; outside-area storage remains a gap. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/pet-care-management.service.js; backend/src/models/pet-care.model.js.

### 5.3 UC-13 — View Pet List

Diagram source: sequence/uc-13.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view pet list projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/pet-care-management.service.js; backend/src/models/pet-care.model.js.

### 5.4 UC-14 — Add Pet Profile

Diagram source: sequence/uc-14.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate owned DOG/CAT care fields; distinguish UNKNOWN. create pet + command replay result; upload owned avatar separately. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: invalid species/weight/photo -> reject without partial profile overwrite. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/pet-care-management.service.js; backend/src/models/pet-care.model.js.

### 5.5 UC-15 — Update Pet Profile

Diagram source: sequence/uc-15.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate owner/version and pet fields. save new pet revision; preserve care snapshots on existing visits. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: active visit blocks archive; foreign owner -> not found. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/pet-care-management.service.js; backend/src/models/pet-care.model.js.

## 6. Service Catalogue, Deterministic Pricing and Policies

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 6.1 Class Diagram

Diagram source: class/class-catalog.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/service-catalog.service.js; backend/src/services/pricing/pricing.service.js; backend/src/controllers/service-catalog.controller.js.

ServiceCatalogService operations: create(options); update(options); setPolicy(options); listAdmin(options); publicList(options); bookableSnapshot(serviceId, at). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PricingService operations: quote(ownerId, body); basket(ownerId, body); readDecision(ownerId, decisionId). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 6.2 UC-06 — View Home Page

Diagram source: sequence/uc-06.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view home page projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/service-catalog-runtime.js; backend/src/services/service-catalog.service.js; backend/src/services/pricing/pricing.service.js.

### 6.3 UC-07 — View Service List

Diagram source: sequence/uc-07.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view service list projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/service-catalog-runtime.js; backend/src/services/service-catalog.service.js; backend/src/services/pricing/pricing.service.js.

### 6.4 UC-08 — View Service Details

Diagram source: sequence/uc-08.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view service details projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/service-catalog-runtime.js; backend/src/services/service-catalog.service.js; backend/src/services/pricing/pricing.service.js.

### 6.5 UC-09 — View Service Areas and Policies

Diagram source: sequence/uc-09.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view service areas and policies projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/service-catalog-runtime.js; backend/src/services/service-catalog.service.js; backend/src/services/pricing/pricing.service.js.

### 6.6 UC-22 — Manage Services

Diagram source: sequence/uc-22.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: ADMIN validates catalog version and service scope. create versioned service + audit; preserve historical bookings. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: hide/delete cannot rewrite historical service snapshots. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/service-catalog-runtime.js; backend/src/services/service-catalog.service.js; backend/src/services/pricing/pricing.service.js.

### 6.7 UC-23 — Configure Service Prices

Diagram source: sequence/uc-23.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: ADMIN validates approved deterministic pricing policy. save immutable approved price/policy revision in integer VND. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: missing policy returns pending/error; AI never computes money. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/service-catalog-runtime.js; backend/src/services/service-catalog.service.js; backend/src/services/pricing/pricing.service.js.

### 6.8 UC-24 — Configure Booking Policies

Diagram source: sequence/uc-24.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: ADMIN validates versioned setting and approved policy source. save settings/audit; publish only approved terms/privacy versions. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: unapproved cancellation/refund liability text remains unpublished. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/service-catalog-runtime.js; backend/src/services/service-catalog.service.js; backend/src/services/pricing/pricing.service.js.

## 7. Booking Lifecycle, Changes and Cancellations

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 7.1 Class Diagram

Diagram source: class/class-booking.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js; backend/src/controllers/booking-checkout.controller.js.

BookingCheckoutService operations: options(actor); confirm(actor, body, key); read(actor, bookingId); paymentLink(actor, bookingId, key). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

CustomerBookingsService operations: list(actor, query). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 7.2 UC-25 — Create Booking

Diagram source: sequence/uc-25.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate owner-bound nonexpired QUOTE/MATCH and schedule feasibility. transaction: booking + visit snapshots + intent + idempotency/outbox. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: pet-time overlap/stale quote -> 409; PREPAY deadline 15 min. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js.

### 7.3 UC-26 — View My Bookings

Diagram source: sequence/uc-26.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view my bookings projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js.

### 7.4 UC-27 — View Booking Details

Diagram source: sequence/uc-27.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view booking details projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js.

### 7.5 UC-28 — View Visit Schedule

Diagram source: sequence/uc-28.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view visit schedule projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js.

### 7.6 UC-32 — View All Bookings

Diagram source: sequence/uc-32.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view all bookings projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js.

### 7.7 UC-39 — Cancel Booking or Visit

Diagram source: sequence/uc-39.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: authorize owner or STAFF; evaluate approved cancellation policy. logical design: guarded cancellation + audited ledger/refund proposal. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: do not copy unapproved 30% fee from older report. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js.

### 7.8 UC-84 — Request Booking Change

Diagram source: sequence/uc-84.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: customer requests time-only change with owner/version and cut-off. logical design: pending change preserves old schedule and price snapshot. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: no reschedule until Staff decision; original timings are older SRS requirements. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js.

### 7.9 UC-85 — Approve Booking Change

Diagram source: sequence/uc-85.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF verifies pending request deadline and new occupancy. logical design: guarded approved schedule or reasoned rejection/expiry. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: expiry preserves old slot; production composition remains incomplete. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/customer-bookings.service.js.

### 7.10 UC-49 — Pay for Booking

Diagram source: sequence/uc-49.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: read authoritative owned booking/intent and server amount. create payOS link; only verified webhook may record payment. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: redirect alone is not receipt; late/mismatch requires reconciliation. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/providers/payos/payment-webhook.service.js; backend/src/services/providers/payos/mongo-payment-webhook.repository.js.

### 7.11 UC-50 — View Unpaid Bookings

Diagram source: sequence/uc-50.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view unpaid bookings projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/providers/payos/payment-webhook.service.js; backend/src/services/providers/payos/mongo-payment-webhook.repository.js.

### 7.12 BOOK-01 — Quote and confirm a multi-line service basket

Diagram source: sequence/book-01.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: PricingService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate every owned pet/service line and approved price/policy version; care traits are capabilities unless an approved surcharge exists. Compute combo once across visit count, cap at 10 percent, snapshot each line and allocate the one order fee without double counting. Server access and current source/state checks remain authoritative.

Alternative and recovery: Any changed selection invalidates stale quote; no guessed tax or automatic extra trait fee.

Source references: backend/src/services/pricing/pricing.service.js; backend/src/services/pricing/pricing-calculation.service.js; backend/src/services/booking-proposals/checkout-snapshot.service.js.

### 7.13 BOOK-02 — Split boarding into employee care shifts

Diagram source: sequence/book-02.drawio. Actor: Checkout / Staff. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: BoardingCarePlan. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate confirmed customer visits, approved care plan and each service duration. Split boarding shifts to at most 480 minutes; allocate integer service-net snapshots by duration/remainders while preserving customer total and combo visit count. Persistence semantics: Return in-memory shift specifications; parent checkout transaction performs persistence.

Alternative and recovery: More than sixty shifts or missing operational facts requires review; shift time is not invented attendance.

Source references: backend/src/services/booking-proposals/boarding-care-plan.service.js; backend/src/services/booking-proposals/booking-care-plan.service.js.

## 8. Employee Availability, Invitations and Dispatch

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 8.1 Class Diagram

Diagram source: class/class-scheduling.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/controllers/employee-scheduling.controller.js.

EmployeeDispatchService operations: readContext(visitId, session); previewCandidates(actor, visitId, input); queue(actor); invite(actor, visitId, body, key); runBatch(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

EmployeeScheduleRepository operations: col(name); employeeGuard(sitterId, session, authEpoch); eligible(sitterId, visit, session, options); runGuard(options, work); find(sitterId, session); contractAt(sitterId, start, end, session); areaKeys(code). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 8.2 UC-29 — Set Working Hours

Diagram source: sequence/uc-29.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate signed contract and future effective self-registered windows. save availability revision under employee guard/version. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: availability is not attendance; no automatic base salary reduction. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.3 UC-30 — View Unassigned Visits

Diagram source: sequence/uc-30.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view unassigned visits projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.4 UC-31 — Assign Sitter to Visit

Diagram source: sequence/uc-31.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: recheck payment, care plan, employee eligibility and occupancy. create durable invitation; sitter acceptance performs assignment CAS. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: AI advice is not assignment; concurrent occupancy -> 409. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.5 UC-33 — Monitor Today's Visits

Diagram source: sequence/uc-33.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted monitor today's visits projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.6 UC-34 — View My Assignments

Diagram source: sequence/uc-34.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view my assignments projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.7 UC-35 — Accept or Decline Visit Offer

Diagram source: sequence/uc-35.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate owned pending offer, deadline and current employee eligibility. ACCEPT: CAS offer+visit+booking and revoke rivals; DECLINE: reason/event. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: expired/changed offer or already assigned visit -> conflict. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.8 UC-36 — View Visit Details

Diagram source: sequence/uc-36.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view visit details projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.9 UC-38 — Reassign Sitter

Diagram source: sequence/uc-38.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF verifies replacement eligibility, occupancy and old assignment. logical design: replace guarded assignment and require handover. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: production route composition/acceptance remains incomplete. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.10 UC-79 — Request Day Off

Diagram source: sequence/uc-79.drawio. Actor: Pet Sitter. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: verify employee/date and near-term assignment conflicts. logical design: day-off decision + guarded replacement invitations. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: date exclusions exist; full request/approval workflow remains incomplete. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.11 UC-80 — Manage Shift Schedule

Diagram source: sequence/uc-80.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: employee self-registers future windows after signed approval. save versioned availability with FT40h/PT20h contractual minimum. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Report3 fixed Admin-entered shifts superseded by approved 2026-11-05 decision. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

### 8.12 UC-82 — Withdraw from Visit

Diagram source: sequence/uc-82.drawio. Actor: Pet Sitter. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: verify assigned sitter and permitted withdrawal timing/reason. logical design: release assignment guard; reoffer with handover requirement. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: late withdrawal needs Staff action; complete runtime route pending. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/employee-scheduling/employee-dispatch.service.js; backend/src/services/employee-scheduling/employee-schedule.repository.js; backend/src/services/sitter-offer.service.js.

## 9. Care Instructions, Execution, Reports and Location

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 9.1 Class Diagram

Diagram source: class/class-care.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/controllers/assigned-care.controller.js.

AssignedCareService operations: get(actor, visitId); acknowledge(actor, visitId, body, key); accessNotes(actor, visitId). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

BookingFinanceSourceService operations: readVisit(current, visitId); checkIn(input); updateChecklist(input); checkOut(input); confirmAssessment(options); drain(options); enqueue(booking, session); touch(booking, session, fields). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 9.2 UC-37 — View Home Access Notes

Diagram source: sequence/uc-37.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: require assigned sitter, acknowledged care hash, handover and time window. return private access notes from immutable care snapshot only. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: current runtime window ends at visit.endAt; audit/checkout semantics need reconciliation. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/employee-scheduling/visit-travel.service.js.

### 9.3 UC-40 — Confirm Care Instructions

Diagram source: sequence/uc-40.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: verify customer owner and instruction cut-off/version. logical design: new instruction snapshot + assignee acknowledgement reset. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: current checkout captures care; later full update flow remains pending. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/employee-scheduling/visit-travel.service.js.

### 9.4 UC-41 — Confirm Handover

Diagram source: sequence/uc-41.drawio. Actor: Pet Sitter. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: verify replacement assignment and latest handover/care snapshot. logical design: record version-bound handover acknowledgement. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: replacement access/check-in denied until authoritative handover. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/employee-scheduling/visit-travel.service.js.

### 9.5 UC-42 — Check In

Diagram source: sequence/uc-42.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate assignee, time, acknowledgement and owned private CHECK_IN photo. bind media uniquely + guard visit IN_PROGRESS + event in transaction. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: unowned/missing evidence, stale assignment or reused photo -> reject. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/employee-scheduling/visit-travel.service.js.

### 9.6 UC-43 — Check Out

Diagram source: sequence/uc-43.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate assignee, checklist and owned CHECK_OUT photo. complete visit; evaluate whole booking; enqueue verified earning source. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: incomplete checklist/open money case never fabricates payable earnings. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/employee-scheduling/visit-travel.service.js.

### 9.7 UC-44 — Complete Visit Checklist

Diagram source: sequence/uc-44.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate required checklist item IDs against visit snapshot. guarded checklist updates with command replay and audit. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: each required item completed or allowed reason; stale version conflicts. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/employee-scheduling/visit-travel.service.js.

### 9.8 UC-45 — View Care Report

Diagram source: sequence/uc-45.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view care report projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/employee-scheduling/visit-travel.service.js.

### 9.9 UC-46 — View Dog Walk Location

Diagram source: sequence/uc-46.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: authorize visit owner/assignee and consented active travel session. replace short-lived latest coordinate and expire sharing on stop. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: current travel ETA is not complete dog-walk trail acceptance. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/employee-scheduling/visit-travel.service.js.

### 9.10 UC-78 — Track Visit Status

Diagram source: sequence/uc-78.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted track visit status projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/care/assigned-care.service.js; backend/src/services/settlements/booking-finance-source.service.js; backend/src/services/employee-scheduling/visit-travel.service.js.

### 9.11 TRAVEL-01 — Start, update and stop consented foreground travel sharing

Diagram source: sequence/travel-01.drawio. Actor: Assigned sitter / Authorized viewer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: VisitTravelService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate assigned visit, sharing consent, session version, fresh coordinate accuracy and bounded time window. Replace only the latest location, expose scoped ETA/map projection and expire/stop sharing; no historical travel trail retained. Server access and current source/state checks remain authoritative.

Alternative and recovery: Stale session, invalid coordinate, unsupported state or revoked assignment is rejected; real-device tracking acceptance remains separate.

Source references: backend/src/services/employee-scheduling/visit-travel.service.js; backend/src/models/employee-scheduling.model.js.

## 10. Incidents, Complaints and Refund Decisions

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 10.1 Class Diagram

Diagram source: class/class-cases.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/incidents/incident.service.js; backend/src/services/complaints/complaint.service.js; backend/src/controllers/complaint.controller.js.

IncidentService operations: report(options); create(options); list(options); listIncidents(options); detail(options); get(options); resolve(options); resolveIncident(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

ComplaintService operations: submit(options); create(options); createComplaint(options); submitComplaint(options); list(options); get(options); detail(options); review(options); resolve(options); object(options); disagree(options); decide(options); finalize(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 10.2 UC-47 — Report Incident

Diagram source: sequence/uc-47.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: authorize participant; validate visit-related private evidence. logical design: incident case + audited event and financial hold. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: incident router/export exists; end-to-end composition remains pending. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/incidents/incident.service.js; backend/src/services/complaints/complaint.service.js; backend/src/services/complaints/mongo-complaint.repository.js; backend/src/services/refunds/refund.service.js.

### 10.3 UC-48 — Resolve Incident

Diagram source: sequence/uc-48.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF records evidence/follow-up; ADMIN authorizes money decision. logical design: resolve incident with audited reason and money hold rules. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: no guessed liability amounts or automatic payout. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/incidents/incident.service.js; backend/src/services/complaints/complaint.service.js; backend/src/services/complaints/mongo-complaint.repository.js; backend/src/services/refunds/refund.service.js.

### 10.4 UC-51 — Process Refund

Diagram source: sequence/uc-51.drawio. Actor: Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: ADMIN verifies source case, paid receipt, cap and approved decision. logical design: approved refund record + external transfer reconciliation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: no refund API success without actual evidence; no invented tax/refund rate. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/incidents/incident.service.js; backend/src/services/complaints/complaint.service.js; backend/src/services/complaints/mongo-complaint.repository.js; backend/src/services/refunds/refund.service.js.

### 10.5 UC-52 — Submit Complaint

Diagram source: sequence/uc-52.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: verify customer owner and completed visit/booking deadline. persist complaint + case/booking finance guard + notification atomically. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: duplicate/late complaint or foreign booking -> reject. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/incidents/incident.service.js; backend/src/services/complaints/complaint.service.js; backend/src/services/complaints/mongo-complaint.repository.js; backend/src/services/refunds/refund.service.js.

### 10.6 UC-53 — Handle Complaint

Diagram source: sequence/uc-53.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: authorize STAFF/ADMIN and current case version/evidence. record proposed/final decision; retain financial hold until finality. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: customer disagreement follows audited escalation; no direct arbitrary balance write. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/incidents/incident.service.js; backend/src/services/complaints/complaint.service.js; backend/src/services/complaints/mongo-complaint.repository.js; backend/src/services/refunds/refund.service.js.

### 10.7 UC-86 — View Incidents

Diagram source: sequence/uc-86.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view incidents projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/incidents/incident.service.js; backend/src/services/complaints/complaint.service.js; backend/src/services/complaints/mongo-complaint.repository.js; backend/src/services/refunds/refund.service.js.

## 11. Employee Payroll, Salary Advances and Adjustments

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 11.1 Class Diagram

Diagram source: class/class-payroll.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/payroll/payroll.service.js; backend/src/services/payroll/payroll-adjustment.service.js; backend/src/controllers/payroll.controller.js.

PayrollService operations: payrollEmployees(actor); previewStatement(actor, body); prepareAutomaticStatement(actor, body, key); recordContract(actor, body, key); own(actor, query); submitAdvance(actor, body, key); decideAdvance(actor, advanceId, body, key); overview(actor); prepareStatement(actor, body, key, sourceDraft); decideStatement(actor, statementId, body, key); listStatements(actor, query); listAdvances(actor, query). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PayrollAdjustmentService operations: submitAdjustment(actor, body, key); decideAdjustment(actor, adjustmentId, body, key); listAdjustments(actor, query). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 11.2 UC-20 — View Sitter Earnings

Diagram source: sequence/uc-20.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view sitter earnings projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/models/payroll.model.js; backend/src/services/settlements/settlement.service.js.

### 11.3 UC-75 — Review Pay Statement

Diagram source: sequence/uc-75.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: read signed contract, verified credit and current statement version. employee reviews statement; payroll correction is separate audited revision. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: FT10m/PT3m gross monthly; schedule is not attendance; no invented deductions. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/models/payroll.model.js; backend/src/services/settlements/settlement.service.js.

### 11.4 UC-76 — Close Pay Statement

Diagram source: sequence/uc-76.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: ADMIN verifies statement objections, agreed adjustments and transfer reference. close/pay recorded statement; retain original and separate later adjustments. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: UNKNOWN transfer requires reconciliation; no automatic clawback. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/models/payroll.model.js; backend/src/services/settlements/settlement.service.js.

### 11.5 PAY-01 — Request and decide a salary advance

Diagram source: sequence/pay-01.drawio. Actor: Pet Sitter / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: PayrollService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Require active signed employment, approved monthly base, at most 50 percent and one approved advance/month. Submit/withdraw/reject/approve under month guard; retain rejection reason and agreed payroll offset. Server access and current source/state checks remain authoritative.

Alternative and recovery: Pending concurrent request or exhausted approved quota -> reject; no interest or fabricated statutory case.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/models/payroll.model.js.

### 11.6 PAY-02 — Prepare source-based payroll and selected payslip print

Diagram source: sequence/pay-02.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: PayrollService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Load signed terms, verified service credits and explicit attendance/KPI source decisions. Prepare immutable statement snapshots, agreed deductions/advances and identity reference; print selected statement. Server access and current source/state checks remain authoritative.

Alternative and recovery: Availability is not attendance; unresolved source/deduction remains pending rather than reduce salary.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/services/payroll/payroll-draft.service.js.

### 11.7 PAY-03 — Record a separate payroll adjustment

Diagram source: sequence/pay-03.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: PayrollAdjustmentService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Require original statement reference, agreed reason/evidence and immutable source claim. Record supplement or agreed reconciliation separately; claim transfer reference exactly once. Server access and current source/state checks remain authoritative.

Alternative and recovery: Original paid statement stays unchanged; UNKNOWN transfer requires reconciliation.

Source references: backend/src/services/payroll/payroll-adjustment.service.js; backend/src/models/payroll.model.js.

## 12. Product Catalogue, Cart, Orders and Returns

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 12.1 Class Diagram

Diagram source: class/class-productsales.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/controllers/product-order-management.controller.js.

ProductOrderService operations: place(actor, body, idempotencyKey); list(actor, query); read(actor, orderId). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

ProductOrderManagementService operations: list(actor, query); read(actor, orderId); handToCarrier(actor, orderId, body); markReady(actor, orderId, body); handToCustomer(actor, orderId, body); markDelivered(actor, orderId, body); markReturning(actor, orderId, body); confirmReturned(actor, orderId, body); recordPayment(actor, orderId, body); cancel(actor, orderId, body). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 12.2 UC-55 — Browse Products

Diagram source: sequence/uc-55.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted browse products projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.3 UC-56 — View Product Details

Diagram source: sequence/uc-56.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view product details projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.4 UC-57 — Manage Products

Diagram source: sequence/uc-57.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: ADMIN validates product detailsVersion and owned image input. persist create/edit/hide/delete reason audit + bounded photo blobs. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: new product defaults hidden; stock version separate from detailsVersion. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.5 UC-61 — Manage Shopping Cart

Diagram source: sequence/uc-61.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate owned cart line and current sellable stock. add/change/remove cart lines; recompute authoritative totals. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: selected-line checkout missing; current placement consumes whole cart. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.6 UC-62 — Place Product Order

Diagram source: sequence/uc-62.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate full cart, receive/payment method, address and refusal count. transaction: order snapshots + conditional stock holds + command key. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: shortage/conflict rollback; tier/provider completeness remains gated. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.7 UC-63 — View My Orders

Diagram source: sequence/uc-63.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view my orders projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.8 UC-64 — Prepare and Ship Order

Diagram source: sequence/uc-64.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF checks order state/version and carrier tracking data. hand-to-carrier: release hold and decrement stock exactly once. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: carrier booking is external/manual; repeated command must not double decrement. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.9 UC-65 — Update Delivery Status

Diagram source: sequence/uc-65.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF verifies current delivery state and recorded carrier result. mark delivered or returning with reason; no return stock credit here. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: stale transition rejected; no claim of automatic carrier integration. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.10 UC-66 — Confirm Returned Order

Diagram source: sequence/uc-66.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF inspects returned parcel; validate per-line resellable quantity. confirm return once; credit only sellable units; record attributable refusal. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: unresellable goods never restocked; prepaid refund remains reconciliation. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.11 UC-67 — Hand Over Pick-up Order

Diagram source: sequence/uc-67.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF verifies pick-up READY state and full payment. guarded hand-to-customer; release hold and decrement stock once. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: unpaid/stale pickup cannot complete; no false provider acceptance. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.12 UC-68 — Sell at Counter

Diagram source: sequence/uc-68.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF validates counter lines and verified customer if supplied. logical design: held counter order then verified paid stock decrement. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: counter UI/provider lifecycle not fully composed. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.13 UC-92 — Report Faulty Product

Diagram source: sequence/uc-92.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: owner validates paid order, claim deadline and private evidence. logical design: persist faulty/wrong-product claim with version/audit. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: not a change-of-mind return; no silent stock increase. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

### 12.14 UC-93 — Handle Faulty Product Claim

Diagram source: sequence/uc-93.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF inspects claim; ADMIN approves same-product exchange or refund. logical design: one audited resolution and verified stock/transfer effect. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: faulty goods never become sellable inventory; runtime integration pending. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/product-sales/product-order.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/models/product.model.js.

## 13. Suppliers, Goods Receipts and Stock Control

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 13.1 Class Diagram

Diagram source: class/class-stock.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/product-sales/supplier-management.service.js; backend/src/services/product-sales/product-order-management.service.js; backend/src/controllers/supplier-management.controller.js.

SupplierManagementService operations: list(actor, query); read(actor, supplierId); create(actor, body); update(actor, supplierId, body); stop(actor, supplierId, body); resume(actor, supplierId, body). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

ProductOrderManagementService operations: list(actor, query); read(actor, orderId); handToCarrier(actor, orderId, body); markReady(actor, orderId, body); handToCustomer(actor, orderId, body); markDelivered(actor, orderId, body); markReturning(actor, orderId, body); confirmReturned(actor, orderId, body); recordPayment(actor, orderId, body); cancel(actor, orderId, body). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 13.2 UC-69 — Manage Suppliers

Diagram source: sequence/uc-69.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: ADMIN validates supplier normalized unique name/contact/products. create/update/stop/resume supplier under version guard. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: duplicate normalized name -> conflict; old receipt history retained. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/product-sales.routes.js; backend/src/services/product-sales/supplier-management.service.js; backend/src/models/product.model.js.

### 13.3 UC-70 — Record Goods Receipt

Diagram source: sequence/uc-70.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF validates supplier and received/accepted/rejected quantities. logical design: immutable goods receipt; increase accepted stock only. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: PR158 unmerged at baseline; do not model it as deployed code. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/product-sales.routes.js; backend/src/services/product-sales/supplier-management.service.js; backend/src/models/product.model.js.

### 13.4 UC-71 — View Stock

Diagram source: sequence/uc-71.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view stock projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/product-sales.routes.js; backend/src/services/product-sales/supplier-management.service.js; backend/src/models/product.model.js.

### 13.5 UC-95 — Adjust Stock

Diagram source: sequence/uc-95.drawio. Actor: Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: ADMIN validates required reason, integer delta, version and available stock. logical design: append immutable adjustment; guarded nonnegative stock delta. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: do not edit old receipts or decrease reserved stock; feature not deployed. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/product-sales.routes.js; backend/src/services/product-sales/supplier-management.service.js; backend/src/models/product.model.js.

## 14. Shop Grooming and Pet Handover

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 14.1 Class Diagram

Diagram source: class/class-grooming.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/booking-proposals/boarding-care-plan.service.js; backend/src/controllers/booking-checkout.controller.js.

BookingCheckoutService operations: options(actor); confirm(actor, body, key); read(actor, bookingId); paymentLink(actor, bookingId, key). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

BoardingCarePlan operations: boardingCarePlan(booking, shiftMinutes). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 14.2 UC-58 — Book Grooming Appointment

Diagram source: sequence/uc-58.drawio. Actor: Customer. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate shop service/pets, requested slot and price snapshot. create booking in shared aggregate; shop lifecycle is logical design. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: dedicated receive/groom/return acceptance incomplete. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/booking-proposals/boarding-care-plan.service.js.

### 14.3 UC-59 — Check In Pet at Shop

Diagram source: sequence/uc-59.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: STAFF verifies appointment, pet condition/photo and surcharge consent. logical design: receive pet; assign grooming-qualified employee on shift. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: no consent -> no imposed surcharge; risky pet routes to shop support. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/booking-proposals/boarding-care-plan.service.js.

### 14.4 UC-60 — Hand Back Pet and Take Payment

Diagram source: sequence/uc-60.drawio. Actor: Staff / Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: verify READY pet and customer; calculate authoritative payable amount. logical design: reconcile full counter payment before hand-back. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: cash/VietQR confirmation requires audited real payment evidence. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/booking-proposals/boarding-care-plan.service.js.

### 14.5 UC-91 — Update Grooming Status

Diagram source: sequence/uc-91.drawio. Actor: Pet Sitter. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: assigned grooming employee verifies pet and current appointment state. logical design: IN_PROGRESS -> READY or STOPPED with reason. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: full shop lifecycle requires implementation/acceptance. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/booking-proposals/booking-checkout.service.js; backend/src/services/booking-proposals/boarding-care-plan.service.js.

## 15. Public Sitter Profiles and Verified Ratings

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 15.1 Class Diagram

Diagram source: class/class-engagement.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/reviews/review.service.js; backend/src/services/sitter-public-profile.service.js; backend/src/controllers/review.controller.js.

ReviewService operations: rateVisit(options); rate(options); create(options); createRating(options); get(options); detail(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

SitterPublicProfileService operations: readOwn(options); listPending(options); submit(input); review(input). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 15.2 UC-72 — View Sitter Profile

Diagram source: sequence/uc-72.drawio. Actor: Guest / Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view sitter profile projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/reviews/review.service.js; backend/src/services/notifications/notification.service.js; backend/src/models/sitter-public-profile.model.js.

### 15.3 UC-73 — Update Sitter Profile

Diagram source: sequence/uc-73.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: sitter edits own public bio/areas separately from application. submit profile for review; moderation stores version/hash audit. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: only APPROVED profile exposed; private application never published. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/reviews/review.service.js; backend/src/services/notifications/notification.service.js; backend/src/models/sitter-public-profile.model.js.

### 15.4 UC-74 — View Sitter List

Diagram source: sequence/uc-74.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view sitter list projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/reviews/review.service.js; backend/src/services/notifications/notification.service.js; backend/src/models/sitter-public-profile.model.js.

### 15.5 UC-87 — Rate Visit

Diagram source: sequence/uc-87.drawio. Actor: Customer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: verify owner, actual completed assigned visit, window and direction. create unique visit/direction review; verified outcome uses captured features. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: only PUBLISHED CUSTOMER_TO_SITTER contributes public rating; no fake labels. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/reviews/review.service.js; backend/src/services/notifications/notification.service.js; backend/src/models/sitter-public-profile.model.js.

## 16. Role Dashboards, Operational Reports and Audit

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 16.1 Class Diagram

Diagram source: class/class-dashboards.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/payroll.service.js; backend/src/controllers/dashboard-read.controller.js.

MongoOperationalDashboardRepository operations: readSnapshot(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PayrollService operations: createPayrollService(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 16.2 UC-54 — View Admin Dashboard

Diagram source: sequence/uc-54.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view admin dashboard projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/mongo-payroll.repository.js.

### 16.3 UC-77 — View Customer Dashboard

Diagram source: sequence/uc-77.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view customer dashboard projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/mongo-payroll.repository.js.

### 16.4 UC-81 — View Staff Dashboard

Diagram source: sequence/uc-81.drawio. Actor: Staff / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view staff dashboard projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/mongo-payroll.repository.js.

### 16.5 UC-83 — View Pet Sitter Dashboard

Diagram source: sequence/uc-83.drawio. Actor: Pet Sitter. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view pet sitter dashboard projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/mongo-payroll.repository.js.

### 16.6 UC-89 — View Operational Reports

Diagram source: sequence/uc-89.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view operational reports projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/mongo-payroll.repository.js.

### 16.7 UC-90 — View Audit Log

Diagram source: sequence/uc-90.drawio. Actor: Admin. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: ADMIN authorizes audit scope; exclude actual home-entry secret text. logical design: read immutable access-event actor/time projection. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: current access-note function does not itself persist this audit event. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/mongo-payroll.repository.js.

### 16.8 UC-94 — View Sale Staff Dashboard

Diagram source: sequence/uc-94.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: validate public scope or current role/owner and bounded cursor. read allowlisted view sale staff dashboard projection; no domain mutation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/routes/dashboard-runtime.routes.js; backend/src/services/dashboards/mongo-operational-dashboard.repository.js; backend/src/services/dashboards/mongo-payroll.repository.js.

## 17. Notifications and Delivery Preferences

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 17.1 Class Diagram

Diagram source: class/class-notifications.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/notifications/notification.service.js; backend/src/services/notifications/domain-notifications.service.js; backend/src/controllers/notification.controller.js.

NotificationService operations: list(options); markRead(options); publish(options); updatePreferences(options); registerPushSubscription(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

DomainNotifications operations: productOrder(options, session); payment(options, session); payroll(options, session); application(options, session); visit(options, session). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 17.2 UC-88 — View Notifications

Diagram source: sequence/uc-88.drawio. Actor: Signed-in user (CUSTOMER / PET_SITTER / STAFF / ADMIN). State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: NotificationService. Export the completed native page at this location using the existing sequence notation.

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

Preconditions and main interaction: Read source joins and feature timestamps; exclude synthetic/stale/unverified labels. Return verified counts, shortages and blocked reasons without exporting real rows. Persistence semantics: Return counts/blockers only; no export/train/approval or business write.

Alternative and recovery: Readiness does not train, import, approve or assign.

Source references: backend/src/services/ai-training/training-readiness.service.js; backend/src/services/ai-training/dataset-export.service.js.

### 18.3 AI-02 — Export verified training observations

Diagram source: sequence/ai-02.drawio. Actor: Operator CLI. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: TrainingDatasetExporter. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Require explicit apply/private output and export secret; at least 200 observations/50 booking groups. HMAC opaque identifiers; write private point-in-time JSONL and source/hash manifest. Server access and current source/state checks remain authoritative.

Alternative and recovery: Too few valid groups or truncated source -> no export file.

Source references: backend/src/services/ai-training/dataset-export.service.js; backend/scripts/ai/export-training-data.js.

### 18.4 AI-03 — Train and bundle a draft additive model

Diagram source: sequence/ai-03.drawio. Actor: Offline trainer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: OfflinePythonTrainer. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate verified satisfaction label, feature availability and grouped chronological split. Train five weights and write model then evidence as separate sequential files; packaging validates both matching hashes. Server access and current source/state checks remain authoritative.

Alternative and recovery: Partial output can remain after failure; reject incomplete or mismatched bundle; no automatic approval.

Source references: backend/scripts/ai/train_model.py; backend/scripts/ai/bundle_model.py.

### 18.5 AI-04 — Import draft artifact and evidence

Diagram source: sequence/ai-04.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: ModelRegistry. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate exact JSON shape, DRAFT state, temporal evidence, hashes and immutable version. Persist SitterRankModel plus private original artifact/evidence for later review. Server access and current source/state checks remain authoritative.

Alternative and recovery: Same version/different bytes or evidence mismatch -> conflict.

Source references: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

### 18.6 AI-05 — Approve and activate a reviewed model

Diagram source: sequence/ai-05.drawio. Actor: Admin after independent source review. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: ModelRegistry. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Operational gate: independent source/evaluation review. API verifies current ADMIN, reviewReference, review version, improved MAE and artifact/evidence integrity. Transaction records review decision and activation guard; only an approved valid model is selected. Server access and current source/state checks remain authoritative.

Alternative and recovery: A reviewReference string does not itself prove reviewer independence; importer/reviewer separation is a process gate, not a demonstrated API rejection. Stale version -> conflict.

Source references: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

### 18.7 AI-06 — Retire model and use rule fallback

Diagram source: sequence/ai-06.drawio. Actor: Admin / Runtime. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: ModelRegistry / RuleScoring. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate current model review version or runtime artifact gate. Retire immutable model version or retain explainable 30/25/20/15/10 policy when model is unusable. Server access and current source/state checks remain authoritative.

Alternative and recovery: No model or bad artifact never changes prices, eligibility or money.

Source references: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

### 18.8 AI-07 — Check vet-escort route and appointment feasibility

Diagram source: sequence/ai-07.drawio. Actor: Customer; Staff handles review exceptions. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: RecommendationService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Require confirmed clinic, appointment, waiting budget and return scope; road route and buffered slot must cover the full plan. Compare outward/return ETA, appointment and waiting against requested slot; rank only feasible candidates. Server access and current source/state checks remain authoritative.

Alternative and recovery: Route unavailable, over review cap or infeasible appointment returns explicit review/conflict; specialized MATCH checkout still requires Staff scope review.

Source references: backend/src/services/sitter-matching/recommendation.service.js; backend/src/services/booking-proposals/match-selection.service.js.

### 18.9 AI-08 — Advise an operational employee invitation shortlist

Diagram source: sequence/ai-08.drawio. Actor: Dispatch service. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: OperationalRanker. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Start with the authoritative eligible employee IDs; validate optional model, source statistics and road insertion feasibility. Reorder candidate IDs with captured decision-time features; retain unscored eligible IDs for authoritative invitation checks. Persistence semantics: Return ranked IDs and featureSnapshot in memory; no invitation/assignment/money write. Route cache may persist separately.

Alternative and recovery: Partial routing/statistics failure cannot disqualify an otherwise eligible employee or mutate money; final acceptance rechecks occupancy.

Source references: backend/src/services/sitter-matching/operational-ranker.service.js; backend/src/services/employee-scheduling/employee-dispatch.service.js.

## 19. Employment Documents and Applicant Self-Service

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 19.1 Class Diagram

Diagram source: class/class-employment.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/payroll/employment-document.service.js; backend/src/services/applications/application-status-runtime.service.js; backend/src/controllers/employment-document.controller.js.

EmploymentDocumentService operations: get(actor, applicationId); save(actor, applicationId, body, key); decide(actor, applicationId, documentId, body, key); activate(application, employeeId, actor, session). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

ApplicationStatusRuntimeService operations: createApplicationStatusRuntimeService(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 19.2 EMP-01 — Track and edit an owned pending application

Diagram source: sequence/emp-01.drawio. Actor: Signed-in applicant. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: SitterApplicationService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Bind application to authenticated owner/current verified legacy contact; check PENDING version. Read status directly without second OTP; edit only allowed fields with idempotent optimistic update. Server access and current source/state checks remain authoritative.

Alternative and recovery: Admin review racing owner edit -> one guarded commit; processed application is read-only.

Source references: backend/src/services/sitter-application.service.js; backend/src/routes/sitter-application.routes.js.

### 19.3 EMP-02 — Issue, sign and activate an employment document

Diagram source: sequence/emp-02.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: EmploymentDocumentService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate actual particulars, canonical gender, contract terms and document/application version. DRAFT -> ISSUED -> SIGNED -> ACTIVATED; retain encrypted immutable terms/hash and activate employment atomically. Server access and current source/state checks remain authoritative.

Alternative and recovery: Unsigned invalid legacy gender blocks issue/sign; signed history cannot be rewritten.

Source references: backend/src/services/payroll/employment-document.service.js; backend/src/services/applications/application-status-runtime.service.js; backend/src/controllers/employment-document.controller.js.

### 19.4 EMP-03 — Prefill and print a versioned contract

Diagram source: sequence/emp-03.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: EmploymentDocumentService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Authorize private application/contract; preserve saved terms over optional suggestions. Allowlist verified prefill and render the selected document revision/reference for print. Persistence semantics: Return authorized prefill/document data; print is browser presentation, no source rewrite.

Alternative and recovery: Missing original identity/schedule is reported; do not guess or mass-backfill.

Source references: backend/src/services/payroll/employment-document.service.js; backend/src/services/payroll/employment-prefill.service.js.

## 20. Legacy Earnings, Holds and Settlement Reconciliation

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 20.1 Class Diagram

Diagram source: class/class-settlement.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/admin-settlement.service.js; backend/src/controllers/admin-settlement.controller.js.

CommandRunner operations: readOwn(options); withdraw(options); submit(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

AdminSettlementService operations: list(options); decide(input); recordTransfer(input). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 20.2 FIN-01 — Reserve and submit legacy weekly settlement

Diagram source: sequence/fin-01.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: SettlementService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Read eligible available legacy earnings and cross-week booking quota under transaction guards. Reserve earning slices and weekly claims; persist submitted request plus command/event atomically. Server access and current source/state checks remain authoritative.

Alternative and recovery: Open case/refund, missing tax/payment or conflicting reservation -> hold/conflict.

Source references: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/mongo-settlement.repository.js.

### 20.3 FIN-02 — Approve, reject or withdraw settlement

Diagram source: sequence/fin-02.drawio. Actor: Admin / Owner. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: SettlementService /
AdminSettlementService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Authorize actor/current request version and approved financial policy. Approve immutable amount or release reservation on eligible rejection/withdrawal with audited reason. Server access and current source/state checks remain authoritative.

Alternative and recovery: Approved onward cannot be silently withdrawn; employee wages use payroll instead.

Source references: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/admin-settlement.service.js.

### 20.4 FIN-03 — Record transfer and reconcile uncertain result

Diagram source: sequence/fin-03.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: AdminSettlementService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate reserved request, immutable amount, independent transfer evidence and unique bank reference. PAID only for confirmed matching transfer; UNKNOWN or amount mismatch stays reconciliation state. Server access and current source/state checks remain authoritative.

Alternative and recovery: Replayed acknowledgement cannot double-pay or release/reuse bank reference.

Source references: backend/src/services/settlements/admin-settlement.service.js; backend/src/services/settlements/mongo-settlement.repository.js.

### 20.5 FIN-04 — Apply and release a case or refund money hold

Diagram source: sequence/fin-04.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: BookingFinancialHolds. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Use authoritative booking/earning guard and case/refund source reference. Add audited financial lock; release only after final explicit authorized conclusion. Server access and current source/state checks remain authoritative.

Alternative and recovery: After payout create approved adjustment; never automatic clawback.

Source references: backend/src/services/settlements/booking-financial-holds.service.js; backend/src/services/settlements/mongo-settlement.repository.js.

## 21. Background Jobs and Durable Application Mail

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 21.1 Class Diagram

Diagram source: class/class-jobs.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

ApplicationMailService operations: enqueue(application, session); runBatch(options); list(applicationId). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

EmployeeDispatchWorker operations: stop(). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 21.2 JOB-01 — Publish visit reminders

Diagram source: sequence/job-01.drawio. Actor: Scheduled job. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: VisitReminderJob. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Bound eligible due visits and deduplicate reminder event/recipient. Publish one reminder through durable notification/provider ports. Server access and current source/state checks remain authoritative.

Alternative and recovery: This job export is not proof of runtime startup or inbox acceptance.

Source references: backend/src/jobs/visit-reminder.job.js.

### 21.3 JOB-02 — Dispatch invitations and expire unanswered offers

Diagram source: sequence/job-02.drawio. Actor: Employee dispatch worker. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: EmployeeDispatchService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Require composed enabled worker, current booking/payment/care plan and eligible employee. Bound queue pass; recheck eligibility/occupancy; persist expiring invitation and next-candidate event. Server access and current source/state checks remain authoritative.

Alternative and recovery: No eligible employee or stale visit -> Staff attention; recommendation never assigns directly.

Source references: backend/src/jobs/employee-dispatch.job.js; backend/src/services/employee-scheduling/employee-dispatch.service.js.

### 21.4 JOB-03 — Reconcile payment reminders and overdue state

Diagram source: sequence/job-03.drawio. Actor: Payment job. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: PaymentReminderOverdueJob. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Check due intent/current provider result before payment/overdue decision. Record deduplicated reminder/reconciliation; retain unknown provider result for Staff. Server access and current source/state checks remain authoritative.

Alternative and recovery: No automatic debt collection or expired-order revival.

Source references: backend/src/jobs/payment-reminder-overdue.job.js.

### 21.5 JOB-04 — Expire unpaid or uncollected product holds

Diagram source: sequence/job-04.drawio. Actor: Scheduled job. State: DESIGN_PENDING_RUNTIME. Service owner: ProductHoldExpiryJob Â«designÂ». Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Design: identify expired current-state order under stock/version guard. Design: cancel once and release only its held quantities; preserve attributable refusal rule. Server access and current source/state checks remain authoritative.

Alternative and recovery: Full deadline scheduler integration still needs verification; prepaid timeout is not customer refusal.

Source references: backend/src/services/product-sales/product-order-management.service.js; doc/reports/report4/planned-schema-inventory.json.

### 21.6 JOB-05 — Recompute approved customer tier

Diagram source: sequence/job-05.drawio. Actor: Scheduled job. State: DESIGN_PENDING_RUNTIME. Service owner: TierAssessmentJob Â«designÂ». Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Design requires an approved tier threshold/discount source and verified paid annual spend. Design: versioned tier assessment from eligible service/product/counter receipts. Server access and current source/state checks remain authoritative.

Alternative and recovery: No approved current tier source means no invented discount, points or fake customer rank.

Source references: doc/reports/report4/planned-schema-inventory.json.

### 21.7 JOB-06 — Plan a feasible sitter visit order

Diagram source: sequence/job-06.drawio. Actor: Route planning job. State: DESIGN_PENDING_RUNTIME. Service owner: RouteOrderPlanner Â«designÂ». Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate current authorized visits, registered work windows, road matrix and workload bounds. Design: bounded visit-order advice can reuse schedule-insertion/road-ETA helpers; a complete route-order job is not present in current runtime. Server access and current source/state checks remain authoritative.

Alternative and recovery: OSRM estimate is not live traffic or a training satisfaction label.

Source references: backend/src/services/sitter-matching/scheduling.service.js.

### 21.8 JOB-07 — Flag late check-in and operational attention

Diagram source: sequence/job-07.drawio. Actor: Operational sweep. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Service owner: OperationalSweepJob. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Evaluate current visit/time against approved policy under bounded repeated sweep. Design/export: deduplicated Staff notice and Needs action escalation. Server access and current source/state checks remain authoritative.

Alternative and recovery: Do not charge arbitrary late fees or mark an unobserved visit completed.

Source references: backend/src/jobs/operational-sweep.job.js.

### 21.9 MAIL-01 — Retry durable application-status email

Diagram source: sequence/mail-01.drawio. Actor: Application mail worker. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: ApplicationMailService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Lease a due encrypted recipient snapshot; check bounded attempts and stable provider operation identity. Send configured mail; record accepted/failure and next retry without rolling back saved application. Server access and current source/state checks remain authoritative.

Alternative and recovery: Provider acceptance is not inbox delivery; preserve record after exhausted attempts.

Source references: backend/src/jobs/application-mail.job.js; backend/src/services/applications/application-mail.service.js.

## 22. Map, Private Media and Public Contact Boundaries

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 22.1 Class Diagram

Diagram source: class/class-media-maps.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/maps/location-search.service.js; backend/src/services/private-image.service.js; backend/src/controllers/private-image.controller.js.

LocationSearchService operations: search(body); resolve(body). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PrivateImageService operations: upload(options); read(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 22.2 MAP-01 — Search and confirm a service-address map point

Diagram source: sequence/map-01.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: LocationSearchService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Authenticate same-origin map proxy; validate search/resolve input and supported coverage. Resolve provider result; explicit user pin confirmation saves private location/GeoJSON/version. Server access and current source/state checks remain authoritative.

Alternative and recovery: Missing provider or unsupported/ambiguous point remains explicit; do not expose provider key.

Source references: backend/src/services/maps/location-search.service.js.

### 22.3 MAP-02 — Read road ETA and bounded route matrix

Diagram source: sequence/map-02.drawio. Actor: Matching / Dispatch service. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: RoutingService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate provider, origin/points, timeout, response bounds and exact cache identity. Use Vietmap or OSRM road ETA plus policy buffers; store 15-minute matrix edges. Server access and current source/state checks remain authoritative.

Alternative and recovery: No straight-line fabricated ETA, live-traffic guarantee or label substitution.

Source references: backend/src/services/sitter-matching/routing.service.js; backend/src/services/sitter-matching/commercial-routing.service.js.

### 22.4 MEDIA-01 — Upload and read private care or applicant evidence

Diagram source: sequence/media-01.drawio. Actor: Owner / authorized Admin applicant reviewer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: PrivateImageService /
SitterApplicationService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Owner-only private-image upload/read; applicant-document review uses application authorization and quota. There is no blanket Staff/Admin ownership bypass. Normalize/store owned private image or read an application-bound document through its separately authorized service. Server access and current source/state checks remain authoritative.

Alternative and recovery: Wrong owner/type/invalid image or unavailable provider -> reject; no public application URL.

Source references: backend/src/services/private-image.service.js; backend/src/services/sitter-application.service.js.

### 22.5 MEDIA-02 — Replace an avatar or product photo

Diagram source: sequence/media-02.drawio. Actor: Owner / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: AvatarService /
ProductPhotoService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate entity ownership or Admin permission, image bounds and current media version. Normalize bounded avatar/product bytes in MongoDB; update version/hash/tombstone transactionally. Server access and current source/state checks remain authoritative.

Alternative and recovery: Profile/product snapshot history and owner guards survive replacement/removal.

Source references: backend/src/services/avatar.service.js; backend/src/services/product-sales/product-photo.service.js.

### 22.6 CONTACT-01 — Send a public contact enquiry

Diagram source: sequence/contact-01.drawio. Actor: Guest. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Service owner: ContactService. Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Validate bounded enquiry and server-configured inbox/provider; apply rate limits. Await notificationDelivery.send; return ACCEPTED or explicit unavailable/uncertain outcome without persisting a contact record. Persistence semantics: External delivery only; no contact database write.

Alternative and recovery: CONTACT_DELIVERY_UNCERTAIN does not prove no message was sent; there is no durable contact retry/deduplication store.

Source references: backend/src/services/contact.service.js.

### 22.7 PWA-01 — Install and recover the web application shell

Diagram source: sequence/pwa-01.drawio. Actor: Browser user. State: DESIGN_PENDING_RUNTIME. Service owner: ApplicationShell Â«designÂ». Export the completed native page at this location using the existing sequence notation.

Preconditions and main interaction: Design requires supported browser/HTTPS, an implemented manifest and service worker; those artifacts are absent from the current frontend tree. Design: cache approved application-shell assets only after reviewed PWA implementation; preserve private API no-store and explicit offline failure. Server access and current source/state checks remain authoritative.

Alternative and recovery: No offline financial command success, cached private API data or background GPS guarantee is inferred; device acceptance remains pending.

Source references: doc/architecture/p37-sds-api-diagram-synchronization-v1.md.
