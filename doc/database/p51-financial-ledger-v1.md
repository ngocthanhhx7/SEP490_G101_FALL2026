# P51 — Dữ liệu, ledger và khóa tài chính v1.0

Ngày 14/10/2026. Logical data contract đề xuất cho P01/P31/P32/P41; chưa có Mongoose schema, migration, DB hoặc explain plan. [Nghiệp vụ và quyết định](../requirements/p51-financial-contract-v1.md), [API/events/acceptance](../api/p51-financial-api-v1.md) là cùng phiên bản v1.0.

## Records và snapshot

| Record | Trường logic cần thiết | Invariant / gate |
| --- | --- | --- |
| Booking | customerId, visitIds, serviceId/petIds, originalVisitCount, paymentMode, quoteVersion, policyVersion, decisionVersion, version | Multi gốc không chuyển postpay khi chỉ còn một buổi; policy snapshot không đổi khi Admin sửa policy tương lai |
| Visit/Assignment | bookingId, schedule UTC, sitterId/assignmentVersion, state, cause, evidence refs, replacedBy/from | Chỉ một assignment hợp lệ; Completed/StaffClosed không self-cancel; staff-close earning gate FIN-07 |
| VisitAllocation | visitId, quote/payment refs, allocatedPaidVnd, consumedServiceVnd, retainedVnd, refundDueVnd, refundedVnd, transferredTo/from refs | Basis actual paid; FIN-02 allocation/rounding bắt buộc; không sửa snapshot âm thầm |
| Cancellation | bookingId, affected visitIds, actor, verifiedCause, cutoffEvaluatedAt, policy/decision versions, calculation refs, operationId | Một visit/portion chỉ bị retained/refunded một lần; lưu kết quả không tính lại từ giá mới |
| ChangeRequest | selectedVisitIds/newSlots, originalVersions, decision, expiresAt, approver, transfer refs | Customer chọn slot; lịch cũ tới Applied, FIN-04/05 gate; replaced visit không bị bill/earning lần hai |
| PaymentIntent/Receipt | booking/quote refs, provider reference/eventId, amountVnd, currency, status, expiresAt, verifiedAt, reconciliationReason | Chỉ verified receipt đủ amount/ref mới Paid; retain receipt muộn để reconcile, không tự activate expired intent |
| Bill | paymentMode, service allocation refs, dueAt, hold refs, adjustment refs, state | Multi không thu lại principal prepay; postpay48h clock dưới hold còn mở |
| Refund | cancellation/case/allocation refs, amountVnd, proposed/approved actor/time, reservation, transfer/evidence refs, state | Refund approval không Paid; tổng reserved+paid refund không vượt remaining refund entitlement |
| Earning | earningId, sitterId, sourceVisit/allocation refs, earningPeriodKey, earnedVnd, heldVnd, availableVnd, reservedVnd, paidVnd, adjustment refs | Rate/eligibility FIN-07; paid service không đồng nghĩa earning đã chuyển sitter |
| SettlementRequest | sitterId, requestWeekKey, submittedAt, earningIds/reservations, amount snapshot, decisions, transfer/evidence refs, state | Key tuần do server tính; rejected/withdrawn giữ record/quota, không xóa để gửi lại |
| MoneyOperation/LedgerEntry | operationId, source refs, bucket/from/to, amountVnd, currency, policy/decision versions, actor/cause, immutable timestamp | Ledger append-only; reversal/adjustment record riêng, không overwrite entry đã publish |
| Idempotency/Outbox/Audit | actor/operation/aggregate/key, payload fingerprint/result; eventId+aggregateVersion, correlationId | State/ledger/outbox commit đồng thời; consumer dedup; không log raw PII hoặc credentials |

Amounts là integer VND không âm ở các allocation/reservation balances, validate safe range theo kiểu số P01 chọn; không dùng binary floating-point cho tỷ lệ 30%. Tính rational 3/10 rồi áp thuật toán rounding được duyệt, không dùng Math.round như policy mặc định. Bảng bucket trên là conservation model, không tự chốt double-entry chart of accounts hoặc doanh thu kế toán/thuế.

## Phân bổ và bảo toàn

