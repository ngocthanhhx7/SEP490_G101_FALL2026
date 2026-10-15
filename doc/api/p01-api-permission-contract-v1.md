# P01 — DTO, REST và quyền v1

Ngày14/10/2026. Canonical contract names/states/owners trong [registry](p01-contract-registry-v1.json), primitives trong [JSON Schema](p01-common.schema.json), lifecycle ở [domain contract](../architecture/p01-domain-contract-v1.md). P34 có thể mount auth/OTP routes khi được cấu hình; REGISTER cần inject handler P07. Chưa có OpenAPI toàn hệ thống; route catalogue dưới chuẩn hóa cho implementation, không coi JSON Schema là đầy đủ request validation.

## Common wire contract

Success {data, meta:{schemaVersion:1, serverNow, correlationId, entityVersion?, policyVersion?, decisionVersion?}}. Error {error:{code,message,fieldErrors?,decisionIds?},meta}; không trả stack/PII/secret. State enum theo registry. Resource IDs24hex server-generated ObjectId wire, operation/event/session refs opaque; không dùng contact/CCCD làm public ID. UTC timestamps ISO8601Z; date-only YYYY-MM-DD. AmountVnd integer0..Number.MAX_SAFE_INTEGER currency VND; không float rounding. Nullable amount chỉ cho preview bị gate, kèm decisionIds; Money DTO luôn non-null integer.

Create validation reject unknown keys; PATCH allowlist per role và expectedVersion, không mass assignment. List default limit20,max100, opaque cursor từ sort(createdAt,id); authorization/filter before pagination, không lấy toàn collection rồi lọc frontend. ExpectedVersion nonnegative; conflict409, không last-write-wins. Idempotency-Key cho commands(create/confirm/accept/cancel/care/payment/refund/settlement); actor+operation+resource+key unique, canonical payload hash, khác payload409; result cache/replay phải authorize lại. Processing202, completed replay HTTP status/result đã ghi. Key retention/payload redaction do foundation chốt trước launch; permanent money/provider dedup refs không được TTL mất bảo vệ.

Event envelope dùng hợp đồng P51: eventId,logicalOperationId,aggregateId/version,type,occurredAtUTC,actorRef,correlationId,policyVersion/decisionVersion khi liên quan,payload schemaVersion1. Event type/recipient ở bảng domain; consumer dedup eventId và authorize projection trước notice. Events state/ledger/outbox committed cùng unit-of-work; provider delivery retry không phát domain command lần hai.

Cookie auth theo ADR; unsafe methods cần CSRF/Origin. Role chỉ là gate đầu tiên: quyền actor/action/resource/context và serializer kiểm tra server trên mỗi read/write/replay/download. Admin kế thừa Staff, không bypass ownership/privacy/eligibility/cutoff nghiệp vụ hoặc FIN chưa chốt. Staff không có payroll/refund approve; internal provider/job không là role do browser chọn. Owner mismatch trả404 RESOURCE_NOT_FOUND thống nhất để hạn chế enumeration; thiếu role403; unauth401.

## DTO allowlists và quyền field

Các DTO thuộc17 entities được registry định danh. Required entity meta: id,state,version,createdAt,updatedAt (sensitive view có thể chỉ expose subset). Input không nhận meta như quyền set server fields; commandId là riêng, version là optimistic expectation. Date/channel normalization và max lengths validate ở schema/module; string input trim, không silently convert unknown health thành false.

| Entity DTO | Create/update input được phép | Read projection / server-only |
| --- | --- | --- |
| UserView | displayName/contact enrollment bằng flows; Customer sửa tên ở profile, settings tên read-only; Admin sửa tên Staff/Sitter | Self role/status/session expiry; Admin account list minimal. roles/authEpoch/lockedReason server/Admin command, không generic PATCH |
| ContactView | channel EMAIL/PHONE, value, otpChallengeId/code cho verify; no ownerId | Masked contact và verifiedAt cho self; canonical lookup keys/OTP digest không xuất |
| ApplicantView | name, contact, age eligibility, experience, workAreas, private document refs | Scoped applicant status/reason/reapplyAt sau verification; Admin review private view; không account token trước approve |
| PetView | name,species DOG/CAT required; optional fields từ P50, structured field status/source; profileVersion | Customer full own; assigned sitter visit care projection; ownerId/from-session và provenance actor server-only, professionally_verified chưa có workflow |
| AvailabilityView | local working windows, areas, dayOff dates, zone, expectedVersion | Public candidate availability đã redacted, owner full; không expose sitter customer visits/home addresses |
| BookingProposalView | selected sitter/service/pets/newSlots/availabilityVersion; Customer confirm price/schedule version | Owner proposal eligibility/expiry/blockers; confirmationAt server; không paid/assigned từ confirm |
| BookingView | serviceId, owned petIds, owned addressId, selectedSlots, intent mode/directed candidate refs, quoteVersion | Owner full booking summaries, operational Staff scoped; originalVisitCount/paymentMode/snapshots/policyVersion server computed |
| VisitView | Care instructions amend trước2h; care commands evidence refs; Customer cancellation qua endpoint riêng | Customer own visit; sitter assigned sanitized snapshot, accessNotes endpoint riêng; state/sitterId/payment flags không generic PATCH |
| OfferView | Candidate accept/decline reason, expectedVersion | Sitter offered job minimum eligibility data, không accessNotes trước assignment; deadline/sitterId server |
| CaseView | Incident/Customer complaint reason,evidence refs, related visit; Staff resolution proposal | Customer own và involved sitter safe projection, Staff private view; staffNotes/financial approvals không expose involved-party projection |
| BillView | Server generation, Admin approved adjustment command; Customer không write amount | Own amount/due/hold summary, finance authorized detail; no fresh full charge for multi prepaid |
| PaymentView | Provider verified callback adapter; no browser state/amount override | Owner verified receipt/status, masked reference; signature/raw callback secret không expose |
| RefundView | Staff proposal cause/evidence, Admin decision/recordTransfer | Own state/amount/refundDue; evidence sensitive Admin view; computed amount/reservation server |
| EarningView | Finance domain events, no sitter write balance | Own accrued/pending/held/available/reserved/paid; Admin payroll; no other sitter data |
| SettlementRequestView | Own earningIds, expectedVersions; Admin decide/recordTransfer | Own request week/state/amount; Admin payroll; weekKey/amount server, same earning not reserved twice |
| ChangeRequestView | Own selected visits and chosen newSlots; expectedVersions | Owner changed schedule proposal; approver FIN-04 gated; appliedAt/allocation transfer server |
| PaymentIntentView | Owner quoteVersion; server amount/ref; refresh/retry same operation semantics | Owner link/state/expiresAt; provider reference/idempotency refs server; FIN-01-TIME gate |

