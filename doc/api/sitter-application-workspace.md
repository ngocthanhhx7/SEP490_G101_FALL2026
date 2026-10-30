# Hồ sơ ứng tuyển: Admin workspace và tra cứu

`GET /api/v1/applications` yêu cầu phiên Admin. Không có quyền thì không trả thống kê hoặc hồ sơ. Query: `state`, `search` (tên), `employmentType` (`FULL_TIME`/`PART_TIME`), `limit` (1–50, mặc định 20), `cursor` có chữ ký. Đổi bộ lọc phải bỏ cursor; cursor của bộ lọc khác bị từ chối.

Trong success envelope v1:

- `applications`: trang hiện tại, liên hệ được che, tuổi đủ điều kiện, nguyện vọng hình thức làm việc, dịch vụ, khu vực, trạng thái, phiên bản, thời gian tạo/cập nhật. Không trả giấy tờ hoặc ghi chú phỏng vấn.
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
