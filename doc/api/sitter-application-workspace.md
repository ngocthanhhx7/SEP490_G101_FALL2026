# Hồ sơ ứng tuyển: Admin workspace và tra cứu

`GET /api/v1/applications` yêu cầu phiên Admin và trả `Cache-Control: private, no-store`. Thiếu phiên trả 401, sai vai trò trả 403.

- `state`: trạng thái hoặc `ALL`. Bỏ trống lấy tất cả. Màn UC-17 gửi `PENDING` khi mở.
- `sortOrder`: `asc` hoặc `desc` theo ngày gửi, dùng ID để phân thứ tự khi ngày giờ trùng. API mặc định `desc` để giữ tương thích, màn UC-17 gửi `asc` khi mở.
- `search`: tối đa 50 ký tự, tìm chuỗi con trong tên, mã đơn gốc hoặc số điện thoại đã nộp. Số Việt Nam đầy đủ ở dạng `0…` và `+84…` cho cùng kết quả.
- `serviceArea`: mã lấy từ `serviceAreas` trong phản hồi. Đơn khớp khi danh sách khu vực của đơn có mã hoặc tên tương ứng. Bỏ trống lấy tất cả khu vực.
- `employmentType`: `FULL_TIME` hoặc `PART_TIME`. `limit`: từ 1 đến 50, mặc định 20.
- `cursor`: token có chữ ký. Đổi bộ lọc, kích thước trang hoặc chiều sắp xếp phải bỏ cursor cũ. Tham số và cursor không hợp lệ trả `422 VALIDATION_FAILED`.

Trong success envelope v1:

- `applications`: trang hiện tại có `applicationCode` (mã gốc đã cấp khi nộp), `phoneNumber` (số đã nộp hoặc `null` nếu hồ sơ chỉ có email), `reapplyAt` (mốc đã lưu hoặc `null`), cùng các trường danh sách hiện có. Mã và số đầy đủ phục vụ Admin tra hồ sơ và liên hệ phỏng vấn theo UC-17/MSG36. `contact.maskedValue` vẫn được trả để tương thích. Email, giấy tờ và ghi chú phỏng vấn không được trả dạng đầy đủ trong danh sách.
- `serviceAreas`: danh mục khu vực dùng cho bộ lọc, mỗi mục gồm `id` và `name`.
- `summary.total`, `summary.byState`: tổng toàn bộ hồ sơ, không áp dụng bộ lọc hoặc cursor. Các trạng thái là PENDING, UNDER_REVIEW, INTERVIEW, APPROVED, REJECTED.
- `totalMatching`: số hồ sơ theo bộ lọc trước cursor; không phải số hàng của trang hiện tại.
- `nextCursor`: cursor trang tiếp theo hoặc null. Client giữ lịch sử cursor trong bộ nhớ để quay trang trước.

Tổng và danh sách là các truy vấn đọc riêng; khi một Admin khác cập nhật đồng thời, làm mới để lấy trạng thái mới. Không coi thống kê là snapshot giao dịch.

Route frontend chuẩn: `/admin/sitter-applications` và `/admin/sitter-applications/:applicationId`. Link cũ `/admin/applications/:applicationId` vẫn mở chi tiết trong Admin shell với cùng role gate. API chi tiết, tài liệu riêng tư và các lệnh thẩm định vẫn kiểm tra quyền trên server; mutation dùng CSRF, idempotency key và expectedVersion. Hợp đồng đã ký là điều kiện vận hành do Admin xác minh trước duyệt; nguyện vọng Full-time/Part-time không tự tạo hợp đồng hoặc cho quyền nhận việc.

Tra cứu công khai: `/sitter/application-status`, mã hồ sơ + OTP purpose `APPLICATION_STATUS`. Template email/SMS chấp nhận đúng purpose này; scope, rate limit, thời hạn và tiêu thụ một lần thuộc OTP service. Response bắt đầu giữ cùng hình dạng với mã không tồn tại để tránh dò hồ sơ, không phải bằng chứng inbox đã nhận. Chỉ OTP đúng mới trả projection trạng thái, lý do từ chối và điều kiện nộp lại. Không trả giấy tờ/ghi chú nội bộ, không cấp session hay quyền Sitter từ endpoint tra cứu.

Xem [bằng chứng và giới hạn kiểm tra](../testing/registration-sitter-flow.md).

## Hồ sơ: giấy tờ, bốn bước và email (30/10/2026)

Theo xác nhận mới của người dùng, quyết định APPROVE/REJECT chỉ được thực hiện
sau PENDING -> UNDER_REVIEW -> INTERVIEW. Gọi quyết định sớm trả 409
APPLICATION_STAGE_REQUIRED. Các command chuyển bước vẫn có expectedVersion và
idempotency key; retry không tạo thêm mail. Hồ sơ đã duyệt trước thay đổi giữ
nguyên quyền; timeline chỉ hiển thị sự kiện audit đã có, không bịa các bước cũ.

GET /api/v1/applications/:id/documents/:documentId nay trả 200 PNG/JPEG inline,
tối đa 5 MiB, private/no-store/nosniff, sau kiểm tra Admin, ràng buộc tài liệu,
quota và audit. Không redirect sang R2. Kho lỗi trả JSON 503 PROVIDER_UNAVAILABLE
được UI chuyển thành thông báo trong hộp xem, không hiển thị XML nhà cung cấp.

Chi tiết Admin có timeline và emailNotifications gồm trạng thái hồ sơ, version,
deliveryState, thời điểm tạo/SMTP tiếp nhận và mã lỗi an toàn. Không trả recipient
ciphertext hoặc địa chỉ từ hàng đợi. Các lần cập nhật mới tạo hàng đợi email có
transaction; chỉ worker được cấu hình EMAIL_ENABLED mới gửi. Người nhận phải là
email đã xác minh của owner tại lúc xếp hàng và trước khi gửi. Chưa có email thì
SKIPPED; không tạo liên hệ giả. Không backfill thư cho các quyết định lịch sử.

### Bounded administrative search

Partial phone/code/name search examines at most 500 candidate applications per request, with a 5-second query deadline and the existing state/time/id keyset index. It does not persist plaintext phone search tokens. `searchIncomplete: true` means the response is not the full search result; `nextCursor` continues after the checked window even if `applications` is empty. `totalMatching` is null when the global matching count is unknown. The UI offers continuation and does not describe such an empty window as no matches. No-term lists retain exact filtered totals. Existing filter-signed cursors remain compatible.

Area filters include the existing registry (including closed historical areas) plus legacy aliases, without rewriting application work-area values or opening service coverage.
