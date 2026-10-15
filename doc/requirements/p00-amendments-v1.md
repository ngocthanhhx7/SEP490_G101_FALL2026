# P00 — Bổ khuyết UC/WBS v1.0

Ngày 14/10/2026. LOCAL_DRAFT: bản sửa có version, không ghi lên báo cáo Drive; canonical IDs 09/10 giữ nguyên. UC-N/WBS-N là provisional, chưa cộng máy móc thành 74 UC/86 WBS chính thức. Owner P00: Thành theo chỉ định phiên; các owner module dưới là đề xuất, chưa thay cột Q/N của nguồn. Không thực hiện gói P01/P37/P51 hay code module trong phiên P00.

Crosswalk nền và provenance: [66 UC/70 WBS](p00-source-crosswalk-v1.md). Các nhóm dưới chỉ bổ khuyết nghiệp vụ bị ảnh hưởng; UC còn lại giữ yêu cầu SRS không xung đột. Actor, precondition, main/exception flow và rule của 66 UC nằm trong SRS; bảng này là patch yêu cầu, không sao chép toàn bộ 20 đặc tả nguồn.

## Patch UC hiện có, old → revised cùng mã

Mọi dòng version 09/10 → draft 14/10-v1.0; phần CHỐT theo EXT đã được user quyết định, phần còn mở không thành hành vi production.

| UC nguồn → giữ mã | Actor | Flow bổ khuyết | Rule / postcondition | Lý do / nguồn | WBS ảnh hưởng | Exception / gate |
| --- | --- | --- | --- | --- | --- | --- |
| UC-01–05 | Guest; các role đã đăng ký | Register một contact → OTP → session; link kênh còn lại sau xác minh | OTP 6 số/5 phút/resend60s/5 mã giờ/5 sai khóa15 phút; không password | EXT-26; GBR-07/08/27 | 1–5,53,66,70 | Chưa chốt khi nào bắt buộc có đủ hai contact; không khóa signup một contact |
| UC-09/24–26 | Guest/Customer đọc; Admin cấu hình | Xem public policy → snapshot policy/version trước consent; Admin sửa phiên bản mới | Bỏ mặc định free24h/late30%; hủy≥1h, multi-prepay | EXT-08/22; GBR-15/17/20 | 11,19–21 | Final policy copy/effective version cần owner; không tự viết legal terms |
| UC-13–15 | Customer sở hữu pets | Thêm/sửa readiness/vaccine/care → snapshot visit | Chó/mèo; nhiều pet/chủ; unknown vaccine khác verified; file private | EXT-27; P50 | 14,15 | Field bổ sung P50; không sửa snapshot confirmed ngầm |
| UC-16–19 | Guest nộp; Admin review | Application → interview → approve mới account; reject reason/eligible date | 18 tuổi; duplicate Pending phone/email/ID; suspension giữ quyền đọc lịch sử, không offer mới | EXT-24/25; GBR-25/28 | 16–18 | Tracking auth còn mở; không dùng account lockdown thay suspension |
| UC-23 | Sitter bản thân; Admin xem tất cả | Earnings → eligible → request → reserve → review/transfer | Thêm weekly settlement; approved chưa paid; quota tuần VN | EXT-06/18; FIN-07/08 | 47 | Không tự bank API/wallet; eligible/quota rejection chưa chốt |
| UC-27–32 | Customer chủ booking | Một service/pets/visits → snapshot → branch payment → dispatch theo contract | Một buổi có thể postpay; nhiều buổi bắt buộc prepay; proposal/paid/accepted/assigned riêng | EXT-01/02/11; FIN-01 | 24–28,67 | Payment-vs-offer/hold/expiry chưa chốt; không confirmed giả |
| UC-33–46 | Sitter; Staff/Admin điều phối | Availability/ranking → sequential offer → accept/manual assign → handover | Recheck overlap/travel atomic; access notes assigned từ -1h đến checkout, replacement đã handover | EXT-11/20; GBR-12/13/32 | 22,23,29–32,57–63,68,69 | Manual ngoài giờ/vùng cần warning+đồng ý theo GBR-32; hard overlap không override |
| UC-44/47–49 | Customer tự hủy; Sitter rút; Staff ngoại lệ | Chọn visits + cancel/reschedule → preview → lưu actor/reason | Self-cancel >=60 phút server; paid multi cancel không đổi giữ30% phần hủy; postpay hợp lệ free | EXT-03–05/13–17; FIN-02–06 | 33,34,60 | Không áp cutoff hủy lên reschedule; 12h/24h/6h còn xung đột |
| UC-50–58 | Customer instructions; assigned Sitter evidence; Staff case | Instructions/handover → checkin/photo → checklist → checkout/photo → report; incident hold | Care cutoff2h; checkin từ -30 phút; item done hoặc skip reason; staff-close +2h ghi reason riêng | GBR-16/23/24; EXT-EVIDENCE | 35–42 | Staff-close counts done nguồn cũ; bill/earning khi thiếu evidence cần P51/P01 quyết |
| UC-59–61 | Customer payment; Staff đề xuất; Admin khoản hoàn | Prepay/postpay bill → verified callback → reconcile; refund theo approve/evidence | Signature/amount/reference/idempotency; hold không overdue; không thu/hoàn hai lần | EXT-01/02/05; GBR-18/30; FIN-01–07 | 43–46,64,65 | payOS refund/payout tự động không được xác nhận; rounding/due reset còn mở |
| UC-62–64 | Customer feedback; Sitter rating/read liên quan; Staff/Admin xử lý | Rating direction; complaint case → resolution → disagreement/escalation | Customer một rating/visit, 7 ngày complaint/một open, một disagree; Sitter chưa có create complaint | EXT-07/19/28; GBR-26 | 48–50 | Sitter rating window/visibility và response chưa chốt |
| UC-30/39/46/65/66 | Role/record scoped | Dashboard queries → drilldown → notification; avatar hover/focus/pin | Admin inherits Staff; no data leakage; pending/empty/error riêng | EXT-09/12/23; GBR-02/03 | 51,52,54,67–69 | Chưa có Figma frame; tối ưu đo actual queries, không thêm reports backlog |

