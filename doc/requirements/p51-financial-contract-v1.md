# P51-A — Hợp đồng tài chính và chính sách hủy v1.0

> Cập nhật 30/10/2026: [quyết định FIN-07/FIN-08](finance-decisions-2026-10-30.md)
> đã chốt điều kiện eligibility, hold, adjustment sau payout và giới hạn sửa/rút
> request. Các mục bên dưới là lịch sử hợp đồng; source/payment/allocation và
> assessment thuế cụ thể vẫn phải được xác minh trước khi tạo tiền khả dụng.

Ngày 14/10/2026, Asia/Ho_Chi_Minh. Phạm vi EXT-FINANCIAL; contributor được giao Nguyễn Hữu Anh Nhật, reviewer Đoàn Tiến Đạt, merge cuối Nguyễn Ngọc Thành. Đây là hợp đồng thiết kế, chưa có runtime, provider hoặc schema triển khai. Approval PR xác nhận chất lượng tài liệu; không tự đóng các quyết định nghiệp vụ còn mở.

## Nguồn, phiên bản và hiệu lực

- [P00 decisions v1.0](p00-decisions-screens-v1.md) và [crosswalk](p00-source-crosswalk-v1.md): SRS change log 09/10/2026, delta người dùng 14/10/2026. Các locator tNrM là table/row, không phải số trang.
- [P49 benchmark](../references/rover-housebuddy-benchmark.md): dùng nguyên tắc tách xác nhận/offer/assignment và giữ lịch cũ khi thay đổi chưa được chấp nhận; không nhập cutoff hay phí đối thủ vào PWC. Không nghiên cứu web mới trong P51.
- Người dùng duyệt phương án FIN-01–08 trong phiên P51 ngày 14/10/2026, với câu trả lời “Duyệt phương án trên; chi tiết còn thiếu chờ chốt”. Bảng dưới giới hạn hiệu lực theo đúng nội dung đã trình để duyệt. Không suy ra người dùng duyệt mọi chi tiết của đề xuất cũ.
- Tài liệu Drive chưa được sửa. Hợp đồng API/data là đề xuất kỹ thuật bàn giao P01; tên enum/route cần P01 chuẩn hóa. Chính sách public chỉ được xuất bản phần đã chốt với version/ngày hiệu lực do P17/P45 quản lý.

## Quy tắc đã xác nhận

| ID | Hợp đồng đã chốt | Giới hạn |
| --- | --- | --- |
| EXT-01/02 | Booking một visit có thể postpay; nhiều visit bắt buộc prepay | Số visit của booking gốc xác định payment mode; hủy còn một visit không tự đổi sang postpay |
| EXT-03 | Customer tự hủy và sitter tự rút khi server time còn ít nhất 60 phút trước visit | Đúng 60:00 cho phép, 59:59 chặn self-service; đang chăm sóc không self-cancel |
| EXT-04 | Customer chọn visit và lịch mới khi reschedule | Không tự chuyển ngày/giờ; cutoff hủy không là cutoff đổi lịch |
| EXT-05 | Paid multi-visit, Customer hủy không reschedule: giữ 30% phần đủ điều kiện bị hủy | Một visit postpay hủy hợp lệ miễn phí; không thu phí mới từ khoản chưa trả |
| EXT-06 | Sitter tối đa một settlement request mỗi tuần lịch Việt Nam | Tuần gửi request khác kỳ earning; Admin xem payroll |
| FIN-01 | Thu đủ prepay trước khi gửi offer | Customer xác nhận giá/lịch; directed sitter còn cần Customer confirmation trước offer; Paid không là Assigned |
| FIN-02 | Basis là tiền thực trả được phân bổ theo visit, tính trên phần visit bị hủy | Không dùng giá niêm yết gross thay basis; allocation, thuế/phụ thu/discount và rounding còn mở |
| FIN-03 | Chỉ tính retention trên buổi tương lai được phép hủy | Buổi đã thực hiện giữ doanh thu dịch vụ riêng; không hoàn hoặc phạt buổi đã làm qua thao tác hủy phần còn lại |
| FIN-05 | Chuyển tiền sang lịch mới cùng dịch vụ/pets/scope | Không đồng thời refund rồi thu lại; giá/scope đổi cần preview và Customer đồng ý, công thức chênh lệch còn mở |
| FIN-06 | Lỗi sitter/vận hành: Customer chọn phương án khác hoặc hoàn phần chưa cung cấp, không giữ 30% | Sitter rút không tự hủy cả booking; taxonomy nguyên nhân, force majeure và bồi thường ngoài refund chưa chốt |
| FIN-07 | Earnings đủ điều kiện, không hold mới tất toán; Admin duyệt và ghi chuyển khoản ngoài hệ thống | Approved không là Paid; không tạo wallet hoặc gọi API payout; định nghĩa eligibility/hold còn mở |
| FIN-08 | Request bị từ chối/rút vẫn dùng quota tuần | Sửa/bổ sung cùng request theo state; release reservation không khôi phục quota |