Pet dynamic fields dùng {status,value?,source?,updatedAt?,updatedBy?}; KNOWN cần value, UNKNOWN/NOT_PROVIDED/NOT_APPLICABLE không value; NEEDS_CONFIRMATION có priorValue riêng chưa đủ dùng. Source CUSTOMER_REPORTED/DOCUMENT_ATTACHED không PROFESSIONAL_VERIFIED. Chỉ name/species bắt buộc create; service readiness yêu cầu riêng phải được duyệt, vaccine optional. Customer không set updatedBy/verifiedAt; module service lấy actor/clock. Snapshot field values giữ provenance, profile updates không mutate historical consent.

## Route catalogue và actor/action/resource

Tất cả dưới prefix /api/v1; dấu * chỉ diễn tả family trong tài liệu, implementation phải dùng route rõ và allowlist. Guest không có quyền private GET ngoài scoped applicant access còn gate. Catalog/service/policy public only published versions, không draft/Admin notes.

| Route / action | Actor | Resource predicate và quyết định |
| --- | --- | --- |
| POST /otp-challenges; POST /otp-verifications; POST /sessions; DELETE /sessions/current | Guest/verified contact owner | Purpose-bound OTP,6digits/5min, resend60s,max5codes/hour;5 failures lock15min; challenge single-use; account locked no login. REGISTER atomically provisions Customer/contact/session after verified OTP |
| GET /me; PATCH /me/profile; POST /me/contact-changes; POST /me/contact-verifications | Session owner | AuthEpoch/expiresAt/OTP đúng purpose; new contact verified trước replace old; AUTH-SECOND-CONTACT timing gate |
| GET /users; POST /users/{id}/lock-decisions; PATCH /users/{id}/profile | Admin | Quản trị accounts/audit; Staff không nâng role/lock; bootstrap gate, no role từ signup |
| POST /applications; GET /applications/{id}/tracking | Guest/scoped applicant | Submit không account; tracking cần verified capability, mã hồ sơ không đủ quyền; APPLICANT-ACCESS gate |
| GET /applications; POST /applications/{id}/decisions | Admin | Interview/reason/evidence, provision transaction/idempotent; pending duplicate secure key, age>=18, rejection reapply>=30ngày |
| GET/POST /pets; GET/PATCH /pets/{id}; POST /pets/{id}/archives | Customer owner | owner from session; patch allowlist, minimum name/species; archived snapshot vẫn read lịch sử, upload private |
| GET/POST /addresses; PATCH /addresses/{id} | Customer owner | Private home access, address snapshot không đổi lịch sử; no cross-customer access |
| GET /services; GET /service-areas; GET /policies/{version} | Guest/public | Published only; Admin configure via separate routes/version command; exact service prices server |
| GET/PATCH /me/availability; POST /me/day-off-requests | Sitter owner | Calendar/area eligibility/version, conflicts with accepted visit require action; approval semantics từ P18 |
| POST /booking-proposals; POST /booking-proposals/{id}/confirmations | Customer owner | Owned pets/address, directed sitter; recheck availability/version, confirm không tạo accepted assignment |
| POST /bookings; GET /bookings; GET /bookings/{id} | Customer owner; Staff/Admin operational read | One service,1–2slots/day,max30days,>=24h; payment mode server derived, assignment status riêng |
| GET /offers; POST /offers/{id}/acceptances; POST /offers/{id}/declines | Candidate sitter | Intended recipient+deadline+not revoked, slot guards/payment/directed gate; tối đa1assignment |
| POST /visits/{id}/assignments; POST /visits/{id}/reassignments | Staff/Admin | Same slot guard as accept; eligibility, handover access gate; không bypass valid payment/policy |
| GET /visits/{id}; GET /visits/{id}/access-notes | Customer owner/assigned sitter; operational Staff/Admin | Sitter notes only [start-60min,checkout), replacement handover required; revocation immediate. Staff/Admin only scoped operational need, audit |
| PATCH /visits/{id}/care-instructions; POST /visits/{id}/handovers | Customer/authorized handover actor | Instructions>=2h server; versioned consent; handover confirms replacement access, not fake check-in |
| POST /visits/{id}/check-ins; POST /visits/{id}/check-outs; PATCH /visits/{id}/checklists | Assigned sitter | Clock>=start-30min, mandatory in/out evidence; checklist done hoặc skipped reason; same version/race locks |
| POST /visits/{id}/staff-closures | Staff/Admin | Missing checkout+2h, reason audit; STAFF_CLOSED not normal Completed, earning/billing gated |
| POST /incidents; POST /complaints; GET /cases/{id} | Assigned sitter/Customer incident; Customer complaint; Staff/Admin | Related visit only; involved sitter read safe complaint projection, no Sitter create complaint until approved; private Staff notes excluded |
| POST /cases/{id}/resolutions; POST /cases/{id}/objections | Staff/Admin resolution; Customer baseline objection | Money decisions Admin; Customer complaint7days,one open/visit,one objection; SITTER-FEEDBACK extension gated |
| POST /visits/{id}/ratings | Customer baseline; Sitter direction extension gated | Completed eligible visit,one rating per direction; sitter window/privacy/moderation decision before launch |
| GET /notifications; POST /notifications/{id}/read-receipts | Session owner | Recipient scoped, deep link auth rechecked, no private financial details in public notification/cache |
| GET/POST /private-media; GET /private-media/{id}/read-capabilities | Resource-authorized actor | Upload binding owner/resource/type, scan/limits, short-lived capability; MEDIA-RETENTION/provider gate; no public sensitive URL |
| Financial routes (cancel/change/payment/refund/earnings/settlement/payroll) | P51 actors | [P51 API contract](p51-financial-api-v1.md) canonical route baseline; UPPER_SNAKE_CASE states and common envelope from P01, no duplicated implementation |

