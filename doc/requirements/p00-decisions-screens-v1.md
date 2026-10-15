# P00 — Quyết định, thuật ngữ và màn hình v1.0

Ngày 14/10/2026. Draft cục bộ, chưa áp dụng lên Drive. Nguồn SRC-01–05, hash/locator và 66 UC/70 WBS ở [crosswalk](p00-source-crosswalk-v1.md); delta SRC-06 được tổng hợp từ bộ prompt cục bộ có sẵn. Không tự chọn một phương án đang mở.

## Quyết định và mâu thuẫn

| ID / nguồn | Điều đã chốt hoặc giữ từ SRS | Điểm mở / xử lý tiếp | UC / WBS / gói |
| --- | --- | --- | --- |
| EXT-01/02; SRS t11r5, t25r28/r60, GBR-17 | Một visit có thể trả sau; nhiều visit phải trả trước. Thay baseline mọi booking trả sau | FIN-01: payment trước/sau offer, hold slot, expiry, khi nào confirmed; chưa chốt | UC-27/59; WBS 24/43–45/64/65; P51/P01/P31 |
| EXT-03/05; GBR-15/21 | Customer/Sitter tự hủy/rút >=1h server; lẻ postpay hủy hợp lệ free; paid multi không reschedule giữ 30% phần hủy | FIN-02/03/06: basis/rounding/discount/đã làm/cause/operator; không dùng phí late cũ hoặc thu hai lần | UC-44/49/61; WBS 34/46/60; P51/P25/P32 |
| EXT-04/15/16; GBR-19/22 | Customer chọn lịch mới; 1h chỉ là cutoff hủy | FIN-04/05: change request12h, slot mới24h, expiry6h và đoạn1–12h; giữ như mâu thuẫn cần quyết định | UC-47/48; WBS 33; P51/P25 |
| EXT-06/18; GBR-31 | Sitter tối đa một request/tuần Mon–Sun VN; Admin xem payroll | FIN-07/08: eligible/reserve/hold, actor duyệt, rejected quota, transfer/paid evidence; không có API payout đã xác minh | UC-23, UC-N04–06; WBS 47/N05–07; P41/P51 |
| EXT-07/19/28; GBR-26 | Sitter đánh giá Customer và đọc complaint liên quan; Customer baseline rating/complaint giữ hiệu lực | Window/privacy/moderation/response Sitter còn mở; Sitter tạo complaint chưa được chốt | UC-62–64, UC-N07/08; WBS 48–50/N08/09; P47 |
| EXT-08/22; UC-09 | Chính sách public dễ xem trước consent, gồm booking/payment/cancel/refund | Owner nội dung, effective version, legal copy/đa ngôn ngữ chưa chốt; không xuất bản proposal như policy | WBS 11/N10; P45/P17 |
| EXT-09; dashboard UC-30/39/46/66 | Role dashboards; avatar hover/focus mở, click pin, Escape/outside/route/logout đóng | Không có Figma frame; ghi PROVISIONAL cho thiết kế, API authorization độc lập | WBS 54/67–69/N11/N14; P04/P48 |
| EXT-10/21 | PWA là scope đã chốt | Offline/push/cache policy chưa chốt; không giả giao dịch offline đã sync hoặc cache PII công khai | WBS-N12; P43 |
| EXT-11/20; GBR-12/13 | Directed sitter: availability → proposal → Customer confirm → offer; auto-ranking thường giữ sequential offer | Timeout/stale/reject/no-response/fallback còn mở; confirm không là sitter accepted; accept recheck atomic | UC-N03, UC-27/36/41; WBS 24/30/61/63/N03/04; P42 |
| EXT-12/23; SRS t71 | Tối ưu query; 95% pages <=2s, 95% booking saved/confirmed <=3s, 200 active users/single server | Đo trên flow/provider/staging thật; chưa có explain/load evidence; p95 API không thay page metric | WBS-N13; P44/P36 |
| EXT-24/25; GBR-25/28 | Applicant theo dõi state/reject reason/eligible date sau30 ngày; chưa approved không account | Chốt bởi Leader ngày 14/10/2026: mã tra cứu bí mật + OTP tới liên hệ đã nộp; không tạo account. OTP 5 phút, resend 60 giây, 5 lần/giờ/hồ sơ, sai 5 lần khóa 15 phút; mã hồ sơ không đủ làm quyền đọc PII | UC-N01; WBS 16–18/N01; P46/P06 |
| EXT-26; GBR-27 | OTP-only, link cả email/phone và xác minh từng kênh trước dùng; signup baseline một contact | Bắt buộc bổ sung kênh thứ hai vào lúc nào chưa quyết định. Giữ signup một kênh, không tự tạo gate mới | UC-01–05; WBS 1–5/53/66/70; P06–P09 |
| EXT-27 | Pet đủ care info, nhiều pet/chủ, dogs/cats; unknown vaccine riêng với verified | P50 chốt field/readiness/vaccine/storage; không tự từ chối pet vì vaccine unknown nếu chưa có rule | UC-13–15; WBS 14/15; P50/P15 |
| OPEN-CLOSE; SRS UC-53, GBR-24/31 | Staff-close sau thiếu checkout +2h cần reason; không tạo checkout photo/report giả | Ảnh thiếu và cách tính bill/earning/eligibility cần P51/P01; “counts done” nguồn cũ không đủ chứng minh care | WBS 37–39/47; P27/P51 |
| OPEN-OWNER; delta vs revised plan | Owner P00 Thành đã được user chỉ định; source WBS Q/N giữ provenance | PWA: delta Thành vs revised Đạt; feedback: delta Nhật/Đạt vs revised Chung/Nhật. Leader ghi owner module trước code | WBS-N08/09/12; P37/P34 |
| OPEN-SOURCE; source-register | SRS overview t25; permission matrix thực ở t26; actors t24; API overview t28; jobs t29 | Source-register cũ gọi t24 là quyền: sai locator, cần integrator sửa. Không overwrite file đang có của user | P00/P37 |
| OPEN-SCHEDULE; Report2 t3 vs WBS G/r100 | 212 pds báo cáo và 119 pds WBS có scope/version khác; không trộn tổng | Code frame9/10 deadline đã qua, checkout không có code; prepay kéo sớm trước booking I2, review workload/mốc thật | P00/P37/P34 |

