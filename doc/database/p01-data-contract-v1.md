# P01 — Logical schema, indexes và atomicity v1

Ngày14/10/2026. Thiết kế schema cho implementation P02/domain owners, chưa có Mongoose models/migration/DB. [Registry](../api/p01-contract-registry-v1.json) là entity/DTO/state catalogue; [domain](../architecture/p01-domain-contract-v1.md) và [API](../api/p01-api-permission-contract-v1.md) định nghĩa quyền/commands; [P51 ledger](p51-financial-ledger-v1.md) giữ nguyên money invariants. ADR chọn Mongo8.0 replica-set transaction; topology và exact patch còn cần foundation kiểm chứng.

## Collections và relationships

Common fields ObjectId _id; version integer increment trên mọi mutation; createdAt/updatedAt server UTC; deleted/archive state không xóa audit. Business snapshots có schemaVersion/policyVersion/consentedAt/consentedBy/sourceVersion. Mongoose timestamps/versionKey một mình không bảo đảm CAS; conditional updates dùng {_id,version,allowedState}, matchedCount=1 trong unit-of-work, hoặc fail409.

| Entity | Fields/relations và constraints |
| --- | --- |
| User | displayName,roles,status,authEpoch; roles whitelist Customer/Sitter/Staff/Admin; Applicant không là full User role; no password |
| Contact | userId,channel,canonicalValue encrypted/value protection,lookupKey,verifiedAt,state; unique verified lookupKey per channel; normalize email/phone theo xác minh, không tự strip email dots/plus; phone E.164 validated country |
| Applicant | contactRefs,age evidence/interview/private document refs,reviewState,rejectedAt,reapplyAt,provisionedUserId; sensitive identity lookup HMAC key server, no raw CCCD in index/log/public route |
| Pet | ownerId,name,species,optional structured values/provenance,media refs,state; species DOG/CAT; active name không unique toàn owner; vaccine optional/no automated valid-expired conclusion; no transfer-owner flow chưa duyệt |
| Availability | sitterId,zone,local working intervals,areas,dayOff date-only,state,version; recurrence convert by service date; booking occupancy riêng |
| BookingProposal | customerId,candidateSitterId,service/pets,address,newSlots,priceQuote/availability versions,confirmation/state/expiry; no implicit assignment/payment, timeout gate |
| Booking | customerId,serviceId,selectedPetIds,originalVisitCount,paymentMode,visitRefs,price/policy/address snapshots,state; shared snapshots immutable, cancellation aggregate derives from visits |
| Visit | bookingId,startAt/endAt UTC,localDate,assignedSitter/assignmentRef,careSnapshots per pet,state,needsAction flags,evidence/checkout/handover refs; [start,end) and approved travel buffer guard |
| Offer | visitId,sitterId,state,deadline,dispatchSequence,acceptedAt; unique active pending offer per visit for sequential dispatch; accepted through shared guard and Visit CAS |
| Case | kind INCIDENT/COMPLAINT,visitId,involved actors,evidence,publicPartySummary,privateStaffNotes,state,objectionCount,resolution/financialDecision refs; unique active Customer complaint per visit; no auto Sitter complaint permission |
| Bill | booking/visit allocation refs,paymentMode,state,dueAt/hold/adjustments,payableMoney; postpay baseline48h,hold semantics gate; prepay statement not full second receivable |
| Payment | paymentIntentId,provider,event/reference,verified receiptMoney,status,reconcileReason; amount/currency/signature checks, stale intent receipt retained for reconcile |
| Refund | source cancellation/case refs,entitlement/reservation,decision actors,transfer records/evidence,state; actual transfer once with unique reference, failed/unknown not blind retry |
| Earning | sitterId,sourceVisit/allocation,earningPeriodKey,accruedPending/held/available/reserved/paid buckets,adjustments; FIN-07 rates/eligibility gates, no cancelled-service earning inferred |
| SettlementRequest | sitterId,requestWeekKey,earning reservations,state,quotaConsumed,transfer/evidence refs; unique sitter+week including rejected/withdrawn records; earning identity lock spans weeks |
| ChangeRequest | customerId,selectedVisitIds,newSlots,original versions/price snapshots,approver,state,expiry,transfer refs; old schedule valid until APPLIED, FIN-04/05 gate |
| PaymentIntent | booking/quote refs,providerRef,money,state,expiry,activeAttemptRef; late callback no revive; FIN-01-TIME gate, no browser-paid |

