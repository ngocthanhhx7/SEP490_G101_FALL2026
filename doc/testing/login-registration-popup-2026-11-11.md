# Thông báo đăng ký trước OTP đăng nhập

Theo yêu cầu ngày 11/11/2026, email/số điện thoại chưa có liên hệ VERIFIED
trả `409 REGISTRATION_REQUIRED` tại `POST /api/v1/otp-challenges` với
`purpose: LOGIN`. Không tạo challenge/throttle/session hoặc gọi provider cho
trường hợp này. Đây là thay đổi chủ đích so với thông báo sau OTP ngày 30/10:
endpoint nay công khai tình trạng có liên hệ đăng ký, vẫn giữ rate limit HTTP,
CSRF/Origin và không công khai trạng thái khóa tài khoản trước OTP.

Giao diện mở popup “Bạn chưa đăng ký tài khoản”, hướng dẫn đăng ký trước khi
đăng nhập, có liên kết `/register`, đóng/Escape và “Dùng liên hệ khác”. Không
hiển thị form OTP cho liên hệ này. Khi liên hệ bị thay thế sau lúc gửi mã,
verify/resend cũng đóng form OTP và dùng cùng popup. Tài khoản đã đăng ký vẫn
phải xác minh OTP và đủ điều kiện hiện tại mới được cấp session.

## Dữ liệu và tương thích

Service tiếp tục sở hữu quyết định; controller dùng error envelope hiện có.
Thêm một `Contact.exists({channel, lookupKey, state: VERIFIED})` dùng lookup
HMAC chuẩn hóa và partial unique index hiện có `(channel, lookupKey)`.
Không thay schema, collection, index, TTL, uniqueness, account hoặc dữ liệu
nghiệp vụ. REGISTER/CONTACT_CHANGE/APPLICATION_STATUS giữ hợp đồng hiện có.
Client cũ vẫn xử lý 409 như lỗi; client mới xử lý riêng popup. Không cần migration
hay backfill/dry-run dữ liệu vì chỉ thay cách chặn yêu cầu LOGIN chưa đăng ký.

## Kiểm chứng và phát hành

Regression kiểm tra EMAIL/PHONE chưa đăng ký không gửi/lưu OTP, liên hệ
REPLACED, chuẩn hóa email, khóa tài khoản sau OTP, contact thay đổi sau gửi,
HTTP 409 không có cookie, popup trước OTP, đóng/sửa, đăng ký và resend.
Chạy architecture checker, lint hai package, affected auth/registration tests
và frontend build; kiểm tra popup ở desktop/mobile trong trình duyệt.

Phát hành qua PR develop, review độc lập, PR main và CI. Trước cutover lấy
backup mới và restore cách ly; triển khai đúng main SHA, giữ env/volumes và
release cũ để rollback. Rollback code bằng release cũ không cần đảo dữ liệu.
Không gửi OTP thật cho khách hàng chỉ để smoke test.