Proposal FIN-01–08 không phải quyết định đã duyệt. Không triển khai phép tính tiền, quyền payout hoặc fallback từ proposal. Tham chiếu [bổ khuyết](p00-amendments-v1.md) cho flow, owner, dependency và estimate.

## Thuật ngữ chuẩn

| Thuật ngữ | Nghĩa / ranh giới |
| --- | --- |
| Booking / đặt dịch vụ | Một service, các pets, một hoặc nhiều Visit; snapshot giá/policy/address/instructions |
| Visit / buổi chăm sóc | Một time window, một sitter được gán, trạng thái/evidence/report riêng; không đồng nghĩa booking |
| Proposal / đề xuất lịch chỉ định | Customer review/confirm; không phải Offer đã gửi, Paid hoặc Assigned |
| Offer / lời mời làm việc | Sitter accept/decline/expiry; sequential, chỉ một assignment thắng race |
| Change Request / yêu cầu đổi lịch | Vòng đời riêng; Customer chọn slot, cutoff chưa đóng; không dùng cancellation cutoff thay thế |
| Needs action | Hàng/cờ điều phối kèm reason; không thay toàn bộ enum Visit |
| Bill / bảng tính phí | Không phải tax invoice; khác Payment và khác revenue/earnings |
| Payment / khoản thanh toán | Kết quả provider được server xác minh; return URL hoặc mock không chứng minh Paid |
| Retention / phần giữ lại | 30% phần hủy paid multi không reschedule theo basis sẽ chốt; khác charge mới và earnings |
| Refund / hoàn tiền | Quyết định/ghi nhận/transfer khác nhau; trước thu là adjustment, không refund một khoản chưa trả |
| Earning / thu nhập sitter | Accrued/available/reserved/paid cần ledger contract; không đồng nghĩa chuyển khoản thực tế |
| Settlement request / yêu cầu tất toán | Quota theo tuần gửi VN khác kỳ tạo earnings; approved khác paid |
| Applicant / người ứng tuyển | Guest có hồ sơ, không phải Pet Sitter có account trước Admin approval |
| Incident / sự cố | Trong visit; khác Complaint về kết quả; cả hai có thể hold bill theo contract |
| Staff / Admin | Staff điều phối; Admin kế thừa Staff và giữ quyền quản trị/duyệt khoản tiền |
| VERIFIED / PR_OPEN / MERGED | Bằng chứng checks, PR đã mở, và merge thực tế là ba mốc riêng; không tự DEPLOYED |

## Inventory màn cần thiết kế hoặc đối chiếu