Supporting records: OTPChallenge {contactLookup,purpose,codeDigest,expiresAt,resendAt,failedCount,usedAt}; Session {userId,tokenDigest,authEpochAtIssue,expiresAt,revokedAt}; Address {customerId,location,privateAccessNotes,version}; Service/PriceQuote/PolicyVersion {published/effective dates,scope,version,price snapshot}; Assignment {visitId,sitterId,state,withdrawal/handover}; Media {resourceRef,ownerRef,type,scanState,privateStorageRef}; Notification {recipient,eventId,state}; Outbox/Idempotency/Audit; sitter-day OccupancyGuard; LedgerOperation/Entry and TransferRecord. No public OTP/session secret or raw privateStorage URL.

Date-only fields dùng string YYYY-MM-DD validated valid calendar date; timestamps BSON Date storedUTC và wireZ; requestWeekKey là Monday local-date. Amount integer wire an toàn, DB numeric integer representation checked at conversion, không tự silent BigInt→Number mất chính xác. field status KNOWN cần value+provenance; UNKNOWN/NOT_PROVIDED/NOT_APPLICABLE omit value, NEEDS_CONFIRMATION dùng priorValue. Sitter ghi observation ở Visit, không PATCH Pet master. Booking snapshot không reference profile live khi render.

## Unique constraints và query indexes

Đây là correctness/index plan, không phải explain/performance evidence. P02 tạo collections/indexes trước transaction, P44 đo query thật. Tránh index raw identity/private data; sensitive lookup hash là keyed HMAC và access-restricted, không plain SHA của phone/CCCD dễ dò.

- Contact(channel,lookupKey) partial unique VERIFIED; verified new before old replaced, duplicate link conflict; pending OTP/contact records không khóa mọi guest signup vĩnh viễn.
- Applicant activePendingContactKey/identityLookupKey partial unique khi PENDING/UNDER_REVIEW; approved provisioningUserId unique sparse; reject/reapply server clock>=30 ngày, không xóa rejected history để né quota.
- Offer(visitId) partial unique PENDING; Assignment(visitId) partial unique active. Không đủ để chống overlapping time intervals của sitter, cần occupancy guard dưới.
- OccupancyGuard(sitterId,localDate) unique. Mọi availability/assign/accept/reassign/reschedule tác động eligibility chạm cùng guards theo sorted order. Interval spanning midnight lấy mọi ngày ảnh hưởng kể cả buffer/travel; boundary guard rule không chỉ date của start.
- SettlementRequest(sitterId,requestWeekKey) unique cho mọi state. ActiveEarningReservation(earningId) unique active, Paid consumption permanent logical source dedup. MoneyOperation(logicalOperationId)+LedgerEntry(lineKey) unique; Payment(provider,eventId/reference) unique receipt identity sau adapter chuẩn hóa.
- Idempotency(actorRef,operation,resourceRef,key) unique; Outbox(eventId) unique; Notification(recipient,eventId,noticeType) unique; session tokenDigest unique, expiresAt TTL chỉ cleanup.
- List indexes theo actual API filter/sort: Pet(ownerId,state,createdAt,_id); Booking(customerId,createdAt,_id); Visit(sitterId,startAt,_id)/operational(state,startAt,_id); Case(visitId,kind,state); Earning(sitterId,earningPeriodKey); payroll(sitterId,requestWeekKey). Projection/pagination/auth at DB boundary, không N+1 đọc toàn profile cho board.

## Unit-of-work và locks

Command bắt đầu auth/context + schema validation, tìm idempotency; transaction đọc current version/policy/clock, CAS affected entity và ghi guards, kiểm tra conflicts/eligibility, reserve money/slot, append ledger/audit/outbox và persist result. Retry transaction phải recheck state/deadline; external effect chỉ xử lý sau commit qua outbox. Pending commit uncertainty query same operation/result, không phát command mới/key mới để “thử lại”. Không tạo network calls trong transaction.

Hai accept trên cùng visit hoặc hai visit overlapping cùng sitter sẽ cạnh tranh trên guard write; transaction thua retry rồi thấy occupancy đã commit, trả SLOT_CONFLICT/INVALID_STATE. Guard day version cũng phải được Availability update chạm để chống accept đọc availability cũ. Guard không TTL-delete khi còn mutation/assignment liên quan; multi-day/buffer locks dùng order ổn định.

Refund với payout cùng reserve earning/allocation sources và ledger operation ID; không có request-week key mới nào tái sử dụng paid/reserved earning. State+ledger+outbox fail cùng nhau, không state success rồi ledger fail. Unknown bank/manual transfer result giữ TRANSFER_PENDING/reconciliation; Paid chỉ khi evidence theo FIN-07 được duyệt. Policy tiền chưa đóng thì rollback DECISION_REQUIRED trước money write.

Audit giữ actor/role/action/resource/policyVersion/decisionVersion/reason/correlationId/UTC, không token/contact/access notes/raw webhook secrets. TTL/retention/media deletion, applicant capability TTL và idempotency replay duration là OPEN configuration decisions; không dùng TTL như enforcement auth/offer deadline/weekly quota.