### Customer registration (`purpose=REGISTER`)

`POST /otp-challenges` accepts `{ channel, contact, purpose: "REGISTER" }` and returns HTTP 202 with `{ challengeId, expiresInSeconds, resendAfterSeconds }`. HTTP 202 means the challenge request was accepted; delivery is usable only when the configured provider accepts it. Do not infer inbox/SMS delivery from this response.

`POST /otp-verifications` accepts exactly `{ challengeId, channel, contact, purpose: "REGISTER", code, displayName }`. `displayName` is trimmed, internal whitespace is collapsed and the resulting value must contain 1–100 characters. Password, role, status, owner ID and other unknown fields are rejected. An invalid/expired/replayed code creates no account.

On valid OTP, one MongoDB transaction consumes the challenge, creates an ACTIVE User with the fixed `CUSTOMER` role, stores the verified contact (encrypted value and keyed lookup), and creates a 30-day session. A verified contact already owned by an account returns `409 CONTACT_ALREADY_LINKED`; the caller should direct the user to OTP sign-in. Transaction failure leaves no partial Customer, Contact or session. REGISTER verification requires the P07 handler to be injected into P06; without it, the endpoint fails closed with `503 REGISTRATION_UNAVAILABLE`.

Success is HTTP 200 in the common envelope: `{ verified: true, authenticated: true, user: { id, displayName, roles: ["CUSTOMER"] }, csrfToken, expiresAt }`. The opaque session credential is issued only in the `pwc_session` HttpOnly, SameSite=Lax cookie (Secure in production); it is never included in the JSON body. `csrfToken` is returned for in-memory use with same-origin unsafe requests and must not be persisted. This endpoint does not accept or store a password.

Boundary codes:400 BAD_REQUEST,401 UNAUTHENTICATED,403 FORBIDDEN,404 RESOURCE_NOT_FOUND,409 VERSION_CONFLICT/INVALID_STATE/DEADLINE_PASSED/IDEMPOTENCY_CONFLICT/SLOT_CONFLICT/CONTACT_ALREADY_LINKED/WEEK_QUOTA_USED/DECISION_REQUIRED,422 VALIDATION_FAILED,429 RATE_LIMITED (retryAfter),503 PROVIDER_UNAVAILABLE.202 COMMAND_PENDING/PAYMENT_RECONCILING/TRANSFER_PENDING is pending acknowledgment, not domain success. Application gates include decisionIds; unknown monetary calculation never0 silently.

Out-of-scope seller/shop/cart/voucher/password fields rejected. Public policy payload không chứa FIN proposal như policy có hiệu lực. Queries/actions for cross-customer data phải deny trước serializer; frontend guards không đủ authorization. Private read capability/session/OTP code không đưa vào logs/reports/public PWA cache.