Tất cả nhóm dưới có trạng thái Figma NOT_INSPECTED: chưa có URL/node/frame/screenshot trong phiên. Đây là danh sách yêu cầu thiết kế/đối chiếu, không khẳng định từng màn chưa được nhóm thiết kế. Không dùng 15 hàng của SRS t27 (nhóm sitter, #74–88) làm toàn bộ screen inventory. Mỗi frame cần screen ID, role, viewport, state, phiên bản và nguồn.

| Screen group | Role | UC / WBS / EXT | Màn và trạng thái cần có | Dependency/gate |
| --- | --- | --- | --- | --- |
| SCR-01 | Guest/registered roles | UC-01–05; WBS 1–5/70; EXT-26 | Register/Login/sharedOTP, resend/expired/locked/dual contacts, settings tên readonly | P06–P09; email/SMS |
| SCR-02 | Guest/Customer | UC-06–09; WBS 8–11; EXT-08 | Home/list/detail/areas, policy index/details, version trước consent | P13/P45/P17; final copy |
| SCR-03 | Customer/Admin | UC-10–15; WBS 6/7/12–15; EXT-27 | Users/detail, customer/emergency/address/access notes, pet list/edit/vaccine unknown/file | P10/P14/P15/P50; private storage |
| SCR-04 | Guest Applicant/Admin | UC-16–19/N01; WBS 16–18/N01; EXT-24 | Application/receipt/scoped tracking/reject eligible date; review/interview/suspend | P16/P46; EXT-25 auth |
| SCR-05 | Sitter/Staff/Admin | UC-20–26/33/34/N02; WBS 19–23/57/58 | Profiles/list, calendar/areas/day off, services/prices/versioned policies | P17/P18/P28; contract |
| SCR-06 | Customer | UC-27–32/N03; WBS 24–28/N03/04; EXT-01/02/11 | Booking one service/pets/slots/price review; directed proposal confirm; list/detail/live tracker | P19/P20/P42; FIN-01 |
| SCR-07 | Customer | UC-47–49/59/61; WBS 33/34/43–46; EXT-03–05 | Select visits cancel/reschedule preview, payment/reconcile/fail/expiry/refund | P25/P31/P32; FIN-01–06 |
| SCR-08 | Staff/Admin | UC-35–39/45/60; WBS 29/30/32/65/69 | Planning board/Needs action/reassign/no-sitter alternatives/late/unpaid | P21/P22/P24; no-sitter policy |
| SCR-09 | Sitter/Customer/Staff | UC-40–55; WBS 31/35–39/59/60 | Offers/deadline/accept/withdraw, visit/access gate/handover; care instructions/checklist/checkin/out/report | P24/P26/P27; upload provider |
| SCR-10 | Customer/Sitter/Staff/Admin | UC-56–58/62–64/N07/08; WBS 40–42/48–50; EXT-07 | Incident/complaint evidence/detail/resolution/adjustment; direction rating and restricted case view | P29/P30/P47; privacy/FIN |
| SCR-11 | Sitter/Admin | UC-23/N04–06; WBS 47/N05–07; EXT-06 | Earnings periods/request weekly/reserved/rejected/pending/transfer record; payroll list/detail | P41; FIN-07/08 |
| SCR-12 | Customer/Sitter/Staff/Admin | UC-30/39/46/65/66; WBS 51/54/67–69/N11/14; EXT-09 | Role dashboard/header/sidebar/avatar hover-focus-pin; notifications list/deep link | P28/P33/P48/P04; actual queries |
| SCR-13 | Customer/Sitter | WBS-N12; EXT-10/21 | Install/update/offline pending/retry/version mismatch; no fake server ack | P43; cache/push decision |

360px, keyboard/focus/Escape, touch and loading/empty/error/forbidden/pending/disabled/success là checklist thiết kế và kiểm thử sau implementation; chưa được chạy trong P00. Logo/font/icon dùng frontend/public, không copy shop/cart/password từ dự án cũ. PWA/performance trace về WBS-N12/13 và NFR, không tăng UC chỉ để đếm screen/service worker/index.

## Acceptance cases cần gói sau thực thi

Đây là yêu cầu kiểm tra, không phải test đã pass:

- Sai role/chủ bản ghi: Customer đọc booking khác, Sitter đọc visit/complaint khác, Staff approve refund hoặc đọc payroll không được cấp quyền → forbidden tại API/serializer. Assigned replacement chưa handover không thấy access notes.
- Cutoff server 60:01/60:00 cho self-cancel, 59:59 chuyển Staff; client đổi giờ không qua gate. Care instructions ±2h, checkin -30min, photo missing checkout bị chặn; exception checklist không miễn ảnh checkin/out.
- Accept đồng thời manual assign/slot overlapping → chỉ một assignment; directed stale confirm không gửi offer lặp. Không double billing khi webhook lặp/cũ sau link mới/cancel/expiry.
- Refund đồng thời settlement, hai request cùng reserve earning, Sun23:59:59/Mon00:00 VN và tuần qua năm → quota/ledger bảo toàn; negative cases blocked theo FIN chưa chốt được ghi pending.
- No-sitter/late: warning +15min, Needs action +30min; thu phí/retention theo cause cần quyết định. Staff-close không tạo evidence giả.
- Provider email/SMS/storage/payOS mất kết nối → retry/pending/error thật; không Paid/overdue hoặc care saved chỉ nhờ fixture.
- Load phải đo page/booking mục tiêu SRS t71, first offer≤1min, expiry propagation≤5min, payment result≤10s sau callback, OTP handoff≤5s; chưa có runtime nên chưa đo.