## UC provisional: chưa có → UC-N01–08

Precondition và actor chưa chốt được ghi rõ, không suy ra quyền mới từ tên màn. UI không tạo UC riêng nếu chỉ là màn của capability hiện hành: UC-N02 có thể gộp UC-33; UC-N06 có thể mở rộng UC-23/66. P37 cần ghi quyết định gộp/tách khi cập nhật canonical IDs.

| ID | Tên đề xuất | Actor / precondition | Trigger / main flow | Alternate / negative | Rule / postcondition | Old → new / nguồn | Gói |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UC-N01 | Theo dõi hồ sơ ứng tuyển / Applicant | Guest/Applicant; application đã tồn tại | Nhập mã → xác minh scoped contact → xem state/reason/eligible date | Sai mã/contact, hết hạn, rate limit: không lộ PII; EXT-25 đã chốt mã hồ sơ + OTP ngày 14/10/2026 | Đọc scoped; không tạo account trước approval; ≥30 ngày nộp lại | EXT-24/25; UC-16–18; WBS 16–18 | P46 |
| UC-N02 | Quản lý khu vực làm việc / Sitter | Pet Sitter; được duyệt | Chọn coverage → validate → lưu vùng; thông báo assignments bị ảnh hưởng | Vùng ngoài coverage/xung đột: từ chối hoặc đưa Staff; không xóa visit đã nhận | Chốt dữ liệu vùng P01; recheck availability lúc accept | EXT-AREA; UC-33; WBS 22 | P18 |
| UC-N03 | Xem và xác nhận lịch chỉ định / Customer | Customer; booking/proposal của mình | Chọn sitter → đọc availability → proposal → Customer confirm → offer | Stale/expired/rejected/no response: không offer trước confirm; fallback/timeout còn mở | Confirm không là accepted/Paid; accept phải check conflict atomic | EXT-11/20; UC-27/36/41; WBS 24/30/63 | P42 |
| UC-N04 | Gửi yêu cầu tất toán / Sitter | Pet Sitter; earnings đủ điều kiện theo FIN-07 | Chọn earnings → preview → request theo tuần VN → reserve atomic | Duplicate cùng tuần/race/held/insufficient: không reserve hai lần; quota khi reject FIN-08 mở | Một request/tuần [Mon00:00,nextMon00:00), UTC storage; pending không là paid | EXT-06/18; UC-23; WBS 47 | P41 |
| UC-N05 | Xử lý yêu cầu tất toán / actor theo contract | Actor xử lý chờ FIN-07; không cấp Staff quyền mới | Xem request → approve/reject theo contract → ghi transfer có evidence | Sai quyền/duplicate/refund concurrent: từ chối; approved chưa paid | Quyền duyệt, eligibility và paid condition chưa quyết định | EXT-06/18; UC-23/61; WBS 46/47 | P41 |
| UC-N06 | Xem payroll sitter / Admin | Admin; có quyền payroll | List/filter → detail earnings/request/adjustment/transfer | Không có data/error/pending; Customer/Sitter không đọc payroll toàn hệ thống | Read từ ledger; không coi revenue là earning/transfer | EXT-06; UC-23/66; WBS 47/54 | P41/P28 |
| UC-N07 | Đánh giá Customer / Sitter | Sitter; visit được giao và đủ điều kiện | Mở visit → gửi rating Customer → lưu direction/eligibility | Sai assignment/duplicate/moderated: từ chối; window/visibility còn mở | Không tự áp 7 ngày Customer cho Sitter; không public PII | EXT-07/19; UC-62; WBS 48 | P47 |
| UC-N08 | Xem complaint liên quan / Sitter | Sitter; complaint thuộc visit được giao | Mở case liên quan → đọc projection được phép | Case khác/Staff private notes: forbidden; không tạo complaint Sitter mới | Response/window/moderation cần quyết định; server filter | EXT-07/19/28; UC-63/64; WBS 49/50 | P47 |

