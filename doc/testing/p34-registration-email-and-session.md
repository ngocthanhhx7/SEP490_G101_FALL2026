# P34: Đăng ký email và phiên ghi nhớ thiết bị

- Hai lựa chọn: Customer / Ứng tuyển Pet Sitter. Cả đăng nhập và đăng ký dùng PublicSiteLayout với header/footer PawWorld.
- Đăng ký: họ tên, email, đồng ý đúng phiên bản terms/privacy; tiếp theo chọn email (SMS khóa), yêu cầu OTP, nhập 6 số. Customer chỉ tạo sau khi OTP và phiên bản policy được backend xác nhận trong transaction.
- Ứng viên cũng xác minh email bằng tài khoản Customer trước khi xem biểu mẫu hồ sơ. Không cấp PET_SITTER tự động. Hồ sơ yêu cầu ngày sinh, định danh, kinh nghiệm, dịch vụ từ catalog và khu vực; file riêng tư không được giả lập thành công.
- Kho privateMedia/upload chưa được cấu hình ở runtime mặc định. Giao diện thông báo rõ chưa mở tiếp nhận giấy tờ và khóa nút gửi. Phần tiếp nhận hồ sơ đầy đủ cần provider riêng tư và mount P16; không được tuyên bố đã nộp hồ sơ thành công.
- Đăng nhập email OTP có lựa chọn ghi nhớ: Customer/Pet Sitter tối đa 30 ngày; không chọn tối đa 12 giờ, cookie theo phiên trình duyệt. Staff/Admin luôn tối đa 12 giờ. Cookie HttpOnly, SameSite=Lax và Secure theo cấu hình HTTPS.
- GET /me khôi phục CSRF trong bộ nhớ, private/no-store; CSRF ổn định theo session token để reload/tab khác không vô hiệu mã của nhau. Không lưu OTP/token đăng nhập vào localStorage. Logout thu hồi phiên trong database; epoch/khóa tài khoản/hết hạn được kiểm tra lại mỗi request.
- POST challenge, REGISTER verification và LOGIN đều từ chối PHONE với SMS_UNAVAILABLE; contact change ngoài phạm vi vẫn giữ hợp đồng cũ.

## Xuất bản policy đã được Leader duyệt

Nguồn: [hai bản đã duyệt](../requirements/registration-terms-privacy-proposal-v1.md). Không tự tạo policy khi server khởi động.

Tại backend: `node --env-file-if-exists=.env scripts/seeds/registration-policies.js` để xem hash; thêm `--apply` để công bố vào database đã cấu hình. Hai bản xuất bản chung transaction, chỉ tạo phiên bản `registration-2026-10-15-v1`; chạy lại không thay đổi bản đã có. Sai hash hoặc trạng thái sẽ dừng, cần phiên bản mới được duyệt.

Đã công bố ngày 15/10/2026 lúc 19:48 giờ Việt Nam, API public trả cả hai bản APPROVED. Không cần hoặc tạo tài khoản Admin giả.

## Kiểm tra

Backend: lint và 553 unit/integration tests đạt, bao gồm cookie 30 ngày/12 giờ, CSRF reload, logout thu hồi, OTP một lần và consent transaction. Frontend: lint, 416 unit/integration tests và production build đạt. Kiểm tra trên trình duyệt: hai lựa chọn vai trò, header/footer và link policy đúng phiên bản từ database.

Không gửi email thật khi kiểm thử tự động; dùng provider giả trong MongoDB cách ly. Gửi OTP thật cần SMTP hoạt động và người dùng kiểm tra email của mình; không coi HTTP 202 là thư đã đến hộp thư.