## Quyết định còn mở và gate

Tất cả mục dưới có owner quyết định là Leader/nhóm; P01 chuẩn hóa kỹ thuật sau khi có quyết định. Không dùng cấu hình mặc định để che gate. Bản preview có thể báo số tiền chưa xác định, nhưng thao tác ghi tiền phụ thuộc phải từ chối với decision IDs.

| ID | Cần chốt cụ thể | Phần bị chặn / phương án review |
| --- | --- | --- |
| FIN-01-TIME | Hạn intent, giữ slot, proposal/offer; xử lý payment đến sau expiry | Chặn bật thu tiền/dispatch thật. Đề xuất intent có expiry hữu hạn, callback muộn vào reconciliation; chưa chọn số phút |
| FIN-02-ALLOC | Phân bổ tổng tiền thực trả cho visit/pet, discount/thuế/phụ thu, phần không thuộc dịch vụ | Chặn snapshot tiền và retention thật. Chọn trọng số dựa trên quote và quy tắc remainder để bảo toàn tổng; chưa chọn thuật toán |
| FIN-02-ROUND | Làm tròn VND và phạm vi rounding theo visit hay tổng tập hủy; hủy nhiều lần | Chặn retention/refund thật. Quyết định phải bảo đảm cancel một lần hay chia nhiều lần không đổi nghĩa vụ tiền |
| FIN-04 | Giữ/đổi mốc request >=12h, slot mới >=24h tính từ lúc gửi, expiry 6h trước lịch cũ, Staff approval; cửa sổ 1–12h | Chặn reschedule thật. Phương án A giữ mốc SRS và không cho 1–12h; B cho 1–12h với expiry/slot/approval mới rõ ràng. Không tự chọn A hoặc B |
| FIN-05-DELTA | Giá/scope đổi, nguồn bù chênh lệch và vòng đời visit thay thế | Chặn đổi scope/giá và điều chuyển chênh lệch; cùng scope vẫn cần FIN-04/02 |
| FIN-06-CAUSE | Ai xác minh cause; no-sitter/no-show, emergency/force majeure; thời hạn refund và remedy | Chặn xử lý ngoại lệ chưa phân loại; không gán Customer-cause từ actor gửi lệnh |
| FIN-07-ELIG | Commission/rate earning, khi nào service earned/available, case hold và due 48h sau hold, staff-close thiếu evidence | Chặn earnings khả dụng và billing staff-close. Đề xuất hold phần liên quan case, giải phóng có audit; chưa chốt số tiền/clock |
| FIN-07-POSTPAY | Refund/adjustment sau payout, xử lý số dư âm và evidence chuyển tiền | Chặn tự trừ payout sau này/thu hồi tiền; đề xuất adjustment riêng có phê duyệt, chưa chọn debt policy |
| FIN-08-EDIT | Request được sửa ở state nào, reject/withdraw khi transfer đang xử lý | Chặn mutation sau approve/transfer; đề xuất không release earnings khi có transfer chưa đối soát |

Trạng thái: DOCUMENT_CONTRACT_READY_WITH_OPEN_DECISIONS; MONEY_IMPLEMENTATION = BLOCKED_BY_DECISION; RUNTIME = INTEGRATION_PENDING. P01 có thể thiết kế DTO/ports, nhưng không gọi toàn hợp đồng tài chính đã chốt.

## Phân tách trạng thái và transition

Các tên sau là draft cho P01. Mọi command kiểm tra role, ownership, policy version, expected entity version và server clock tại điểm commit; retry cùng key không tạo event/tiền lần hai.

