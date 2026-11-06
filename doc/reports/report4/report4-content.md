[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

CAPSTONE PROJECT REPORT

Report 4 – Software Design Specification

– Hanoi, Aug 2026 –

Table of Contents

# Change Log

| Date | A* / M, D | In charge | Change Description |
| --- | --- | --- | --- |
| 06/11/2026 | M | Đặng Văn Hải | Complete SDS against current source; preserve school structure and supplied diagram layouts. Replace obsolete architecture technology labels; complete schema and 95-use-case design references. |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

*A - Added M - Modified D - Deleted

# I. High Level Design

## 1. Software Architecture

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

Architecture component descriptions

| No | Component | Description |
| --- | --- | --- |
| Client Tier |  |  |
| 01 | API Services  | Uses browser Fetch through shared services/api-client.js and feature API adapters. Sends same-origin REST JSON, credentials and CSRF for authenticated unsafe requests. Maps server envelope, field errors, HTTP/proxy failures and uncertain acknowledgements to explicit UI states. No Axios dependency is required. |
| 02 | Contexts  | SessionContext and public-policy context share authenticated identity, current roles and approved policy data. Name-only session projection updates preserve an edited form. Contexts use service adapters; there is no shared Socket.IO connection in the implemented runtime. |
| 03 | Pages  | Public, Customer, Pet Sitter, Staff and Admin route screens compose reusable UI, hooks and API services. Guards guide navigation; server authorization, owner binding and version checks remain authoritative. |
| 04 | UI / Common Components  | Reusable buttons, fields, dialogs, tables, cards, navigation and map/media components share accessible error/loading/empty states. Presentation components depend on lower UI/state/service helpers and do not import pages or route manifests. |
| 05 | Layouts  | Public and role dashboard shells render navigation, headers and nested content. Shared components/hooks/services supply data; layouts do not import page-owned route manifests. |
| 06 | Hooks  | Reusable resource/effect hooks track loading, cancellation, retries and field-safe feedback. Uncertain mutation acknowledgement is recovered using the original operation key rather than blindly issuing a new command. |
| 07 | Routes (React Router)  | Shared route manifests select layouts/pages and enforce navigation session/role guards. Every protected API independently validates server session, current account state, role, ownership and command preconditions. |
| 08 | App (Application Providers)  | main.jsx and app compose providers, route tree and error boundaries for the React 19/Vite SPA. Runtime manifests are JavaScript/JSX; generated static assets are served from EC2 with SPA fallback. |
| 09 | Styles / Utilities / Assets / Constants  | Shared CSS lives in styles, reusable pure formatting in utils, named values in constants and static resources in assets/public. Component-specific CSS may remain beside its component. Shared transport remains under services. |
| Application Tier |  |  |
| 01 | Middleware  | Express request ID, Helmet, bounded JSON parsing and rate limiting apply before feature routes. Protected commands require a current opaque cookie session, permitted role, same origin and CSRF token. Parser errors use safe 400/413/415 responses; no JWT/Spring Security stack is used. |
| 02 | Routes Layer  | Registers modules in app.js and wires middleware, validators, controllers and explicitly composed dependencies. Composition may construct services/models but routes do not query data or decide domain outcomes. |
| 03 | Controllers / Route Handlers  | Feature controller factories translate parameters, authenticated actor and DTOs to services, then map status, safe data and errors to HTTP. Examples include pricing, checkout, employee scheduling, sitter applications and finance-source controllers. |
| 04 | Services Layer  | Owns identity, versioned catalog/pricing, onboarding/contracts, booking, dispatch/invitations, care, complaints, product sales, payroll and financial reconciliation. Uses transactions, guarded state/version writes, snapshots and durable command/event records. Incident, shop workflow, goods receipt, stock adjustment and several legacy exports still have separate integration gates. |
| 05 | Models Layer (Mongoose ODM)  | Defines schemas, indexes, private projections and legacy collection identity for 93 registered models. Repository-managed collections additionally store bookings, visits, payment intents/receipts, cases, refunds, tax assessments and provisioning/audit runs. Data dictionary distinguishes actual BSON fields from logical report aliases; no SQL int identity or database-enforced foreign keys are assumed. |
| 06 | Jobs / Background Workers  | runtime.js starts the composed employee-dispatch, application-mail and earning-accrual workers when the corresponding app service exists. Flags and storage readiness control execution; other reminder/sweep modules remain separate exports. EMPLOYEE compensation keeps legacy partner accrual inactive. No Redis queue or general scheduler is implied. |
| 07 | Notification Service | The same architectural box is corrected to Notification Service (Persisted Events / REST). Domain operations store recipient/role-scoped notifications transactionally and the UI reads them through the REST adapter. No installed Socket.IO runtime, WSS chat service or automatic websocket delivery is claimed. |
| External Services |  |  |
| 01 | SMTP / Mail Server  | Backend Nodemailer adapter sends enabled OTP/contact/application mail. A durable application-mail worker retains encrypted verified recipient snapshots, bounded retries and lease state. Provider acknowledgement and actual inbox delivery are distinct acceptance evidence. |
| 02 | eSMS Gateway | The same provider box is corrected to eSMS Gateway. Contact-delivery composition invokes the configured eSMS adapter when enabled; provider credentials remain server-side. No Android SMS gateway implementation is claimed. |
| 03 | PayOS  | Backend payOS adapter creates payment links. The webhook endpoint /api/v1/payments/payos/webhook verifies the provider signature, matches amount/currency/reference/version/deadline to the server intent and atomically stores unique receipts, guarded payment state and notifications. Duplicate events do not pay twice; late/unknown/mismatched events enter reconciliation. Browser return/cancel pages cannot mark payment verified. |
| 04 | Private Media Adapters | The same media box is corrected to Private Media Adapters: private Cloudflare R2 for protected evidence/documents, plus bounded MongoDB image blobs for avatars and product photos. Backend owner/role checks protect reads. No Cloudinary account/CDN or public applicant-document URLs are used. |
| AI Service Tier |  |  |
| 01 | Node.js Recommendation Engine | The same recommendation area is a logical Node.js subsystem inside the Express process. recommendation.service.js and operational-ranker.service.js call matching repositories, eligibility/scheduling and road-routing ports in process. Vietmap commercial routing and self-hosted OSRM provide route/ETA evidence; there is no FastAPI/Uvicorn server or POST /dispatch-scores transport. |
| 02 | Dispatch Scoring Model  | Optional model consists of five nonnegative additive weights for fit, travel, quality, reliability and workload, with a version, artifact hash, evaluation metadata and review state stored in MongoDB. Offline Python exports/trains/packages JSON artifacts; it does not run inference as an HTTP service. Import requires DRAFT evidence and independent approval before activation. Fresh production read on 06/11/2026 found zero model documents, outcomes and reviews, so no trained-model quality claim is made. |
| 03 | Heuristic Scoring Fallback  | The active source uses explainable rule weights 30/25/20/15/10 when no valid approved additive model is available. Hard eligibility, care capability, availability, route feasibility and workload bounds precede ranking. Recommendations never create assignments or compute money; invitation and offer acceptance recheck authoritative employee eligibility, full required prepayment and occupancy inside guarded transactions. |
| Data Tier |  |  |
| 01 | MongoDB 8.0 | MongoDB 8.0 replica set supplies multi-document transactions; the backend uses Mongoose plus raw repository collections. EC2 hosts the application and database behind Cloudflare/Caddy; secrets and database volumes remain outside release artifacts. Legacy Ai-prefixed physical collections are preserved, including airoutingmatrixes. Readiness verifies database availability, not all provider/business integrations. |

## 2. Package Diagram

### 2.1 Overall Package Diagram

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

### 2.2 Frontend Package Diagram

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

Package descriptions

| No | Package | Description |
| --- | --- | --- |
| 01 | app | Initializes the React application, composes application providers and routing, and supplies the top-level error boundary. React components and classes use PascalCase, such as App and AppErrorBoundary, with matching .jsx filenames. The application entry file is named main.jsx; ordinary functions and variables use camelCase. |
| 02 | routes | Declares client-side routes, selects pages and layouts, and applies session and role guards to protected screens. Route and guard components use PascalCase names and .jsx filenames, such as AppRoutes.jsx and RequireSession.jsx. Helper functions and route configuration variables use camelCase. |
| 03 | layouts | Provides reusable page structures for public screens and role dashboards, including headers, navigation, footers, and nested page content. Layout components use PascalCase, normally ending in Layout, such as PublicSiteLayout and RoleDashboardLayout. Component filenames match these names; CSS filenames use lowercase kebab-case. |
| 04 | pages | Contains public and role-based screens organized by role or feature. Pages combine shared components, contexts, hooks, and API services to display data and handle user actions. Page components and .jsx filenames use PascalCase, usually ending in Page, such as AdminServicesPage.jsx. Feature directories and CSS filenames use lowercase names or kebab-case. |
| 05 | components | Contains reusable UI elements and shared public/common components, including buttons, inputs, dialogs, headers, and footers. Component names and .jsx filenames use PascalCase, such as Button.jsx and PublicHeader.jsx. Helper functions and props use camelCase; CSS filenames use lowercase kebab-case. Barrel exports use index.js. |
| 06 | contexts | Provides shared session and public-policy state through React contexts and providers, with hooks for consuming that state. Context filenames use PascalCase with the Context suffix, such as SessionContext.jsx. Providers use PascalCase, such as SessionProvider; consumer hooks use the use prefix, such as useSession. |
| 07 | hooks | Contains reusable React logic for loading resources, tracking request states, retrying requests, and cancelling obsolete loads. The current useApiResource hook receives a loading function from its caller. Hook names and filenames use use followed by PascalCase, such as useApiResource.js; internal functions and variables use camelCase. |
| 08 | services | Encapsulates browser API requests, JSON response handling, and feature-specific adapters used by pages, contexts, and routing. JavaScript filenames use lowercase kebab-case, commonly ending in -api.js or -adapter.js, alongside api-client.js. Exported functions use camelCase, such as createApiClient; error classes use PascalCase, such as ApiError. |
| 09 | styles | Defines shared design tokens, font declarations, base styles, and the stylesheet entry point. index.css imports shared styles and the UI stylesheet from components. CSS filenames use lowercase names or kebab-case, such as tokens.css and base.css. CSS custom properties use descriptive lowercase names with the --pwc- prefix, such as --pwc-ink. |

### 2.3 Backend Package Diagram

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

Package descriptions

| No | Package | Description |
| --- | --- | --- |
| 01 | config | Loads and validates environment configuration, establishes database connections, and composes provider ports and optional adapters. Filenames use lowercase names or kebab-case, such as environment.js and provider-ports.js. Exported functions use camelCase, such as loadConfig and connectDatabase; custom error classes use PascalCase, such as ConfigurationError. |
| 02 | routes | Wires Express modules, middleware and controllers. Composition factories may construct dependencies; route bodies do not query persistence or calculate business results. Lower layers do not import HTTP layers. Filenames use kebab-case and .routes.js. |
| 03 | controllers | Feature HTTP adapters decode actor/params/body, invoke services and return status/envelopes. Current controllers cover health, auth, pricing, pet care, checkout, employee scheduling, employment, product sales and finance sources; they do not query models directly. Factories/functions use camelCase and files use .controller.js. |
| 04 | middlewares | Provides shared HTTP handling and access checks, including request IDs, not-found/error handling, session validation, role checks, and origin/CSRF validation. The current files are http.js and session.js. Middleware factories and helper functions use camelCase, such as requestId, errorHandler, requireSession, requireRoles, and requireCsrf. |
| 05 | services | Implements business operations for identity, catalog/pricing, sitter operations, booking/dispatch, care/incidents, engagement, and finance, together with provider-related services. Operations use Mongoose models or injected repositories and ports as required. Service filenames normally use lowercase kebab-case with .service.js; exported operations and factory functions use camelCase, such as createServiceCatalogService. |
| 06 | models | Defines Mongoose schemas and model factories for persisted entities, including users, sessions, service catalogs, prices, policies, settings, sitter applications, and audit records. Filenames use lowercase kebab-case with .model.js, such as user.model.js. Model names use PascalCase, such as User; schema variables and factory functions use camelCase, such as userModel. |
| 07 | validators | Pure request/DTO validators own type, shape, bounds, enum and field-level feedback. They depend on low-level utils/constants, not services/HTTP/persistence. Domain eligibility, occupancy and money decisions stay in services. Files use .validator.js. |
| 08 | jobs | Bounded background orchestration reuses services and durable repositories. Runtime starts only composed dispatch, application-mail and finance-accrual workers; separate exported reminder/sweep jobs are not automatically enabled. Job files use .job.js and never replace transactional domain guards. |
| 09 | utils | Provides common application errors and helpers for response metadata and error payloads, reused across backend packages. Filenames use lowercase kebab-case, such as app-error.js. Custom classes use PascalCase, such as AppError; utility functions use camelCase, such as metadata and errorPayload. |
| 10 | constants | Stores named domain constants, enums, approved demo catalog/work-area definitions and source-owned initial data. Constants have no upper-layer imports; provisioning is explicit and preserves Admin versions/history. Symbolic fixed names use UPPER_SNAKE_CASE; existing dataset exports retain compatibility names. |

## 3. Database Design

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

Logical database views retain the supplied entity-card notation. Physical persistence uses BSON ObjectId/String keys, embedded documents and application-managed references. The existing nine tables preserve the school columns; Notes map their logical aliases to current source. EmergencyContact and a standalone DayOff request record are design concepts without current dedicated collections. Complete model fields/indexes and repository-managed collections are supplied in PWC_Report4_Data_Schema.docx, database/data-schema.drawio and database/data-relationships.drawio; they do not imply all planned workflows are deployed. Additional proposed domain contracts are supplied in planned-data-schema.md, PWC_Report4_Proposed_Domain_Schema.docx and database/planned-domain-schema.drawio. These 11 contracts complete the remaining design scope without claiming deployed collections or approved missing policies.

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

Image: Order, Working

### 3.1 User

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| UserId | ObjectId | primary identity | users._id; MongoDB ObjectId, not SQL int identity |
| Fullname | String | required; maxlength 100 | users.displayName |
| Email | String | verified contact; unique active channel/lookup | contacts with channel EMAIL; encrypted canonicalCiphertext/select:false, not a User plaintext field |
| Phone | String | verified contact; unique active channel/lookup | contacts with channel PHONE; encrypted canonicalCiphertext/select:false |
| UserRole | String[] | CUSTOMER / PET_SITTER / STAFF / ADMIN | users.roles; multiple memberships allowed. ADMIN inherits STAFF checks only. |
| Status | String | ACTIVE / LOCKED / SUSPENDED | users.state; server reloads current state/authEpoch |
| CreatedAt | Date | Mongoose timestamp | users.createdAt; UTC instant |
| LastLoginAt | Date (logical) | not a persisted User schema path | Latest successful authentication can be derived only from retained session/event evidence; no invented last-login timestamp |

### 3.2 EmergenecyContact

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| EmergencyId | String (logical key) | design-only identity; no EmergencyContact collection | Earlier SRS emergency-contact concept; current schema has no dedicated persisted record |
| Name | String (logical) | private; owner-authorized; pending schema implementation | Contact person name must be explicitly provided; cannot be inferred from a sitter profile |
| Phone | String (logical) | private validated phone; pending schema implementation | No current dedicated emergency-contact path; do not use an OTP verified-contact record as a substitute |
| Relationship | String (logical) | explicit relationship; pending schema implementation | Logical design retained from the report; no deployed collection claimed |

### 3.3 Pet

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| PetId | ObjectId | primary identity | pets._id |
| UserId | ObjectId | required; indexed owner reference | pets.ownerId -> users._id; application-managed reference |
| PetName | String | required; maxlength 100 | pets.name |
| Species | String | DOG / CAT; required | pets.species |
| Breed | String | required; maxlength 80 | pets.breedCode -> aibreeds.code (application lookup) |
| Weight | Number | 0.1 to 150 kg; required | pets.weightKg; validated finite numeric value |
| Habits | Map<String, careField> | KNOWN / UNKNOWN / NOT_PROVIDED | pets.careProfile; each declared care field carries status/value |
| FeedingNeeds | Map<String, careField> | careField.value maxlength 2000 | Feeding is stored in owner-declared careProfile when supported; retain explicit UNKNOWN rather than fabricate a fact |
| CareNeeds | Map / String[] | careNeedsConfirmed + traits; validated care field keys | pets.careProfile, traits and careNeedsConfirmed; booking keeps immutable confirmed care snapshot |
| PhotoURL | Private image reference | owner-bound; bounded JPEG; no public secret | Avatar bytes/version in profileavatars, referenced by entity/owner; Pet has no mutable external PhotoURL column |
| Status | String | ACTIVE / ARCHIVED | pets.state; archive blocked by unfinished related visits |
| CreatedAt | Date | Mongoose timestamp | pets.createdAt |
| UpdateAt | Date | Mongoose timestamp | pets.updatedAt; report alias UpdateAt |

### 3.4 Notification

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| NotificationId | String | primary identity | notifications._id; durable event/recipient identity |
| UserId | String | required recipient identity | notifications.recipientId; role-scoped projection |
| NotificationType | String | required event type | notifications.eventType |
| Title | String | required bounded title | notifications.title |
| Message | String | required bounded message | notifications.message |
| IsRead | Boolean (derived) | readAt != null | Read state derives from notifications.readAt; no independent IsRead persisted boolean |
| SendedAt | Date | required createdAt | notifications.createdAt; persistence time, not proof of email/SMS inbox delivery |

### 3.5 SitterApplication

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| ApplicationId | ObjectId | primary identity | sitterapplications._id |
| UserId | ObjectId / null | owner-bound; legacy unowned supported | ownerUserId; provisionedUserId after approval is a separate reference |
| PersonDetails | Encrypted String | select:false; AES-GCM particulars | applicantParticularsCiphertext and contactCiphertext; do not publish DOB/identity |
| Experiences | String | bounded input | experience |
| Qualification | Private document references | owned document type/id/storage binding | privateDocuments; identity front/back and portrait remain private, not public qualification URLs |
| Status | String | versioned application state enum | state; PENDING -> UNDER_REVIEW -> interview/decision flow; signed contract gate before approval |
| SubmittedAt | Date | timestamp | createdAt |
| ReviewedAt | Date (audit-derived) | no standalone reviewedAt path in application schema | Review timing is in audit/document decisions; do not synthesize a timestamp |
| RevieweReason | String | reason required for rejection; bounded | decisionReason; internal interviewNote is private |
| ReviewBy | ObjectId (audit actor) | authorized Admin actor | sitterapplicationaudits actor; not arbitrary client ReviewBy input |

### 3.6 SitterProfile

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| SitterId | ObjectId | unique user reference | sitterpublicprofiles.userId -> users._id |
| PhotoURL | Private image reference | bounded owned avatar | profileavatars; no publish of application identity documents |
| Introduction | String | moderated bio | sitterpublicprofiles.bio; APPROVED projection only |
| Experience | String (logical section) | explicit public content, moderated | Experience displayed only from approved public bio; do not copy private application experience |
| ContactDetail | Private contact reference | not included in public profile DTO | Verified contacts remain encrypted and access controlled; no public contact leak |
| Rating | Number (aggregate) | only PUBLISHED CUSTOMER_TO_SITTER | Aggregate accepted customer-review rating; rule prior is not public rating |
| TotalVisit | Integer (aggregate) | verified performed/completed visits | Derived from actual source records; no fake total |
| Status | String | moderation state + version | sitterpublicprofiles.state; operational SitterStatus is separate |

### 3.7 DayOff

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| DayOffId | String (logical key) | no standalone DayOff model | Current date exclusions belong to employee availability/matching profiles; request/approval lifecycle remains design scope |
| SitterId | String / ObjectId | employee identity | employeeavailabilities._id (String) / aisitterprofiles.userId (ObjectId) |
| StartDate | String | YYYY-MM-DD in Asia/Ho_Chi_Minh | dayOffDates entries; date is not a UTC-midnight Date |
| EndDate | String (logical) | inclusive range expanded into local dates | No current end-date column; pending request lifecycle must retain requested range |
| Reason | String (logical) | required for request/decision workflow | No current exclusion reason path; full day-off request workflow pending |
| Status | String (logical) | request decision state pending implementation | Availability ACTIVE is not equivalent to APPROVED day-off request |
| CreateAt | Date (logical) | audit time required in full request design | No dedicated DayOff.createdAt schema claimed |

### 3.8 WorkingHour

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| WorkingId | String + local window identity | employee/version/effectiveFrom | employeeavailabilities._id with workingWindows and availability revision; not SQL identity |
| SitterId | String | approved active employee | _id refers to user; work eligibility rechecked against contract/status |
| DayOfWeek | Integer / local date | validated calendar window | workingWindows; matching profile windows.weekday supports weekly 0..6 |
| StartTime | Integer minute / interval value | explicit timezone and approved future revision | workingWindows start boundary; profile windows.startMinute. Do not fabricate fixed signed weekdays. |
| EndTime | Integer minute / interval value | end after start; workload bounds | workingWindows end boundary; matching profile windows.endMinute |
| ServiceAreaId | String[] | validated authorized area codes | employeeavailabilities.areas; areas saved separately from schedule |
| Status | String | ACTIVE and effective revision | employeeavailabilities.state; availability is not attendance |

### 3.9 Address

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| AddressId | ObjectId | primary identity | customeraddresses._id |
| UserId | ObjectId | required; indexed owner reference | customeraddresses.ownerId |
| AddressLine | String | required; maxlength 500; select:false | customeraddresses.location |
| Ward | String (logical) | no separate ward schema path | Display/address result may include ward text in location; areaCode drives supported coverage |
| LocationPoint | String[] / GeoJSON | Point; longitude then latitude; 2dsphere index | point.type / point.coordinates; authenticated explicit pin confirmation |
| ServiceAreaCode | String | required; indexed | areaCode; operational area reference |
| HomeAccessNotes | String | maxlength 1000; select:false | privateAccessNotes; snapshot and narrow assigned access window |
| Lifecycle | String / Integer / Date | ACTIVE/ARCHIVED; version; timestamps | state, version, pointConfirmedAt, createdAt and updatedAt; full physical schema in supplied data dictionary |

# II. Detailed Code Design

[Provide detailed design set for features involving the most integrations with the backend and external services, limit at 2-3 design sets. Each set includes Class Diagram and Sequence Diagram(s)]

The design follows the existing report sections and the school diagram templates. Classes denote logical module/port responsibilities implemented by JavaScript factories, not unverified runtime inheritance. Full source references and 95-use-case sequence pages are supplied with this report. Detailed sections 4–22 follow the same Class Diagram/Sequence Diagram pattern. Some class files contain separately named source and DESIGN_PENDING_RUNTIME pages; proposed classes and schema are design contracts, not claims that the JavaScript implementation already exists.

## 1. AI Sitter Recommendation & Schedule Feasibility Subsystem

### 1.1 Class Diagram

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

Use class/class-ai-matching.drawio; matching reads pet/service context and approved ranking sources independently of pricing records. Recheck all eligibility and occupancy at invitation/acceptance.

### 1.2 Calculate Service Price Quote

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

Use sequence/sd-pricing-quote.drawio. POST /api/v1/pricing/quotes validates session/CSRF and owned pet/service selections, loads approved versioned prices/policies, calculates integer-VND breakdown and stores an owner-bound QUOTE snapshot with 10-minute TTL. No training/ranker call changes money.

### 1.3 Recommend Pet Sitters

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

Use sequence/sd-ai-recommendation.drawio. POST /api/v1/ai/recommendations validates confirmed care and requested slot, excludes ineligible employees, checks road ETA/insertion feasibility, calculates explainable scores and stores an owner-bound MATCH snapshot with 5-minute TTL. Routing failure is explicit; unsupported/absent model falls back to approved rule weights. Recommendation is advisory.

## 1. AI Service Pricing & Pet Sitter Recommendation

Pricing and recommendation use separate service/model/repository factories. Default fit/travel/quality/reliability/workload weights are 30/25/20/15/10. Python training runs offline on grouped chronological verified outcomes and emits versioned JSON/evidence; no FastAPI, XGBoost or pickle runtime is part of this implementation.

## 2. Booking Proposal & PayOS Payment

### 2.1 Class Diagram

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

Use class/class-booking-payos.drawio. Checkout owns immutable price/visit snapshots and payment intents; schedule proposals are separate customer-confirmed time decisions. payOS verifies and reconciles receipts through backend provider/repository boundaries; it does not assign a sitter.

### 2.2 Create Proposal & Payment Link

Use sequence/sd-booking-payment.drawio. Customer confirms a nonexpired owned quote with validated selections, explicit schedule consent and a stable operation key. A transaction rejects pet-time overlaps, snapshots prices/care/address and writes booking, care shifts, command/event and PREPAY intent when required. Multi-visit prepayment is due in 15 minutes. Payment-link creation follows as a separate request; provider failure preserves the booking and requires safe retry/reconciliation. Full verified prepayment precedes invitations.

### 2.3 PayOS Webhook IPN

Use sequence/sd-payos-webhook.drawio. Verify the signed payOS payload before repository access; match the server intent, positive integer amountVnd, VND, provider reference, version and 15-minute PREPAY deadline. A transaction stores one unique provider event and bank reference, updates the intent/booking and persists notification/event records. Duplicates return acknowledgement; late, unknown, mismatched or raced events remain reconciliation records and do not revive expired bookings. A browser redirect is never payment evidence.

## 3. Sitter Onboarding & Review

### 3.1 Class Diagram

[Existing figure retained in Google Docs; replace from the corresponding native draw.io source.]

Use class/class-sitter-onboarding.drawio. Owned verified contact, encrypted particulars and private document references are separate from the moderated public sitter profile. Application editing is owner-only while PENDING. Admin review, signed employment document and guarded activation precede PET_SITTER promotion; no temporary password or fabricated signed contract is created.

### 3.2 Sitter Application Submission



Use sequence/sd-sitter-review.drawio for the remaining review path. Recheck the final application/document versions, canonical gender and signed contract before activation. FT contracts require at least 40 hours/week and PT at least 20 hours/week; the employee self-registers future shifts after approval. Preserve historical signed terms/hash and use a new revision for invalid unsigned legacy content. Durable application mail retries independently of the approval transaction.

###

UC-16 — Submit Sitter Application. Diagram source: sequence/sd-sitter-application.drawio. A verified signed-in applicant submits owned private identity/portrait references, actual encrypted particulars, approved consents and a stable operation key. Validation checks age, pending-application uniqueness and reapplication rules. The transaction saves the PENDING application and audit; durable mail retries independently, so delivery failure does not discard the saved application. Existing owned applicants track/edit through the separately documented EMP-01 flow.

### 3.3 UC-18 — Staff Review and Employee Approval

Diagram source: sequence/sd-sitter-review.drawio. Export its completed native page to PNG and insert here using the existing sequence style. Admin starts review/interview and performs a version-bound decision; approval requires an actual valid signed contract and transactionally activates the employee while preserving owned Customer membership. Rejection retains a reason and reapplication cooldown. No temporary password or invented user identity is issued.

### 3.4 UC-17 — View Sitter Applications

Diagram source: sequence/uc-17.drawio. validate public scope or current role/owner and bounded cursor. read allowlisted view sitter applications projection; no domain mutation. Alternative: 401/403/404 for access; 422 for invalid input; 409 for stale state where applicable. Source/acceptance state: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED.

### 3.5 UC-19 — Suspend or Reinstate Pet Sitter

Diagram source: sequence/uc-19.drawio. authorize ADMIN and inspect employee status/version. suspend/reinstate with reason; current dispatch eligibility rechecked. Alternative: no blanket rewrite of historical assignments or financial snapshots. Source/acceptance state: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED.

### 3.6 UC-21 — Manage Pet Sitter Contracts

Diagram source: sequence/uc-21.drawio. validate encrypted particulars, Nam/Nữ/Khác, FT40/PT20 terms. DRAFT -> ISSUED -> SIGNED -> ACTIVATED; immutable signed revision. Alternative: invalid unsigned gender blocks issue/sign; signed history is preserved. Source/acceptance state: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED.

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

Diagram source: sequence/book-01.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate every owned pet/service line and approved price/policy version; care traits are capabilities unless an approved surcharge exists. Compute combo once across visit count, cap at 10 percent, snapshot each line and allocate the one order fee without double counting. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Any changed selection invalidates stale quote; no guessed tax or automatic extra trait fee. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/pricing/pricing.service.js; backend/src/services/pricing/pricing-calculation.service.js; backend/src/services/booking-proposals/checkout-snapshot.service.js.

### 7.13 BOOK-02 — Split boarding into employee care shifts

Diagram source: sequence/book-02.drawio. Actor: Checkout / Staff. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate confirmed customer visits, approved care plan and each service duration. Split boarding shifts to at most 480 minutes; allocate integer service-net snapshots by duration/remainders while preserving customer total and combo visit count. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: More than sixty shifts or missing operational facts requires review; shift time is not invented attendance. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

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

Diagram source: sequence/travel-01.drawio. Actor: Assigned sitter / Authorized viewer. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate assigned visit, sharing consent, session version, fresh coordinate accuracy and bounded time window. Replace only the latest location, expose scoped ETA/map projection and expire/stop sharing; no historical travel trail retained. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Stale session, invalid coordinate, unsupported state or revoked assignment is rejected; real-device tracking acceptance remains separate. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

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

Diagram source: sequence/pay-01.drawio. Actor: Pet Sitter / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Require active signed employment, approved monthly base, at most 50 percent and one approved advance/month. Submit/withdraw/reject/approve under month guard; retain rejection reason and agreed payroll offset. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Pending concurrent request or exhausted approved quota -> reject; no interest or fabricated statutory case. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/services/payroll/payroll-adjustment.service.js; backend/src/controllers/payroll.controller.js.

### 11.6 PAY-02 — Prepare source-based payroll and selected payslip print

Diagram source: sequence/pay-02.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Load signed terms, verified service credits and explicit attendance/KPI source decisions. Prepare immutable statement snapshots, agreed deductions/advances and identity reference; print selected statement. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Availability is not attendance; unresolved source/deduction remains pending rather than reduce salary. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/services/payroll/payroll-adjustment.service.js; backend/src/controllers/payroll.controller.js.

### 11.7 PAY-03 — Record a separate payroll adjustment

Diagram source: sequence/pay-03.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Require original statement reference, agreed reason/evidence and immutable source claim. Record supplement or agreed reconciliation separately; claim transfer reference exactly once. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Original paid statement stays unchanged; UNKNOWN transfer requires reconciliation. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/payroll/payroll.service.js; backend/src/services/payroll/payroll-adjustment.service.js; backend/src/controllers/payroll.controller.js.

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

Diagram source: sequence/uc-88.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: authenticate recipient and active role; signed cursor/limit. return persisted notifications; mark own read state with CSRF. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: cross-user/role notices hidden; no Socket.IO promise. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/reviews/review.service.js; backend/src/services/notifications/notification.service.js; backend/src/models/sitter-public-profile.model.js.

## 18. AI Feature Provenance, Training and Model Lifecycle

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 18.1 Class Diagram

Diagram source: class/class-ai-lifecycle.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

ModelRegistry operations: status(actor); importArtifact(actor, body); review(actor, modelId, body, key). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

TrainingDatasetExporter operations: collect(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 18.2 AI-01 — Inspect training readiness

Diagram source: sequence/ai-01.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Read source joins and feature timestamps; exclude synthetic/stale/unverified labels. Return verified counts, shortages and blocked reasons without exporting real rows. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Readiness does not train, import, approve or assign. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

### 18.3 AI-02 — Export verified training observations

Diagram source: sequence/ai-02.drawio. Actor: Operator CLI. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Require explicit apply/private output and export secret; at least 200 observations/50 booking groups. HMAC opaque identifiers; write private point-in-time JSONL and source/hash manifest. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Too few valid groups or truncated source -> no export file. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/ai-training/dataset-export.service.js; backend/scripts/ai/export-training-data.js.

### 18.4 AI-03 — Train and bundle a draft additive model

Diagram source: sequence/ai-03.drawio. Actor: Offline trainer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate verified satisfaction label, feature availability and grouped chronological split. Fit five nonnegative weights; retain baseline/test MAE and produce DRAFT JSON/evidence; bundle exact hashes. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Synthetic/OSRM/heuristic labels or temporal leakage -> reject; no automatic approval. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/scripts/ai/train_model.py; backend/scripts/ai/bundle_model.py.

### 18.5 AI-04 — Import draft artifact and evidence

Diagram source: sequence/ai-04.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate exact JSON shape, DRAFT state, temporal evidence, hashes and immutable version. Persist SitterRankModel plus private original artifact/evidence for later review. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Same version/different bytes or evidence mismatch -> conflict. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

### 18.6 AI-05 — Approve and activate a reviewed model

Diagram source: sequence/ai-05.drawio. Actor: Admin after independent source review. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Operational gate: independent source/evaluation review. API verifies current ADMIN, reviewReference, review version, improved MAE and artifact/evidence integrity. Transaction records review decision and activation guard; only an approved valid model is selected. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: A reviewReference string does not itself prove reviewer independence; importer/reviewer separation is a process gate, not a demonstrated API rejection. Stale version -> conflict. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

### 18.7 AI-06 — Retire model and use rule fallback

Diagram source: sequence/ai-06.drawio. Actor: Admin / Runtime. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate current model review version or runtime artifact gate. Retire immutable model version or retain explainable 30/25/20/15/10 policy when model is unusable. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: No model or bad artifact never changes prices, eligibility or money. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/sitter-matching/model-registry.service.js; backend/src/services/ai-training/dataset-export.service.js; backend/src/controllers/sitter-recommendations.controller.js.

### 18.8 AI-07 — Check vet-escort route and appointment feasibility

Diagram source: sequence/ai-07.drawio. Actor: Customer / Staff. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Require confirmed clinic, appointment, waiting budget and return scope; road route and buffered slot must cover the full plan. Compare outward/return ETA, appointment and waiting against requested slot; rank only feasible candidates. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Route unavailable, over review cap or infeasible appointment returns explicit review/conflict; specialized MATCH checkout still requires Staff scope review. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/sitter-matching/recommendation.service.js; backend/src/services/booking-proposals/match-selection.service.js.

### 18.9 AI-08 — Advise an operational employee invitation shortlist

Diagram source: sequence/ai-08.drawio. Actor: Dispatch service. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Start with the authoritative eligible employee IDs; validate optional model, source statistics and road insertion feasibility. Reorder candidate IDs with captured decision-time features; retain unscored eligible IDs for authoritative invitation checks. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Partial routing/statistics failure cannot disqualify an otherwise eligible employee or mutate money; final acceptance rechecks occupancy. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/sitter-matching/operational-ranker.service.js; backend/src/services/employee-scheduling/employee-dispatch.service.js.

## 19. Employment Documents and Applicant Self-Service

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 19.1 Class Diagram

Diagram source: class/class-employment.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/payroll/employment-document.service.js; backend/src/services/applications/application-status-runtime.service.js; backend/src/controllers/employment-document.controller.js.

EmploymentDocumentService operations: get(actor, applicationId); save(actor, applicationId, body, key); decide(actor, applicationId, documentId, body, key); activate(application, employeeId, actor, session). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

ApplicationStatusRuntimeService operations: createApplicationStatusRuntimeService(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 19.2 EMP-01 — Track and edit an owned pending application

Diagram source: sequence/emp-01.drawio. Actor: Signed-in applicant. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Bind application to authenticated owner/current verified legacy contact; check PENDING version. Read status directly without second OTP; edit only allowed fields with idempotent optimistic update. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Admin review racing owner edit -> one guarded commit; processed application is read-only. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/payroll/employment-document.service.js; backend/src/services/applications/application-status-runtime.service.js; backend/src/controllers/employment-document.controller.js.

### 19.3 EMP-02 — Issue, sign and activate an employment document

Diagram source: sequence/emp-02.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate actual particulars, canonical gender, contract terms and document/application version. DRAFT -> ISSUED -> SIGNED -> ACTIVATED; retain encrypted immutable terms/hash and activate employment atomically. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Unsigned invalid legacy gender blocks issue/sign; signed history cannot be rewritten. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/payroll/employment-document.service.js; backend/src/services/applications/application-status-runtime.service.js; backend/src/controllers/employment-document.controller.js.

### 19.4 EMP-03 — Prefill and print a versioned contract

Diagram source: sequence/emp-03.drawio. Actor: Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Authorize private application/contract; preserve saved terms over optional suggestions. Allowlist verified prefill and render the selected document revision/reference for print. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Missing original identity/schedule is reported; do not guess or mass-backfill. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/payroll/employment-document.service.js; backend/src/services/applications/application-status-runtime.service.js; backend/src/controllers/employment-document.controller.js.

## 20. Legacy Earnings, Holds and Settlement Reconciliation

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 20.1 Class Diagram

Diagram source: class/class-settlement.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/admin-settlement.service.js; backend/src/controllers/admin-settlement.controller.js.

CommandRunner operations: readOwn(options); withdraw(options); submit(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

AdminSettlementService operations: list(options); decide(input); recordTransfer(input). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 20.2 FIN-01 — Reserve and submit legacy weekly settlement

Diagram source: sequence/fin-01.drawio. Actor: Pet Sitter. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Read eligible available legacy earnings and cross-week booking quota under transaction guards. Reserve earning slices and weekly claims; persist submitted request plus command/event atomically. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Open case/refund, missing tax/payment or conflicting reservation -> hold/conflict. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/admin-settlement.service.js; backend/src/controllers/admin-settlement.controller.js.

### 20.3 FIN-02 — Approve, reject or withdraw settlement

Diagram source: sequence/fin-02.drawio. Actor: Admin / Owner. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Authorize actor/current request version and approved financial policy. Approve immutable amount or release reservation on eligible rejection/withdrawal with audited reason. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Approved onward cannot be silently withdrawn; employee wages use payroll instead. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/admin-settlement.service.js; backend/src/controllers/admin-settlement.controller.js.

### 20.4 FIN-03 — Record transfer and reconcile uncertain result

Diagram source: sequence/fin-03.drawio. Actor: Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate reserved request, immutable amount, independent transfer evidence and unique bank reference. PAID only for confirmed matching transfer; UNKNOWN or amount mismatch stays reconciliation state. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Replayed acknowledgement cannot double-pay or release/reuse bank reference. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/admin-settlement.service.js; backend/src/controllers/admin-settlement.controller.js.

### 20.5 FIN-04 — Apply and release a case or refund money hold

Diagram source: sequence/fin-04.drawio. Actor: Staff / Admin. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Use authoritative booking/earning guard and case/refund source reference. Add audited financial lock; release only after final explicit authorized conclusion. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: After payout create approved adjustment; never automatic clawback. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/settlements/settlement.service.js; backend/src/services/settlements/admin-settlement.service.js; backend/src/controllers/admin-settlement.controller.js.

## 21. Background Jobs and Durable Application Mail

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 21.1 Class Diagram

Diagram source: class/class-jobs.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

ApplicationMailService operations: enqueue(application, session); runBatch(options); list(applicationId). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

EmployeeDispatchWorker operations: stop(). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 21.2 JOB-01 — Publish visit reminders

Diagram source: sequence/job-01.drawio. Actor: Scheduled job. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Bound eligible due visits and deduplicate reminder event/recipient. Publish one reminder through durable notification/provider ports. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: This job export is not proof of runtime startup or inbox acceptance. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

### 21.3 JOB-02 — Dispatch invitations and expire unanswered offers

Diagram source: sequence/job-02.drawio. Actor: Employee dispatch worker. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Require composed enabled worker, current booking/payment/care plan and eligible employee. Bound queue pass; recheck eligibility/occupancy; persist expiring invitation and next-candidate event. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: No eligible employee or stale visit -> Staff attention; recommendation never assigns directly. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

### 21.4 JOB-03 — Reconcile payment reminders and overdue state

Diagram source: sequence/job-03.drawio. Actor: Payment job. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Check due intent/current provider result before payment/overdue decision. Record deduplicated reminder/reconciliation; retain unknown provider result for Staff. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: No automatic debt collection or expired-order revival. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

### 21.5 JOB-04 — Expire unpaid or uncollected product holds

Diagram source: sequence/job-04.drawio. Actor: Scheduled job. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Design: identify expired current-state order under stock/version guard. Design: cancel once and release only its held quantities; preserve attributable refusal rule. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Full deadline scheduler integration still needs verification; prepaid timeout is not customer refusal. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

### 21.6 JOB-05 — Recompute approved customer tier

Diagram source: sequence/job-05.drawio. Actor: Scheduled job. State: DESIGN_PENDING_RUNTIME. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Design requires an approved tier threshold/discount source and verified paid annual spend. Design: versioned tier assessment from eligible service/product/counter receipts. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: No approved current tier source means no invented discount, points or fake customer rank. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

### 21.7 JOB-06 — Plan a feasible sitter visit order

Diagram source: sequence/job-06.drawio. Actor: Route planning job. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate current authorized visits, registered work windows, road matrix and workload bounds. Design/export: bounded route order recommendation that preserves authoritative assignments. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: OSRM estimate is not live traffic or a training satisfaction label. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

### 21.8 JOB-07 — Flag late check-in and operational attention

Diagram source: sequence/job-07.drawio. Actor: Operational sweep. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Evaluate current visit/time against approved policy under bounded repeated sweep. Design/export: deduplicated Staff notice and Needs action escalation. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Do not charge arbitrary late fees or mark an unobserved visit completed. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

### 21.9 MAIL-01 — Retry durable application-status email

Diagram source: sequence/mail-01.drawio. Actor: Application mail worker. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Lease a due encrypted recipient snapshot; check bounded attempts and stable provider operation identity. Send configured mail; record accepted/failure and next retry without rolling back saved application. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Provider acceptance is not inbox delivery; preserve record after exhausted attempts. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/applications/application-mail.service.js; backend/src/jobs/employee-dispatch.job.js; backend/src/controllers/sitter-application.controller.js.

## 22. Map, Private Media and Public Contact Boundaries

This subsystem owns the operations below. Class roles map to source module factories/ports; the schema dictionary holds complete field/index definitions. Runtime/provider acceptance is stated separately for each interaction.

### 22.1 Class Diagram

Diagram source: class/class-media-maps.drawio. The completed native diagram follows the supplied class compartments and dependency convention. Sources: backend/src/services/maps/location-search.service.js; backend/src/services/private-image.service.js; backend/src/controllers/private-image.controller.js.

LocationSearchService operations: search(body); resolve(body). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

PrivateImageService operations: upload(options); read(options). Domain decisions stay in services; controllers translate HTTP and repositories preserve guarded persistence.

### 22.2 MAP-01 — Search and confirm a service-address map point

Diagram source: sequence/map-01.drawio. Actor: Customer. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Authenticate same-origin map proxy; validate search/resolve input and supported coverage. Resolve provider result; explicit user pin confirmation saves private location/GeoJSON/version. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Missing provider or unsupported/ambiguous point remains explicit; do not expose provider key. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/maps/location-search.service.js; backend/src/services/private-image.service.js; backend/src/controllers/private-image.controller.js.

### 22.3 MAP-02 — Read road ETA and bounded route matrix

Diagram source: sequence/map-02.drawio. Actor: Matching / Dispatch service. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate provider, origin/points, timeout, response bounds and exact cache identity. Use Vietmap or OSRM road ETA plus policy buffers; store 15-minute matrix edges. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: No straight-line fabricated ETA, live-traffic guarantee or label substitution. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/maps/location-search.service.js; backend/src/services/private-image.service.js; backend/src/controllers/private-image.controller.js.

### 22.4 MEDIA-01 — Upload and read private care or applicant evidence

Diagram source: sequence/media-01.drawio. Actor: Authorized owner / Staff. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate session/role, media ownership/type, encoded size, pixels and quota. Normalize bounded image; store private R2 reference and authorize each resource read. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Wrong owner/type/invalid image or unavailable provider -> reject; no public application URL. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/maps/location-search.service.js; backend/src/services/private-image.service.js; backend/src/controllers/private-image.controller.js.

### 22.5 MEDIA-02 — Replace an avatar or product photo

Diagram source: sequence/media-02.drawio. Actor: Owner / Admin. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate entity ownership or Admin permission, image bounds and current media version. Normalize bounded avatar/product bytes in MongoDB; update version/hash/tombstone transactionally. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: Profile/product snapshot history and owner guards survive replacement/removal. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/maps/location-search.service.js; backend/src/services/private-image.service.js; backend/src/controllers/private-image.controller.js.

### 22.6 CONTACT-01 — Send a public contact enquiry

Diagram source: sequence/contact-01.drawio. Actor: Guest. State: SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Validate bounded enquiry and server-configured inbox/provider; apply rate limits. Submit through backend contact-delivery port; return safe accepted/unavailable result. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: A configured adapter does not prove inbox receipt; do not expose inbox credentials. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/maps/location-search.service.js; backend/src/services/private-image.service.js; backend/src/controllers/private-image.controller.js.

### 22.7 PWA-01 — Install and recover the web application shell

Diagram source: sequence/pwa-01.drawio. Actor: Browser user. State: PARTIAL_SCOPE_OR_ACCEPTANCE. Export the named complete draw.io page to PNG at this location; preserve the sample lifeline, activation, call/return and combined-fragment notation.

Preconditions and main interaction: Require supported browser/HTTPS and current manifest/service-worker asset version. Cache only approved application-shell assets; retain online/offline status and request retry feedback. The service reads current source/version within the appropriate transaction/query scope; command acknowledgement is bound to its original operation identity.

Alternative and recovery: No offline financial command success, cached private API data or background GPS guarantee is inferred; device acceptance remains pending. Access/input/state errors return explicit safe outcomes; uncertain provider or transfer acknowledgement requires source reconciliation. A replay does not repeat the original business effect.

Source references: backend/src/services/maps/location-search.service.js; backend/src/services/private-image.service.js; backend/src/controllers/private-image.controller.js.

# III. Design for Non-Functional Requirements

This section specifies the implemented security, data-protection, caching and query controls and distinguishes source design from measured acceptance. Versions and provider gates reflect current manifests and the source tree on 06 November 2026; no benchmark, penetration test or service-level availability result is inferred from a build.

## 1. Security Design

### 1.1  Authentication Flow

Paw World Care uses OTP-based verification and stateful opaque server sessions. The browser receives an HttpOnly pwc_session cookie; MongoDB stores HMAC digests and expiry/revocation/authEpoch metadata. Each protected request reloads the current account state/roles and checks expiry. Unsafe browser operations additionally require a bound CSRF token and an allowed Origin. Invalid or failed OTP never creates a session; locked accounts return an explicit denial only after valid proof. No password/JWT/Spring Security authentication is implemented.

#### a. Token Design

| Aspect | Design Decision |
| --- | --- |
| Token format | Opaque session token; 32 random bytes (base64url), HMAC-SHA256 digest stored server-side. No RS256 JWT. |
| Access token expiry | Staff/Admin: 12 hours; other supported roles: up to 30 days. rememberDevice=false caps duration at 12 hours; expiry/revocation/authEpoch checked on every request. |
| Refresh token expiry | No separate refresh-token mechanism. pwc_session is HttpOnly, SameSite=Lax, path=/ and Secure in production; persistence follows explicit device/session choice. |
| CSRF and revocation | CSRF digest is session-bound; unsafe requests require valid x-csrf-token and same-origin validation. Logout revokes session and clears cookie. |

#### b. CORS Configuration

Production serves the React SPA and /api/v1 through the same HTTPS origin on EC2 behind Cloudflare/Caddy. The backend validates the Origin for unsafe session requests. No cross-origin wildcard/credential CORS policy is installed. Development uses the Vite same-origin API proxy; configuring a distinct frontend origin requires an explicit reviewed origin policy, not a copied Spring Boot CORS table.

| Environment | Allowed Origins | Allowed Methods | Allow Credentials | Max Age |
| --- | --- | --- | --- | --- |
| Development | Current Vite origin using /api proxy | Mounted HTTP route methods; no CORS blanket grant | Same-origin cookie credentials | N/A — no CORS preflight cache configured |
| Staging | Dedicated origin only when deployed/configured | Explicit mounted routes and CSRF/Origin checks | Same-origin only by default | N/A — separate staging acceptance not established |
| Production | https://pawworldvn.shop | Explicit /api/v1 methods; same-origin unsafe checks | Same-origin secure session cookie | N/A — no Access-Control-Max-Age configured |

### 1.2  Authorization & RBAC Implementation

| Aspect | Decision |
| --- | --- |
| RBAC implementation | Express requireSession / requireRoles / requireCsrf plus service-level actor, ownership, state and version checks. Protected media requires authorized owner/role/resource binding; public catalog/policy routes expose allowlisted data only. |
| Role hierarchy | Current User.roles supports CUSTOMER, PET_SITTER, STAFF, ADMIN. ADMIN satisfies STAFF checks; it does not automatically become CUSTOMER or PET_SITTER. Membership may be multiple. Sale Staff in Report 3 is a business actor, not a separate persisted runtime role. |
| Object and command authorization | Every read scopes owner/recipient/assignment; every command rechecks authoritative state. 401 missing session, 403 forbidden/CSRF, 404 absent or inaccessible resource, 409 state/version/replay conflict, 422 input validation. Client guards never replace these checks. |

### 1.3  Data Protection

| Data Category | At Rest | In Transit | Notes |
| --- | --- | --- | --- |
| OTP/session/contact identity | HMAC digests for OTP/session/lookup; AES-GCM for configured contact/particulars ciphertext | HTTPS at public ingress; internal Mongo topology access controlled | No password store; private schema fields excluded by default and safe DTOs allowlist data |
| Payment and evidence records | Server intent/verified receipt, unique provider/bank references, audit and private R2/Mongo evidence | HTTPS for payOS and R2 provider calls | No card/bank credential capture; signed callbacks are validated before guarded writes; real transfers need reconciliation |
| API keys (external) | Process environment / EC2 shared .env outside Git and release artifacts | Provider TLS; secrets stay backend-side | No key in VITE bundle, URL, logs, diagrams or exported schema; only placeholder .env.example is tracked |

## 2. Performance & Scalability Design

### 2.1  Caching Strategy

| What is Cached | Redis Key | TTL | Invalidation Trigger | NFR |
| --- | --- | --- | --- | --- |
| Routing edge matrix | Not Redis: airoutingmatrixes; provider/point-derived edge identity list:{hash} | 15 minutes | expiresAt and exact provider/point key; do not use stale estimates as ground truth | Reduce bounded route-provider requests; no measured latency claim |
| Owner decision snapshots | Not Redis: aidecisions (kind QUOTE / MATCH) | QUOTE 10 min; MATCH 5 min | Server explicitly checks owner/kind/expiresAt; TTL index is asynchronous cleanup | Separate price and recommendation lifetimes; never a slot reservation |
| Private responses / public static assets | No Redis in current manifests; browser/CDN per resource policy | Private no-store; public assets content-hashed/versioned | Authenticated data is not cached as shared public content; release changes asset hashes | Protect PII and cache static bytes without inventing Redis infrastructure |

Cache cleanup is not an authorization or expiry decision: commands check authoritative timestamps, versions and ownership even before TTL cleanup. Latest location has a bounded expiry and sharing state; no retained travel trail is inferred. UI resource caching must not leak private recipient/owner data across sessions.

### 2.2  Database Query Optimization

Queries are owner/role scoped before sorting and bounded pagination; keyset/cursor readers bind cursor context to actor/filter. Indexes include owner/state/_id for pets, unique verified channel/lookup for contacts, visit/direction uniqueness for reviews, offer state/deadline, booking/payment receipt/reference uniqueness, matching/profile/version and routing expiry indexes. Snapshot copies preserve historical price/care when catalog or profiles change. Commands use multi-document transactions, conditional expectedVersion/state writes, shared employee/booking guards and durable payload-fingerprint replay. Bounded candidate/route concurrency and batch limits protect CPU/provider load; Mongo connection pool is 10. Architecture/lint/build do not measure query p95, concurrent throughput or recovery time: those require explicit load/failure tests before claiming NFR acceptance. The supplied schema dictionary includes declared indexes; creation on a deployed database is a separate storage-provisioning gate.

# IV. Other Design Specifications

The following specifications complete the existing report scope without adding or reordering report sections. The accompanying native draw.io workbooks use the supplied class/sequence/package layouts; the database workbook uses entity cards. Each UC-01 through UC-95 has a named sequence page. Logical design coverage is distinct from deployed route/provider acceptance; the companion traceability registry records the current source paths and implementation gap for each flow.

Integration and deployment: Cloudflare DNS/HTTPS proxies EC2 Caddy, which serves the built React SPA and routes /api to Express; MongoDB 8.0 replica set and OSRM run on the host. Private R2, SMTP, eSMS, payOS and Vietmap are server-side adapters. Reviewed main releases use immutable artifacts, external .env/database volumes, fresh backup/isolated restore, candidate readiness, blue/green activation and retained rollback. No Render/Vercel configuration is the production target.

AI lifecycle: public OSM/weather datasets remain quarantined context with source/license/hash; OSM graph preprocessing is not training a traffic or satisfaction model. Verified customer satisfaction label is (rating - 1) × 25. Export requires at least 200 eligible observations and 50 booking groups with actual accepted-assignee features available at decision time. Grouped chronological split purges leakage; MAE must improve on baseline, artifacts/evidence must hash-match and an independent reviewer must approve before Admin activates JSON weights. No current production model/outcome/review exists. Rule scores and OSRM/Vietmap estimates are not ground-truth labels or evidence of trained quality.

Financial independence: backend versioned policies own integer-VND prices, combo, fees and snapshot allocation. Matching cannot import pricing models or mutate money. Required PREPAY is due in 15 minutes, and invitations wait for full verified receipt. Tax assessment requires an explicit approved source, never a guessed percentage. Employee payroll is separate from legacy partner earnings/settlements. FT 10 million VND GROSS/month and PT 3 million VND GROSS/month follow signed terms, at least 40/20 hours per week with self-registered shifts; actual availability is not payroll attendance. Commission uses approved 5% directly performed service basis after combo before tax. Adjustments preserve original statements and require audited reconciliation.

Requirement reconciliation: Report 2 still mentions Render/Vercel/Atlas and providers not selected; current deployment is EC2 with Cloudflare/private R2. Report 3 contains fixed Admin-entered shifts and older payment/cancellation/tier assumptions. Newer approved self-registration and PREPAY decisions take precedence. The current source role set has no SALE_STAFF role. Member/Silver/Gold and unapproved cancellation/refund/liability details are not invented. Existing PR158 goods receipt and PR168 product gallery were still open at fresh preflight and are not treated as deployed.

Diagram/source conventions: the original supplied overall/frontend/backend package layout is retained. Only overall transport/provider/subsystem labels change to match Fetch/REST, in-process advisory matching and private R2/Mongo media; frontend/backend package geometry/connectors remain untouched. Source factories are shown using logical UML class/interface roles, not fabricated JavaScript inheritance. Existing image positions in this Google Doc are preserved for replacement from the matching draw.io page exports.

References: Hassan Gomaa, Software Modeling and Design: UML, Use Cases, Patterns, and Software Architectures (Cambridge University Press, 2011), Chapter 2 (class compartments, dependencies, interactions, state and package views) and the supplied school SDS template. The PDF is a modeling reference, not executable project instructions. Report 1 gives scope, Report 2 gives planning/configuration rules, Report 3 provides UC-01–UC-95; current source and later approved decisions establish implementation truth.