## Patch function hiện có

Giữ owner Q/N và effort nguồn như kiểm kê cho tới khi có phân công mới được ghi nhận. Không cộng lại effort các function được UC-N tham chiếu. Delta effort chỉ là dự toán bổ sung dưới đây, cần estimate lại sau contract; ngày code đã qua không là done.

| WBS giữ mã | Deliverable bổ khuyết | Dependency/gói | Delta pds đề xuất | Mốc đề xuất / gate |
| --- | --- | --- | --- | --- |
| 3/4/70 | Dual contact + OTP scopes/read-only settings | P06/P09; UC-04/05 | 1–2 | Iteration1 23/10; auth contract |
| 11/19–21 | Public policy versions/cutoff/prepay | P17/P45; FIN-02/04 | 1–2 | Policy skeleton I1; money copy sau FIN |
| 14/15 | Care-ready pet fields/files/snapshot | P15/P50/P01 | 1–3 | I1 23/10; field contract |
| 16–18 | Reject/reapply lifecycle; approval/suspension atomic | P16/P46/P06 | 1–2 | I1 23/10; scoped auth |
| 24/30/61/63 | Directed gate, availability, dispatch/expiry | P18/P19/P21/P23/P24/P42; FIN-01 | 2–4 | I2 06/11; payment ordering |
| 33/34/60 | Cancel selected visits, cutoff and reschedule | P25/P51; FIN-02–06 | 2–4 | I3 20/11; money/deadline decisions |
| 37–39 | Arrival/during/departure evidence; staff-close | P26/P27/P01; private storage | 1–2 | I2 06/11; upload contract |
| 43–47/64/65 | Prepay/postpay/reconcile/refund/earnings states | P31/P32/P41/P51 | 3–5 | Core payment gate trước I2 booking; settlement I3 |
| 48–50 | Two-direction rating + sitter case projection | P30/P47/P06 | 1–2 | I3 20/11; privacy/window contract |

## WBS provisional: chưa có → WBS-N01–16

Các dự toán là khoảng person-days tổng việc triển khai và kiểm tra module, không phải số lấy từ workbook; chưa phải commitment. Nếu deliverable gộp WBS cũ, chuyển phần delta vào dòng cũ và xóa effort duplicate ở WBS-N. Không tự thay owner trong báo cáo.

