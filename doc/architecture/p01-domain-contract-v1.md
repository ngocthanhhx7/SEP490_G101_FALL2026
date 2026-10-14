# P01 — Domain, trạng thái và sự kiện v1

Ngày14/10/2026. Contract kỹ thuật baseline cho P02–P47; chưa có code/runtime. Canonical state tokens/DTO names được liệt kê trong [registry JSON](../api/p01-contract-registry-v1.json); wire dùng UPPER_SNAKE_CASE, chuyển tên draft CamelCase của P51 theo nghĩa tương ứng, không migrate dữ liệu vì chưa có data/runtime. P51 là nguồn policy tiền, P01 không đóng các quyết định còn mở.

Nguồn: [P00 decisions](../requirements/p00-decisions-screens-v1.md), [crosswalk SRS09/10](../requirements/p00-source-crosswalk-v1.md), [P49 benchmark](../references/rover-housebuddy-benchmark.md), [P50 pet dictionary](../requirements/p50-dog-cat-pet-profile-field-dictionary-v1.md) và [P51 financial contract](../requirements/p51-financial-contract-v1.md). P00 snapshot FIN chưa duyệt đã được thay ở phần phương án user duyệt trong P51; không ghi đè lịch sử P00. Nguồn Drive chưa sửa, UC-N/WBS-N còn provisional.

## Ranh giới và owners

P01-A contract owner là Nguyễn Ngọc Thành theo chỉ định mới; reviewer Nhật. Ownership kỹ thuật theo gói dưới không đổi author/contributor thực tế của task sau. Mỗi module dùng contracts v1; thay schema/DTO/state gửi P01/P34 proposal, có compatibility/version/migration và review, không tự ghi đè shared files.

| Miền | Contract / implementation owner theo gói | Ranh giới |
| --- | --- | --- |
| Identity/contact/session | P01 contract; P06–P09 nghiệp vụ, P11/P12 provider | User khác Applicant; Contact verification khác OTP challenge và login session |
| Applicant | P01; P16/P46 | Guest nộp không tạo User; Admin approve mới provisioning sitter account |
| Pet/profile/address | P01; P14/P15/P50; P26 care snapshot | Master profile khác visit snapshot; vaccination source không là verified workflow |
| Availability/catalog/policy | P01; P17/P18 | Local recurring hours/day off/areas khác assignment occupancy; policy version bất biến cho booking |
| BookingProposal/Booking/Visit/Offer | P01; P19–P24/P42 | Customer confirmed, Payment paid, Offer accepted, Visit assigned là bốn tín hiệu riêng |
| ChangeRequest/cancellation | P01; P25; P51 policy | Hủy60min không quyết định reschedule12h/24h/6h |
| Care/case/complaint | P01; P26/P27/P29/P30/P47 | Incident khác complaint, evidence khác bill/earning; private notes riêng serializer |
| Finance | P01; P31/P32/P41, P51 policy | Receipt, bill, refund, earning và settlement tách; không wallet hoặc automatic payout |
| Shared integration | P34; P02/P03 foundation; P04 design | Router/config/exports/lockfiles do owners tích hợp, không task page tự đổi |

## Transitions, điều kiện, events và thông báo

Các nhánh dưới là allowed graph đề xuất kỹ thuật. Unknown transition trả INVALID_STATE; actor không được set state trực tiếp qua generic PATCH. Các transition phụ thuộc quyết định chưa chốt phải fail DECISION_REQUIRED, không “cho chạy tạm”. Event sau commit vào outbox; notice chỉ gửi dữ liệu tối thiểu cho recipients đã authorize, email/SMS delivery không là state success.

