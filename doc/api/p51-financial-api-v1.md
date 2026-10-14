# P51 — API, trạng thái lỗi và acceptance v1.0

Ngày 14/10/2026. Thiết kế đề xuất cho P01, chưa có endpoint/schema chạy. Quy tắc tiền và gate duyệt ở [hợp đồng nghiệp vụ](../requirements/p51-financial-contract-v1.md), ràng buộc dữ liệu ở [ledger](../database/p51-financial-ledger-v1.md). Tên route và DTO là draft, không đăng ký router trong P51.

## Envelope và command contract

Response gồm data hoặc error {code, message, decisionIds, correlationId}, serverNow UTC, entityVersion, policyVersion, decisionVersion. Không trả stack trace/secret/PII. Command dùng Idempotency-Key và expectedVersion; server tạo actor/cause, amount và weekKey. Payload cùng key khác fingerprint → 409 IDEMPOTENCY_CONFLICT; replay cùng payload trả resource/result gốc, không chỉ recompute preview.

Key scope = actor + operation + aggregate + key. Server lưu fingerprint, result và trạng thái processing atomically; duplicate đang chạy trả 202 COMMAND_PENDING với result reference. Thời hạn key/retention do P01 chốt, phải dài đủ cho retry/provider reconciliation. Auth được kiểm tra lại cả khi replay. Preview dùng POST nhưng không là mutation tiền; response chỉ là preview không có hiệu lực đến khi commit kiểm tra lại version/deadline/eligibility.

| Route draft | Actor / request chính | Result và gate |
| --- | --- | --- |
| POST /api/v1/bookings/{id}/cancellation-previews | Customer owner; visitIds, intent=CANCEL | Per-visit eligible/reasons, basis/retained/refund hoặc amount=null + decisionIds; không ghi ledger |
| POST /api/v1/bookings/{id}/cancellations | Customer owner; visitIds, previewId, expectedVersion | Cancellation resource và affected visits; recheck cutoff, paid allocations và FIN-02; đề xuất batch atomic, không partial success ngầm |
| POST /api/v1/visits/{id}/withdrawals | Assigned sitter; reason, expectedVersion | Withdrawal resource, assignment released và needsAction; không hủy Customer booking/charge Customer |
| POST /api/v1/bookings/{id}/change-requests | Customer owner; selected visitIds, newSlots, expectedVersion | ChangeRequest pending; FIN-04 chưa đóng thì DECISION_REQUIRED, lịch cũ không sửa |
| POST /api/v1/change-requests/{id}/decisions | Approver chờ FIN-04; accept/reject, version | Applied chỉ khi Customer đã chọn/đồng ý lịch, approver được duyệt, slot/price/gates hợp lệ; không mặc định Staff/Admin có quyền khi FIN-04 mở |
| POST /api/v1/bookings/{id}/payment-intents | Customer owner; quoteVersion, expectedVersion | Pending intent cho multi; amount từ snapshot server, FIN-01-TIME/02 gate; không nhận amount tùy ý |
| POST /api/v1/payment-webhooks/payos | Verified provider adapter | Verify signature/reference/amount/currency, dedup receipt; paid hoặc reconciliation. Signature contract cụ thể P31 xác minh bằng provider docs/test sau |
| GET /api/v1/bookings/{id}/financial-summary | Customer owner; Staff scope vận hành; Admin | Paid, allocated, retained, refundDue/refunded, billing state, decision blockers; không bank/PII khác |
| POST /api/v1/refund-proposals | Staff/Admin; cancellation/case reference, evidence | Proposed; liên kết eligibility, không vượt còn lại; Customer không tự tạo Paid refund |
| POST /api/v1/refunds/{id}/decisions | Admin; approve/reject, version | Approve atomically reserves refund amount; reject không Paid; duplicate không reserve lần hai |
| POST /api/v1/refunds/{id}/transfer-records | Admin; reference, paidAt, evidence reference, version | Record thực ngoài hệ thống → Paid khi đủ evidence/đối soát; unknown transfer → pending, không tự gửi tiền |
| GET /api/v1/me/earnings | Sitter | Chỉ earnings của session, accrued/available/reserved/paid/held tách riêng |
| POST /api/v1/settlement-requests | Sitter; earningIds, expectedVersions | Submitted + request-week server + reservation atomic, FIN-07 gate; client không gửi weekKey/amount có hiệu lực |
| POST /api/v1/settlement-requests/{id}/withdrawals | Sitter owner; version | Chỉ trước transfer theo FIN-08-EDIT; release đủ điều kiện, quota vẫn dùng |
| POST /api/v1/settlement-requests/{id}/decisions | Admin; approve/reject, version | Approval riêng với Paid; reject giữ quota, release chỉ khi không có transfer unresolved |
| POST /api/v1/settlement-requests/{id}/transfer-records | Admin; reference, paidAt, evidence reference | Paid dựa evidence, chuyển reserved → paid một lần; không payout API |
| GET /api/v1/payroll | Admin; pagination/filter | Payroll scope Admin; Staff forbidden, Sitter dùng /me/earnings |