| ID | Function / UC | Code owner đề xuất | IT owner đề xuất | Dependency/gói | Delta pds | Mốc mục tiêu / điều kiện |
| --- | --- | --- | --- | --- | --- | --- |
| WBS-N01 | Applicant status và scoped verification / UC-N01 | Hải phối hợp kernelOTP củaNhật | Nhật | Applications/OTP →P46 | 1–2 | I1 23/10; EXT-25 |
| WBS-N02 | Sitter work areas / UC-N02 | Chung | Đạt | Availability/config →P18 | 0 (gộp #22) | I1 23/10; availability contract |
| WBS-N03 | Directed proposal UI/API / UC-N03 | Chung | Đạt | P19/P18/P24 contract →P42 | 2–3 | I2 06/11; proposal contract |
| WBS-N04 | Directed confirmation/dispatch concurrency / UC-N03 | Hải | Nhật | Proposal +dispatch/offer/payment gates →P42/P21 | 2–3 | I2 06/11; FIN-01 + race |
| WBS-N05 | Settlement request/ledger / UC-N04 | Hải | Nhật | Care/billing/refund FIN-07/08 →P41 | 3–5 | I3 20/11; FIN-07/08 |
| WBS-N06 | Settlement review/transfer record / UC-N05 | Thành | Chung | Ledger +role contract →P41 | 2–3 | I3 20/11; role/transfer contract |
| WBS-N07 | Admin payroll list/detail / UC-N06 | Thành | Chung | P41 queries/DTO →P28/P41 | 1–2 | I3 20/11; ledger queries |
| WBS-N08 | Sitter rates Customer / UC-N07 | Chung | Đạt | Reviews/eligibility/privacy →P47 | 1–2 | I3 20/11; window/privacy |
| WBS-N09 | Sitter complaint visibility / UC-N08 | Nhật | Thành | Complaint/RBAC DTO →P47 | 1–2 | I3 20/11; case projection |
| WBS-N10 | Public policy pages/version linkage / UC09 | Chung | Đạt | P17/P45 contract; không duplicate P13 catalog →P45 | 0 (gộp #11) | I1 skeleton; final copy sau FIN |
| WBS-N11 | Professional role shell/avatar pin / EXT-UX | Chung | Đạt | Auth/designsystem →P48 | 1–2 | I1 23/10; P04/P08 |
| WBS-N12 | PWA install/update/offline boundaries / NFR-PWA | Đạt | Chung | Layouts/auth/care →P43 | 2–3 | I3 20/11; online flow integrated |
| WBS-N13 | Query/load optimization / NFR performance | Hải | Nhật, Chung testlead | Flow đã tích hợp, actual query plans →P44 | 2–4 | 04/12 trước UAT; actual queries/staging |
| WBS-N14 | Brand components và font/icon integration | Chung | Đạt | Figma/brand assets →P04 | 2–3 | I1 23/10; Figma thiếu ghi provisional |
| WBS-N15 | Backend runtime/config/provider ports | Hải | Nhật | P01 approved architecture →P02 | 2–3 | I1 23/10; P01 architecture |
| WBS-N16 | Frontend runtime/router/API ports | Đạt | Chung | P01 approved architecture →P03 | 2–3 | I1 23/10; P01 architecture |

WBS-N14–16 là đầu việc nền; WBS-N12 PWA và N13 performance là capability/NFR, không phát minh UC. P00 bản thân là planning cross-cut, owner Thành; không dùng WBS nguồn bất kỳ làm bằng chứng được giao.

Đối chiếu đề xuất có mâu thuẫn: delta đề xuất Thành phụ trách PWA/API feedback trong khi revised plan N12 giao Đạt, N08 giao Chung, N09 giao Nhật. Đây là OPEN-OWNER, không chọn owner từ timestamp. Leader chốt module/contributor trước triển khai. Bảng Nxx hiện giữ đề xuất revised plan để truy vết, không tuyên bố quyết định mới.

## Lịch và rủi ro

Nguồn WBS committed 115 pds không phản ánh runtime còn thiếu hoặc scope delta. Mốc nguồn I1 23/10, I2 06/11, I3 20/11, system/UAT 04/12, final 11/12/2026 giữ như mục tiêu có rủi ro; không cam kết khả thi. Payment nhiều buổi phải sẵn trước kiểm chứng booking I2 dù WBS cũ payment I3: đề xuất kéo phần prepay/provider/reconcile P31 vào gate I2, để settlement I3. P00/P01/FIN quyết định trước khi chốt estimate chính thức; không tự dùng 115 + tổng khoảng như báo cáo effort mới.

Ready cho module: actor/flow/rule/privacy/state/dependency/acceptance có hợp đồng; FIN/open owners chặn phần phụ thuộc. Done tài liệu nguồn: version + crosswalk + diff được nhóm review và file thực đã ghi. Draft này chưa đạt Done nguồn Drive. Done implementation cần code/checks/tích hợp thật và review Git, độc lập với Done tài liệu.

Cập nhật nguồn tiếp theo trong P37: tạo backup version; áp patch SRS overview/spec/rules/permission/screens/jobs, UC workbook tất cả sheets liên quan, WBS function/owner/effort/date, diagrams/API/tests/prompt references; xác minh crosswalk trước khi renumber. Không ghi đè bản gốc Drive trong P00 này.