- Sum allocatedPaidVnd của booking = khoản tiền dịch vụ thực trả được xác minh; FIN-02 phải quyết định xử lý non-service components và discount remainder trước khi lưu snapshot.
- Trên phần đã thu: collected = service consumed + cancellation retained + active allocation + refund due + refunded paid. Refund reservation là subset refund due; không cộng lần nữa. Transfer allocation tới visit thay thế không tăng collected và có cặp from/to cân bằng.
- Refund Paid giảm refundDue và tăng refunded đúng amount; refund Failed có kết quả unknown phải reconcile, không tự release reservation để chuyển lần nữa.
- Available earning chỉ từ eligibility đã duyệt; earned = held + available + reserved + paid trong mô hình không có adjustment. Adjustment lưu riêng, FIN-07-POSTPAY cần định nghĩa debt/negative policy trước khi tính tổng có adjustment.
- Commission, cancellation retained và sitter earning là các khái niệm riêng. Không tự chia30% cho sitter, tạo ví, hoặc dùng collected - refunded làm available earning.
- Operations độc lập có logical source refs; refund total vượt entitlement, earning reserve lần hai, negative active allocation là lỗi invariant cần rollback/reconcile chứ không clamp về0.

## Tuần Việt Nam và khóa xuyên kỳ

requestWeekKey = ngày thứ Hai bắt đầu tuần theo Asia/Ho_Chi_Minh, định dạng YYYY-MM-DD; week interval [Monday00:00, nextMonday00:00). Timestamps lưu UTC. Không dùng week-of-year thiếu week-year, không reset quota ngày01/01. earningPeriodKey riêng, có thể là tuần cũ; không chuyển earning identity khi request tuần mới.

Ví dụ boundary: 18/10/2026 23:59:59 VN =16:59:59Z → key2026-10-12; 19/10/2026 00:00 VN =18/10/2026 17:00:00Z → key2026-10-19. 31/12/2026 và01/01/2027 cùng week2026-12-28.

Khóa logical đề xuất để P01 chọn schema/index/transaction:

| Key | Mục đích |
| --- | --- |
| sitterId + requestWeekKey | Unique quota request kể cả rejected/withdrawn; idempotency retry trả request cũ |
| earningId + activeReservation | Không reserve cùng earning cho hai request, kể cả tuần khác; paid là terminal không available trở lại |
| provider + paymentEvent/reference | Dedup verified receipt; callback cũ vẫn lưu audit, không đưa vào intent mới |
| actor + operation + aggregateId + idempotencyKey | Unique command result và payload fingerprint |
| logicalOperationId + ledgerLineIdentity | Một logical money event chỉ ghi một bộ ledger entries; nhiều dòng cân bằng vẫn hợp lệ |
| visit/assignmentVersion + slot reservation | Cancel/accept/manual-assign/check-in/reschedule kiểm tra atomic chung; version của booking một mình chưa đủ |

Không khẳng định unique index đơn giản giải quyết overlapping time intervals. P01/P21 cần chọn lock/serialized slot check và transaction phù hợp. Nếu cần Mongo transaction, runtime/topology hỗ trợ phải được kiểm chứng ở P02; P51 không giả database đã có replica set.

Refund và settlement cùng dùng reservation/eligibility lock trên source earning/allocation: đã reserve payout thì không tự lấy tiền đó để refund, chuyển pending hold/reconcile theo policy; đã paid phải dùng adjustment có phê duyệt sau FIN-07-POSTPAY. Hai weekly quota keys khác nhau không đủ bảo vệ cùng earning.

## Audit và dữ liệu riêng tư

Lưu audit quyết định, actor/cause và evidence reference tối thiểu; transfer reference không phải chứng minh bank integration. P01/P41 chốt yêu cầu evidence và kiểm soát record transfer với FIN-07. Không sao chép số tài khoản thật, bank token, ảnh ID, access notes hoặc raw webhook nhạy cảm vào tài liệu/test fixture. Retention/xóa audit/media là quyết định dữ liệu sau, không tự đặt thời hạn trong P51.

Không có migration hoặc test DB được chạy trong gói này. Acceptance AC-08–23 ở API contract là yêu cầu kiểm thử atomicity, deadline, quota và bảo toàn cho implementation sau.