Codes đề xuất: 401 UNAUTHENTICATED; 403 FORBIDDEN; 404 RESOURCE_NOT_FOUND (P01 thống nhất cách tránh enumeration); 422 INVALID_VISITS/DUPLICATE_VISIT_IDS/INVALID_SLOT; 409 VERSION_CONFLICT/DEADLINE_PASSED/INVALID_STATE/ALREADY_CANCELLED/WEEK_QUOTA_USED/EARNING_RESERVED/DECISION_REQUIRED; 202 PAYMENT_RECONCILING/TRANSFER_PENDING/COMMAND_PENDING; 503 PROVIDER_UNAVAILABLE. Error phải chỉ ra decision IDs khi chưa đủ policy, không trả success với số tiền 0 thay cho chưa biết. Provider outage không tự Paid hoặc Overdue.

## Event contract đề xuất

Envelope: eventId, logicalOperationId, aggregateId/version, type, occurredAt UTC, actorRef, correlationId, policyVersion/decisionVersion, payload schemaVersion. Outbox ghi cùng state/ledger; consumer dùng eventId để chống lặp. Payload chứa IDs/amount cần thiết, không raw bank data, address/access notes hoặc toàn bộ complaint.

| Event | Consumer / điều kiện |
| --- | --- |
| PaymentVerified / PaymentReconciliationRequired | P31 ghi receipt; P21 chỉ dispatch verified active eligible intent, không callback cũ/expired |
| VisitCancellationCommitted | P25/P32/P33; snapshot visit set, cause, calculated retention/refund và ledger refs duy nhất |
| AssignmentWithdrawn | P21/P24/P33; needsAction/reassignment, không Customer cancellation fee |
| ChangeRequestApplied | P25/P21/P31; swap slot và allocation đã commit; không bill lần hai |
| RefundApproved / RefundTransferRecorded | P32/P41; reserve rồi đối soát transfer, không trigger automatic payout |
| EarningHeld / EarningReleased | P29/P30/P31/P41; case ref và phần affected, amount/eligibility phải được FIN-07 duyệt |
| SettlementSubmitted / SettlementRejected / SettlementWithdrawn / SettlementTransferRecorded | P41/P28/P33; quota/reservation references, paid chỉ từ transfer evidence |

## Ma trận kiểm chứng cho implementation

Tất cả case dưới là acceptance được rà soát tĩnh, **NOT_RUN_RUNTIME**. P51 chỉ kiểm tra tài liệu/links/phép tính, không chạy API, DB, provider hay race. Test owner downstream theo phân công P01/P25/P31/P32/P41; không coi reviewer Đạt là người đã chạy integration tests.