| Entity | Transition / actor và điều kiện | Event / notice recipient | Race và gate |
| --- | --- | --- | --- |
| User | ACTIVE → LOCKED → ACTIVE; Admin, audit reason; sitter ACTIVE → SUSPENDED → ACTIVE do Admin | UserLocked/Restored; affected user và Staff điều phối | Tăng authEpoch, revoke sessions, chặn auth ngay; xử lý assignment hiện hữu bằng workflow, không xóa visit |
| Contact | UNVERIFIED → VERIFIED bằng OTP cùng contact/purpose; VERIFIED → REPLACED sau contact mới verified | ContactVerified/Replaced; owner ở kênh phù hợp | Unique canonical verified contact; throttle lockedUntil là record OTP/rate-limit riêng, không Contact/User lifecycle; hai confirm chỉ một link thành công |
| Applicant | PENDING → UNDER_REVIEW → APPROVED/REJECTED; Admin; interview/evidence và reject reason | ApplicantSubmitted/Decided; Admin queue/applicant verified channel | Duplicate pending canonical contact/ID cần secure key; approve và provision User atomic, retry không tạo2 account; reapply>=30 ngày |
| Pet | ACTIVE → ARCHIVED; Customer owner; profile update giữ ACTIVE | PetUpdated/Archived; owner, notify assigned parties chỉ khi snapshot amendment đã xác nhận | Name+species tạo tối thiểu; archive không xóa lịch sử snapshot, không đổi booking đã xác nhận; vaccine unknown không gate |
| Availability | ACTIVE → INACTIVE, revise windows/areas/dayOff; sitter owner, Staff scope | AvailabilityRevised; future affected proposals/Staff | Version change invalidates proposal, không unassign tự động. Local calendar convert UTC theo service date; existing assignment conflicts cần review |
| BookingProposal | DRAFT → AWAITING_CUSTOMER → CONFIRMED/REJECTED/EXPIRED; Customer owner | ProposalConfirmed/Rejected/Expired; Customer; offer chỉ sau payment/directed gates | Stale availability/version conflict; timeout/fallback chưa chốt, không auto confirm |
| Booking | DRAFT → AWAITING_PAYMENT → DISPATCH_PENDING (multi); DRAFT → DISPATCH_PENDING (single postpay); → ACTIVE; terminal COMPLETED/CANCELLED | BookingSubmitted/Activated/Closed; owner và operational Staff | Original visit count snapshot; ACTIVE không nói mọi visit assigned; terminal chỉ khi mọi applicable visit terminal; FIN-01-TIME gate |
| Visit | SCHEDULED → ASSIGNED → IN_PROGRESS → COMPLETED; assigned sitter/check-in evidence; Staff → STAFF_CLOSED có reason; future → CANCELLED theo P51 | VisitAssigned/Started/Completed/Cancelled/StaffClosed; owner/sitter/Staff | check-in từ30min trước; ảnh check-in/out bắt buộc; missing checkout+2h needsAction, không fake Completed; staff-close tiền FIN-07 |
| Offer | PENDING → ACCEPTED/DECLINED/EXPIRED/REVOKED; assigned candidate/system/authorized Staff | OfferDecided/Expired; candidate/Staff, Customer thấy assignment result | Deadline2h hoặc30min khi visit<24h; recheck slot/eligibility/version ở accept, đúng deadline reject; directed confirmation trước dispatch |
| Case | OPEN → UNDER_REVIEW → RESOLVED → CLOSED; Staff, Admin quyết khoản tiền | CaseOpened/Resolved; involved customer/sitter/Staff; private staff notes không gửi | kind INCIDENT/COMPLAINT; Customer complaint7ngày và1 mở/visit, một objection; Sitter create complaint/rating window vẫn mở; hold amount FIN-07 |
| Bill | DRAFT → ON_HOLD/ISSUED → PAID/ADJUSTED; server finance/Admin approved adjustment | BillIssued/Held/Adjusted/Paid; Customer owner/finance authorized | Postpay due48h baseline; hold pause/reset chưa chốt; multi không thu lại principal; callback old bill/version reconcile |
| Payment | PENDING → VERIFIED/FAILED/RECONCILING; verified provider/system | PaymentVerified/ReconciliationRequired; owner và finance | VERIFIED là receipt xác minh, không browser return; amount/ref/signature gate, dedup event receipt. P51 Payment Paid map receipt VERIFIED |
| Refund | PROPOSED → APPROVED/REJECTED; APPROVED → TRANSFER_PENDING → PAID/FAILED; Staff propose/Admin decide/record | RefundApproved/Rejected/TransferRecorded; affected owner/finance | REJECTED terminal; approved không Paid; refund amount/reservation shared earning lock, unknown transfer không retry mù |
| Earning | ACCRUED → AVAILABLE → RESERVED → PAID; finance service, HOLD flag/bucket riêng | EarningAccrued/Held/Released/Reserved/Paid; earning owner | pending eligibility bucket không available; earnings from cancelled visit không tự accrued; FIN-07 gate rates/holds/paid adjustment |
| SettlementRequest | SUBMITTED → APPROVED/REJECTED/WITHDRAWN; APPROVED → TRANSFER_PENDING → PAID/FAILED | SettlementSubmitted/Decided/TransferRecorded; owner/Admin payroll | Reject/withdraw terminal giữ quota; unique VN request-week + earning lock xuyên tuần; FIN-08-EDIT gate sửa/rút |
| ChangeRequest | PROPOSED → AWAITING_APPROVAL → APPLIED/REJECTED/EXPIRED | ChangeApplied/Rejected/Expired; Customer/affected sitter/Staff | Customer chọn slot; lịch cũ tới Applied; FIN-04 approver/time/expiry và FIN-05 giá gate; swap allocation/slot atomic |
| PaymentIntent | PENDING → PAID/FAILED/EXPIRED; server/provider verified payment | IntentPaid/Expired; owner, dispatch consumer | Late/cancelled/expired callback giữ receipt RECONCILING, không revive booking; expiry FIN-01-TIME chưa chốt |

