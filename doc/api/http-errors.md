# Hợp đồng lỗi HTTP

Rà soát ngày 06/11/2026. Áp dụng cùng [hợp đồng P01](p01-api-permission-contract-v1.md).
HTTP status mô tả nhóm lỗi; `error.code` phân biệt nguyên nhân nghiệp vụ. Frontend
ưu tiên thông báo theo code rồi mới dùng thông báo theo status. Không hiển thị
nguyên văn lỗi provider, HTML của proxy, stack hoặc dữ liệu riêng tư.

```json
{
  "error": { "code": "OTP_RATE_LIMITED", "message": "Please wait", "retryAfterSeconds": 60 },
  "meta": { "schemaVersion": 1, "serverNow": "2026-11-06T00:00:00.000Z", "correlationId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }
}
```

Lỗi không có `data`. `fieldErrors`/`fields` là dữ liệu lỗi từng trường theo hợp đồng
của module; `decisionIds` dành cho gate cần quyết định đã định nghĩa. Header
`X-Request-ID` khớp correlation ID. Khi AppError cung cấp số giây chờ dương,
middleware xuất thêm `Retry-After`. Client giữ UUID hợp lệ và số giây dương để tra
cứu/hướng dẫn chờ; không tự gửi lại thao tác ghi.

| Status | Ý nghĩa và mã dùng trong ứng dụng | Hướng xử lý của người dùng |
| --- | --- | --- |
| 400 | Sai cú pháp JSON (`BAD_REQUEST`); OTP sai/hết hạn/đã dùng/bị thay (`OTP_INCORRECT`, `OTP_EXPIRED`, `OTP_ALREADY_USED`, `OTP_REPLACED`) | Sửa yêu cầu hoặc dùng mã mới nhất; không gộp tất cả thành sai OTP |
| 401 | Chưa xác thực/phiên hết hạn (`UNAUTHENTICATED`) | Đăng nhập lại; vẫn xóa phiên local nếu proxy trả HTML |
| 403 | Không đủ quyền (`FORBIDDEN`), CSRF bị từ chối, `ACCOUNT_LOCKED` sau OTP hợp lệ | Đúng tài khoản/quyền; khóa tài khoản cần hỗ trợ |
| 404 | Route hoặc tài nguyên không tồn tại/không thuộc người đọc (`RESOURCE_NOT_FOUND`) | Kiểm tra đường dẫn hoặc tải lại; không tiết lộ tài nguyên của người khác |
| 405 | Phương thức HTTP không được hỗ trợ tại upstream | Không đổi thành lỗi validation; chỉ dùng nếu thành phần xử lý thực sự phát status này |
| 408 | Hết thời gian nhận request ở upstream | Kiểm tra trạng thái thao tác trước khi gửi lại |
| 409 | Trạng thái/version xung đột, `CONTACT_ALREADY_LINKED`, `CONTACT_UNCHANGED` (liên hệ mới trùng liên hệ hiện tại của chính tài khoản, không gửi mã), `CONTACT_UNAVAILABLE` (liên hệ thuộc tài khoản khác), `VISIT_SCHEDULE_OVERLAP`, `ACTIVE_BOOKING_CONFLICT` | Đăng nhập bằng tài khoản đã có; đổi giờ; hoặc hoàn tất/hủy buổi trước khi xóa hồ sơ |
| 413 | Body quá lớn (`PAYLOAD_TOO_LARGE`) | Giảm dung lượng; giới hạn JSON và ảnh là hai giới hạn riêng |
| 415 | Encoding/charset không hỗ trợ (`UNSUPPORTED_MEDIA_TYPE`) | Gửi đúng định dạng; không báo nhầm lỗi nội bộ 500 |
| 422 | DTO hợp lệ về cú pháp nhưng sai trường/giá trị (`VALIDATION_FAILED` và code riêng của module) | Sửa trường được chỉ ra; không đặt lỗi trong `data` |
| 429 | Quá giới hạn (`RATE_LIMITED`, `OTP_RATE_LIMITED`) | Chờ theo `Retry-After`/`retryAfterSeconds`; frontend không tự retry |
| 500 | Lỗi nội bộ chưa biết (`INTERNAL_ERROR`) | Thông báo an toàn, kiểm tra kết quả trước khi gửi lại; dùng correlation ID để tra log |
| 502 | Phản hồi provider không hợp lệ, ví dụ link thanh toán không khớp intent | Giữ trạng thái cần đối soát, không tạo lần thanh toán mới để che lỗi |
| 503 | Chưa sẵn sàng, thiếu cấu hình, provider/storage unavailable | Thử lại sau hoặc liên hệ hỗ trợ; không khẳng định tích hợp đã thành công |
| 504 | Upstream hết thời gian chờ | Kiểm tra kết quả trước khi gửi lại thao tác |
| 505 | Không hỗ trợ phiên bản giao thức HTTP | Cập nhật trình duyệt/kiểm tra proxy; không dùng cho lỗi nghiệp vụ hay lỗi server thông thường |

Các status 405/408/504/505 trong bảng có fallback UI khi thực sự được upstream
trả về; tài liệu không khẳng định Express hiện phát tất cả các status này.
Xem [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes).

## Xác thực và tính riêng tư

- Request gửi OTP không tiết lộ liên hệ đã tồn tại hay tài khoản bị khóa.
- Đăng ký lại: sai OTP trả 400 `OTP_INCORRECT`; đúng OTP với liên hệ đã đăng ký
  trả 409 `CONTACT_ALREADY_LINKED`, không tạo user/contact/session thứ hai.
- Tài khoản `LOCKED`: sau OTP hợp lệ trả 403 `ACCOUNT_LOCKED`, không tạo session.
  Challenge đã xác minh vẫn được tiêu thụ; gửi lại mã đó trả `OTP_ALREADY_USED`.
  Trạng thái tạm ngưng làm việc của sitter tách biệt với khóa tài khoản đăng nhập.
- Giữ nguyên chính sách OTP 5 phút, gửi lại 60 giây, 5 lần/giờ và khóa 15 phút.
  Không thay chính sách chống dò mã dựa trên nhận xét chưa được xác nhận.

## Booking và hồ sơ đang được dùng

Checkout kiểm tra trùng trong đơn và với các visit đã lưu của cùng pet, mọi địa
điểm/dịch vụ. Khoảng thời gian dạng `[startAt, endAt)` cho phép hai buổi liền kề.
Pet write guard và truy vấn visit ở cùng transaction; retry transaction đọc lại
snapshot khi hai checkout khác quote chạy cùng lúc. Visit `CANCELLED` hoặc
`SUPERSEDED` không chặn; booking chưa được hệ thống hủy vẫn giữ chỗ một cách bảo
thủ, không tự giải phóng chỉ vì màn hình đang báo hết hạn thanh toán.

Xóa pet/địa chỉ là archive có giữ lịch sử. Ghi archive và kiểm tra visit chưa kết
thúc dùng cùng transaction/write guard với checkout. Xung đột trả 409
`ACTIVE_BOOKING_CONFLICT`; transaction rollback giữ hồ sơ hoạt động và version cũ.