| Case | Input / cạnh tranh | Expected và gate |
| --- | --- | --- |
| AC-01 | Cancel/withdraw server còn 60:01, 60:00, 59:59; client chỉnh clock | Hai mốc đầu allow, cuối deny self-service; dùng recheck clock tại commit, không timestamp client |
| AC-02 | Customer đọc/hủy booking khác; sitter rút assignment cũ/khác | Deny trước tiền/state/serializer; không lộ preview của owner khác |
| AC-03 | Staff approve refund/payroll/transfer; Guest gọi command | Forbidden; Admin route đúng scope; provider callback không dùng session Customer |
| AC-04 | Một visit postpay chưa thu hủy hợp lệ | Zero charge/refund, không tạo payment/earning giả; cutoff vẫn áp dụng |
| AC-05 | Multi đã paid hủy một/all future sau có completed | Chỉ affected eligible visits; giữ paid các visit khác, loại completed/staffclosed khỏi cancel; FIN-02 rounding còn gate |
| AC-06 | visitIds rỗng/trùng/ngoài booking, mixed eligible/ineligible | Validation/conflict, đề xuất không mutate subset ngầm; batch semantics P01 chốt |
| AC-07 | Sitter-cause/no-sitter hoặc Customer gửi thay operator | Server cause xác minh; không giữ30%; alternatives/refund phần chưa cung cấp; FIN-06 taxonomy gate |
| AC-08 | Hai cancel cùng version, key giống/khác; timeout sau commit | Một logical operation, replay kết quả; stale version conflict, không retention/refund trùng |
| AC-09 | Cancel đồng thời accept/manual assign/check-in | Atomic version + assignment/slot lock; một kết quả hợp lệ, không cancel rồi accept bằng stale version |
| AC-10 | Cancel/expiry đồng thời payment callback hoặc callback link cũ | Receipt verified dedup, không revive booking; reconciliation cho late/stale; FIN-01-TIME/02 quyết định disposition |
| AC-11 | Webhook signature sai, amount/currency/ref sai, lặp; return URL success | Không Paid từ browser hoặc callback invalid; replay không thêm receipt/ledger; unknown vẫn reconcile |
| AC-12 | Provider unavailable/timeouts | Pending/error/retry, không tự overdue/paid; retry cùng logical reference |
| AC-13 | Reschedule trước12h/đúng12h/1–12h, slot24h, expiry6h | Không apply đến FIN-04 quyết định; cancel60min vẫn độc lập; rejected/expired giữ lịch cũ |
| AC-14 | Change applied đồng thời accept/cancel, stale availability, new slot trùng | Một swap atomic; old offers invalidated, tiền không nhân đôi; không chọn lịch tự động |
| AC-15 | Refund approve/transfer lặp hoặc refund chạy với settlement | Tổng refund không vượt paid eligible; chung reservation lock, không reserve hai phía; transferred unknown giữ reconcile |
| AC-16 | Hai settlement request cùng tuần từ hai thiết bị | Unique sitter+requestWeek, một request thắng; idempotent retry không dùng quota lần hai |
| AC-17 | Sunday 18/10/2026 23:59:59 VN và Monday19/10 00:00 | Week keys2026-10-12 và2026-10-19; UTC16:59:59/17:00:00; không rolling7days |
| AC-18 | 31/12/2026 và01/01/2027; earning tuần cũ | Cùng week key2026-12-28; không reset theo calendar year; earning-period không là request-week |
| AC-19 | Request tuần mới reserve cùng earning đang reserved/paid tuần trước | Deny dù quota tuần mới trống; earning identity lock xuyên tuần |
| AC-20 | Reject/withdraw rồi submit lại cùng tuần; transfer đang xử lý | WEEK_QUOTA_USED; release reservation không reset quota; pending transfer không release mù |
| AC-21 | Approved request chưa chuyển hoặc thiếu evidence | Chưa Paid, không tạo payout API; FIN-07 evidence/eligibility gate |
| AC-22 | Refund/complaint mở sau payout; staff-close không ảnh | Hold/reconciliation/adjustment có audit; không tự debit/earning, FIN-07 policy gate |
| AC-23 | Amount100.001, discount remainder, cancel chia nhiều lần | Integer conservation, không kết quả rounding trước FIN-02-ALLOC/ROUND; không vượt basis |
| AC-24 | UI/API empty/error/forbidden/pending, mạng mất sau command | Không fake ack; fetch result theo operation key; UI360px/keyboard/touch do gói UI kiểm chứng sau |