Chưa tồn tại uniform orderStatus. needsAction, monetaryHold, paymentSummary và careReadiness là flag/derived view, không ghi đè lifecycle enum. Sitter withdrawal là assignment transition ASSIGNED → WITHDRAWN (record hỗ trợ), không Cancelled toàn booking. ServicePrice/PolicyVersion và Address/VisitCareSnapshot là versioned records; OTPChallenge, Session, Media, Notification và Outbox có vòng đời hỗ trợ riêng trong [data contract](../database/p01-data-contract-v1.md).

## Consent, snapshot và tính đồng thời

Booking chỉ một service, selected pets của Customer,1–2 slots/ngày, tối đa30 ngày, ít nhất24h trước giờ bắt đầu; snapshot giá/policy/address/instructions và originalVisitCount khi confirm. Customer-directed proposal confirm không bypass sitter accept/payment. Auto-ranking không yêu cầu confirm từng candidate. Contact/role/payment/amount/cause/owner refs do server xác lập, không tin client.

Accept transaction phải chạm cùng Visit version và sitter-day occupancy guard với manual assign/check-in/cancel. Sort guard keys trước khi lấy để tránh lock-order deadlocks. Đọc interval overlaps [start,end) và travel buffer cấu hình trong cùng transaction sau guard write; giữ guard qua commit. Hai transaction chạm cùng guard phải conflict/retry rồi re-evaluate, không chỉ đọc snapshot isolation. Reschedule khóa cả old/new day và affected allocation, invalidates old offer; capacity/buffer không tự cố định30min.

Identity approval/contact link dùng unique index + transaction. Money operations dùng [P51 ledger](../database/p51-financial-ledger-v1.md) và FIN gates, outbox/idempotency cùng commit; producer/consumer at-least-once, logical effects at-most-once bằng dedup, không tuyên bố exactly-once delivery. Review/notify payload không là command có quyền tự sửa trạng thái.

Business clock server UTC; service timezone canonical Asia/Ho_Chi_Minh, Asia/Saigon là input alias được normalize. Date-only YYYY-MM-DD cho birth/vaccine/weight date, không convert qua UTC midnight. Weekly settlement [Monday00:00,nextMonday00:00) VN, key ngàyMonday chứ không calendar-year/week-number. Slot explicit start/end+zone ở input, lưu UTC+local-date audit; reject invalid/ambiguous input thay đoán.

## Gate chưa đóng

9 nhóm FIN của P51 giữ nguyên. AUTH-SECOND-CONTACT: thời điểm bắt buộc kênh thứ hai; APPLICANT-ACCESS: cơ chế scoped verification/TTL; DIRECTED-TIMEOUT: timeout/fallback/proposal hold; PET-SERVICE-READINESS: field bắt buộc theo service; MEDIA-RETENTION: rights/TTL/delete; SITTER-FEEDBACK: window/moderation/visibility và quyền tạo complaint chưa duyệt; AUTH-BOOTSTRAP: initial Admin provisioning; DEPLOY-AUTH: hosting/cookie cross-site. Owners Leader/domain module quyết định; provider config và Figma cũng chưa verified. Parts độc lập có thể tiếp tục, phần phụ thuộc phải trả explicit decision/config gate.
