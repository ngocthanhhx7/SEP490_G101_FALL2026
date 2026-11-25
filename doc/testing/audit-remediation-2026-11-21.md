# Sửa và kiểm thử lại phát hiện audit Paw World Care

Ngày 21/11/2026. Nhánh `feature/audit-care-dispatch` từ `origin/develop fd13f41f`. Demo 4392 giữ nguyên runtime cũ. VPS đã đối chiếu SSH `f98047d`, green 3001.

## Kế hoạch thực hiện

1. Dùng bản ghi R56 để xác nhận lỗi tracker, rà lại patch R56 và lấy riêng phần projection/report. Giữ quyền owner, luồng checklist cũ và ảnh private.
2. Đối chiếu A/B ở Staff và Admin, thêm thông tin trong DTO đọc và hiển thị từ snapshot hiện tại. Sửa landmark ở Admin Users bằng wrapper theo chế độ nhúng.
3. Đồng bộ cửa sổ hành trình T−30 ở nguồn và giao diện. Giữ gate cấu hình, opt-in, freshness và kiểm quyền. Đóng cửa sổ khi check-in hoặc hết giờ ca.
4. Áp dụng quyết định 2 giờ của người dùng cho tạo lịch tại nhà trên availability, checkout và gợi ý. Kiểm thử quanh biên, rollback khi bị từ chối và replay.
5. Soạn chính sách hủy/hoàn tiền dựa trên nguồn luật chính thức. Giữ trạng thái trình duyệt cho tới khi phê duyệt có căn cứ và luồng nhận yêu cầu/hoàn tiền được nghiệm thu.
6. Chạy test hồi quy có DB cô lập, đọc lại R56/A/B ở Mongo demo theo chế độ chỉ đọc, chạy Edge trên frontend ứng viên, kiểm tra lint, kiến trúc, build và ghi giới hạn còn lại.

## Đối chiếu từng phát hiện

| Mã | Kết quả trên bản ứng viên | Kiểm thử |
| --- | --- | --- |
| PWC-01 | Tracker nhận ca đã check-out có SOP là `REPORT_READY`. Khi ca đang diễn ra, chỉ trả task đã ghi nhận, được Customer xem, và tham chiếu ảnh. | R56 thực đọc qua service đã sửa. Owner nhận `careReport: true`, tài khoản khác 404. Test Express/Mongo cô lập giữ hợp đồng legacy, kiểm tham chiếu ảnh private của Customer đúng phạm vi và loại task nội bộ. Edge mở hộp báo cáo với API giả lập. |
| PWC-02 | Hai bảng hiển thị tên dịch vụ, pet, địa điểm và khu vực. Mã lịch đặt dưới tên khách. | Đọc đúng payload A/B ở hai tab và hai vai trò. Edge mở Needs/All tại 320, 390, 1440 px. |
| PWC-03 | Nhãn quá giờ dựa vào trạng thái, giờ tham chiếu máy chủ và chưa có sitter. B được đọc với giờ mới. | A quá giờ, B còn tương lai ở hai vai trò. Edge thấy cả hai nhãn, dạng thẻ mobile và bảng desktop. |
| PWC-04 | Admin Users nhúng dùng section có tên, vẫn giữ main ở shell và focus điều hướng. | Jest kiểm đúng một main và section có tên. Edge đếm một main ở ba viewport. |
| PWC-05 | Hành trình T−30, phục vụ trước check-in. Tracker mở mục này khi được backend cho phép; toạ độ cần consent và mẫu mới của đúng sitter. | Integration kiểm T−30, trước biên, check-in, đổi sitter, hủy, stale và opt-out. Edge Customer kiểm mở mục và không có nút chia sẻ trên fixture. |
| PWC-06 | Availability, checkout và gợi ý chăm sóc tại nhà áp dụng 120 phút theo quyết định mới. | 119 phút bị chặn, không lưu visit. 120 phút qua, checkout lại cùng khóa trả cùng đơn. Gợi ý hộ tống phòng khám giữ quy tắc riêng. |
| PWC-07 | Hoàn thành [chính sách bản trình duyệt](../requirements/cancellation-refund-policy-proposal-2026-11-21.md). | Test catalog công khai và các suite refund/payOS hiện hành qua với dữ liệu giả lập. Cần phê duyệt chủ thể, khoản giữ hợp lệ, ngày hiệu lực và kết quả sandbox trước khi công bố. |

## MongoDB và phát hành

Áp dụng `mongodb-schema-design` và `mongodb-query-optimizer`. Bảng Điều phối chỉ bổ sung trường có sẵn vào projection và giữ cursor, timeout và giới hạn trang. Tracker dùng snapshot SOP, task và đường đọc ảnh hiện tại. Hành trình dùng đúng bản ghi latest-only có TTL hiện có. Quy tắc 120 phút kiểm trên giờ bắt đầu đã có, trước khi lưu lịch. Không đổi schema, collection, index, snapshot lịch sử hoặc dữ liệu demo. Không có migration hay backfill.

Bằng chứng chi tiết nằm trong thư mục audit cục bộ, gồm `fix-readback.json`, `fix-edge.json` và log các suite. Browser dùng API giả lập để kiểm frontend ứng viên. Mongo readback riêng dùng dữ liệu thật từ bản sao loopback. Chưa chạy chuỗi ghi hoàn chỉnh trên VPS, sandbox tiền thật hoặc GPS trên thiết bị vật lý.

## Kết quả kiểm tra

- Backend cuối: 197 suite, 2.138 test đạt. Lượt chạy song song có một cảnh báo Jest buộc đóng worker sau khi hoàn tất test. Lượt chạy tuần tự trước thay đổi cuối đạt 197 suite, 2.137 test.
- Frontend cuối: 176 suite, 1.410 test đạt. Lint hai gói, architecture, Vite build, kiểm link tài liệu và whitespace đạt. Build vẫn báo chunk chính vượt ngưỡng cảnh báo 500 kB.
- Checkout, gợi ý, refund, PayOS giả lập và catalog chính sách: 9 suite, 121 test đạt.
- Edge: 15 quan sát dùng fixture API ở 320/390/1440 px. Trên 390 px, 119 phút chặn trước khi gọi báo giá, 120 phút vào bước gợi ý. Clock cố định chỉ trong trang fixture; không chỉnh giờ hệ thống.
- Mongo demo: 89 collection, các kế hoạch All/Needs/Needs count/search vẫn có IXSCAN. Số tài liệu đọc tại cursor lần lượt 5/6/10/10, khớp baseline trên mẫu audit.
- Checkout chính trùng `origin/develop fd13f41f`, CI baseline develop 44867286704 thành công. Bản ứng viên nằm ở worktree riêng. `.env`, bản sửa `.env.example` và sáu stash khớp trước/sau. Chưa push, merge, deploy hoặc công bố chính sách.