| Aggregate | Transition / actor | Điều kiện và kết quả |
| --- | --- | --- |
| BookingProposal | Draft → AwaitingCustomer → Confirmed/Rejected/Expired; Customer xác nhận | Chỉ directed flow; confirmed vẫn chưa là sitter accepted. Stale availability cần preview mới |
| Booking | Draft → AwaitingPayment → DispatchPending; Customer/provider | Multi chỉ vào DispatchPending sau verified payment đủ tiền và FIN-01-TIME; single postpay đi DispatchPending sau xác nhận hợp lệ |
| Booking | DispatchPending → Active; assignment service | Offer được sitter accept, eligibility/slot recheck atomic; paid flag riêng. Không suy ra tất cả visit đã assigned từ một offer |
| Visit | Scheduled/Assigned → Cancelled; Customer | Tập visit thuộc booking/chủ, chưa InProgress/Completed/StaffClosed, cutoff đủ; cause Customer, no-reschedule; ledger theo FIN-02 gate |
| Assignment | Assigned → Withdrawn; sitter đang được giao | Cutoff đủ, release assignment và đưa điều phối lại; không tự đánh Cancelled toàn booking hoặc giữ 30% từ Customer |
| Visit | Assigned → InProgress → Completed; sitter/care module | Evidence theo P27. StaffClosed là terminal riêng với reason, bill/earning eligibility chờ FIN-07-ELIG |
| ChangeRequest | Proposed → AwaitingApproval → Applied/Rejected/Expired | Customer chọn slot; approver/deadline chờ FIN-04. Lịch cũ còn hiệu lực đến khi Applied; swap slot, invalidate old offers và chuyển allocation atomic |
| PaymentIntent | Pending → Paid/Failed/Expired; provider/system | Webhook xác minh signature, amount, currency, reference và intent. Callback muộn/cũ/sai vào reconciliation, không Paid bằng return URL |
| Bill | Draft → OnHold/Issued → Paid/Adjusted | Postpay bill sau dịch vụ đủ điều kiện; hạn 48h baseline, cách pause/restart hold còn mở. Multi dùng chứng từ khoản đã thu, không phát sinh bill thu lại toàn bộ |
| Refund | Proposed → Approved → TransferPending → Paid/Failed; Proposed → Rejected | Staff đề xuất, Admin approve, Admin ghi evidence chuyển ngoài hệ thống; Rejected không chuyển tiền; approved giữ reservation refund, không ghi Paid khi chưa chuyển |
| Earning | Accrued → Available → Reserved → Paid | Amount/eligibility theo FIN-07; hold riêng. Reserved thuộc một request; paid có transfer evidence |
| SettlementRequest | Submitted → Approved → TransferPending → Paid/Failed; Submitted → Rejected/Withdrawn | Sitter submit/withdraw phần được phép, Admin approve/reject/record. Rejected/Withdrawn là terminal, giữ quota, không đi TransferPending; chỉ release reservation khi chắc chắn chưa transfer |

Booking lifecycle được tổng hợp từ các visit đang hoạt động; cancel một visit không làm các visit còn lại Cancelled. Cancel-all là chọn mọi visit chưa thực hiện còn đủ điều kiện, không bao gồm terminal history. Đề xuất batch all-or-nothing: nếu một visit không đủ điều kiện, trả conflict cùng preview mới, không âm thầm bỏ visit đó. P01 cần chốt semantics này trước endpoint thật.

Mọi thành công thay đổi trạng thái và tiền phải có audit actor/cause, policyVersion, decisionVersion, correlationId, timestamp UTC; commit state/ledger/outbox cùng transaction hoặc cơ chế atomic do P01 lựa chọn. Network timeout sau commit trả trạng thái pending phía client, replay đọc kết quả đã ghi.

## Tiền, ledger và ví dụ có điều kiện

Currency VND, amount integer, không dùng float; basis không suy từ số tiền client gửi. Xem [data/ledger](../database/p51-financial-ledger-v1.md). Thu tiền, earned service, cancellation retained, refund reserved/paid, earning available/reserved/paid là các bucket khác nhau. Retention không tự thành earning của sitter.

Giả định minh họa duy nhất: ba visit cùng scope, mỗi visit phân bổ thực trả 300.000 VND, tổng thu xác minh 900.000 VND; không thuế/discount/phụ thu, các visit tương lai đủ cutoff, không hold/refund trước. Số tiền này là fixture toán học, không là bảng giá hoặc quyết định rounding.

| Case | Earned service / retained | Refund hoặc transfer | Unfulfilled allocation |
| --- | --- | --- | --- |
| Single postpay chưa thu, hủy hợp lệ | 0 / 0 | 0, không tạo refund | 0 |
| Multi hủy một visit không đổi lịch | 0 / 90.000 | 210.000 refund due, chưa Paid | 600.000 |
| Hủy cả ba tương lai | 0 / 270.000 | 630.000 refund due | 0 |
| Một visit đã thực hiện, hủy hai còn lại | 300.000 / 180.000 | 420.000 refund due | 0 |
| Chuyển một visit cùng scope | 0 / 0 | 300.000 chuyển allocation nội bộ, không refund hoặc receipt mới | 900.000 tổng gồm visit thay thế |
| Lỗi sitter/vận hành làm mất một visit | 0 / 0 | 300.000 refund due hoặc chuyển sang phương án Customer chọn | 600.000 nếu hoàn |

Ở các case refund chưa chuyển, collected = service earned + retained + unfulfilled allocation + refund due. Sau chuyển refund: refund due giảm đúng amount, refunded paid tăng tương ứng. Refund due gồm khoản chưa approved và reserved; không cộng reserved lần nữa. Đây là conservation constraint trong giả định, không phải chart of accounts kế toán cuối cùng.

Giá 100.001 VND cho một allocation có 30% = 30.000,3 VND: chưa có kết quả tiền nguyên cho đến FIN-02-ROUND. Không tự floor/ceil/round. Hủy tập S theo policy đã duyệt tính retention một lần theo logical cancellation, lưu tính toán để replay; nhiều cancellation trên cùng allocation không được vượt basis hoặc thay kết quả do chia lệnh.

## Ranh giới quyền và bảo vệ tranh chấp

Customer chỉ đọc và xử lý booking của mình; sitter chỉ rút assignment và xem earnings/request của mình. Staff điều phối/đề xuất exception/refund, không approve refund hoặc đọc payroll chỉ vì là Staff. Admin kế thừa Staff và approve refund/payroll; quyền settlement review/record là phương án đã được duyệt ở phiên này. Provider callback là route service xác thực riêng, không là session Customer.

Client không chọn cause, paid status, refund/retention amount, week key hoặc ownerId có hiệu lực. Server tính từ record đã authorize. Serializer chỉ trả phần liên quan; không trả thông tin ngân hàng/PII, home access hoặc private case notes qua financial views. Proposal/preview không giữ slot hoặc chuyển tiền trừ khi contract reservation được chốt.

Race và acceptance đầy đủ ở [API contract](../api/p51-financial-api-v1.md). Refund với settlement phải khóa cùng eligible earning/allocation: nếu payout đã chuyển hoặc đang không rõ kết quả thì reconciliation/hold, không giả release khoản đó. Late callback được ghi receipt duy nhất và pending reconciliation; không tự phục hồi booking cancelled/expired hay tạo assignment.

## Bàn giao theo gói

P01 chuẩn hóa schema/DTO/enums/error codes/atomic strategy từ các đề xuất này; P17/P45 version policy đã chốt và không publish proposal; P19/P21/P42 dùng payment/confirmation/assignment gates riêng; P25 dùng cancellation/reschedule; P31 ledger/callback/bill; P32 refund; P41 weekly settlement. P34 quản lý wiring và final integration. FIN còn mở được giữ ở bảng trên và trong [handoff](p51-handoff.md); không sửa shared schema/router hoặc tự triển khai các gói đó trong P51.

## Bổ sung ngày 16/10/2026

Người dùng đã chốt phí lũy tiến 10%/9%/8%/7% theo booking hoàn tất mỗi tuần
Việt Nam, không hồi tố các booking trước. Xem [quyết định và nghiên cứu thuế](p41-weekly-commission-and-tax-2026-10-16.md).
Mục này chốt bậc phí, đơn vị đếm và rounding half-up VND/đồng thuế lẻ do nền tảng chịu; chưa đóng eligibility, hold, cơ sở
và tax-regime gate. Không dùng 10% cố định hay một tỷ lệ thuế chung cho mọi sitter.
