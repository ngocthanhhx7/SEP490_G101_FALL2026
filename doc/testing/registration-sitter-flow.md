# Đăng ký và ứng tuyển Pet Sitter

Cập nhật 30/10/2026 trên `feature/login-email-sms-refresh`, cùng worktree với phần đăng nhập: `C:/Users/nguye/.codex/worktrees/login-refresh/SEP490_G101_FALL2026`. Base ban đầu: `88756f4` của develop. Remote develop đã tiến thêm trong lúc làm; cần tích hợp/review lại trước khi mở PR hoặc release. Checkout `D:/WW/SEP490_G101_FALL2026` và các sửa riêng của người dùng được giữ nguyên.

## Giao diện

Tham khảo bố cục từ các ảnh HouseBuddy người dùng cung cấp, giữ nhận diện PawWorld, PublicHeader/PublicFooter. Không sao chép logo hoặc tài nguyên HouseBuddy. Form khách hàng dùng hai cột họ tên/email trên desktop, một cột trên mobile. Phần đồng ý và liên kết chính sách được căn cùng hàng; nút vàng, ô nhập mint, lựa chọn vai trò và tiến trình tài khoản → OTP → hồ sơ.

Đăng ký khách hàng không thu thêm ngày sinh/số điện thoại chỉ để giống ảnh mẫu. Backend hiện cần họ tên, email và consent phiên bản để tạo tài khoản. Nút Đăng ký gửi OTP sau kiểm tra thông tin/consent, bỏ bước bấm trung gian. Tài khoản chỉ tạo khi xác minh thành công.

Form ứng tuyển có thông tin cá nhân, dịch vụ đọc từ catalog, khu vực làm việc, kinh nghiệm và giấy tờ. Email lấy từ liên hệ đã xác minh của chính tài khoản, không nhập thay email của người khác. Trang tra cứu hồ sơ cũng dùng header/footer công khai hiện tại.

## Luồng đã nối

1. Người mới đăng ký Customer bằng OTP email và đúng phiên bản terms/privacy. Người có tài khoản đăng nhập trước.
2. `/applications/intake` đọc email của chính tài khoản và hồ sơ đã nộp. Người có hồ sơ đang xử lý xem lại mã tra cứu, không tạo hồ sơ trùng. Bị từ chối phải chờ điều kiện nộp lại của backend.
3. Ảnh giấy tờ đi qua `/private-images`: phiên đăng nhập, CSRF, quota, idempotency, giải mã và mã hóa lại ảnh trước khi tải lên private R2. JPG/PNG, tối đa 5 MB/tệp, tối đa một ảnh định danh và năm ảnh bổ sung mỗi hồ sơ. Dùng chung giới hạn lưu trữ 20 ảnh/tài khoản của pipeline hiện tại. Chưa nhận PDF; giao diện ghi rõ định dạng.
4. Nộp hồ sơ yêu cầu phiên/CSRF. Backend xác minh email thuộc chủ phiên và từng ảnh READY thuộc chủ hồ sơ, kiểm tra tuổi >= 18, trùng hồ sơ, điều kiện nộp lại và chính sách. Consent terms/privacy được kiểm tra và lưu cùng transaction. Không lưu số định danh/ngày sinh nguyên văn trong bản ghi; định danh dùng digest và giấy tờ nằm trong kho riêng tư.
5. Lỗi gửi không chắc kết quả giữ command key và những upload đã hoàn tất để thử lại. Cùng File dùng cùng khóa upload để không trừ quota lần nữa. Mở lại trang sau nộp lấy mã hồ sơ từ nguồn server theo owner, không dùng localStorage để giữ dữ liệu cá nhân.
6. Mã hồ sơ + OTP giới hạn riêng từng hồ sơ mở trạng thái đã nộp/đang xét/phỏng vấn/duyệt/từ chối. Chỉ mã hồ sơ không đủ đọc trạng thái.
7. Admin duyệt qua luồng hiện có. Hồ sơ mới gắn `ownerUserId`: nâng quyền chính tài khoản Customer đã xác minh, giữ user/contact cũ, tạo SitterStatus, tăng authEpoch và yêu cầu đăng nhập lại. Không tạo thêm user không có liên hệ đăng nhập. Hồ sơ cũ không có owner vẫn giữ hợp đồng legacy, không âm thầm chuyển liên hệ.

## Kiểm tra

- PASS: frontend 74 suites / 465 tests; backend 75 suites / 700 tests.
- PASS: lint hai package, architecture checker, frontend production build, whitespace và liên kết tài liệu mới.
- PASS: integration dùng MongoDB 8.0.34 replica set cách ly, provider tổng hợp: đăng ký và consent thực → upload ảnh thực qua sharp → nộp/replay → tra cứu OTP → Admin đọc giấy tờ và duyệt → cùng user đăng nhập với quyền PET_SITTER. Kiểm tra guest/CSRF/cross-origin, email chưa xác minh, ảnh của tài khoản khác, ảnh giả, tuổi, consent sai/thiếu và provider lỗi.
- PASS: trình duyệt qua frontend/API/Mongo cách ly: OTP đăng ký → form → tải ảnh tổng hợp → nộp → reload khôi phục mã → tra cứu OTP trả Đã nộp. Layout desktop 1440px và mobile 390/320px.
- NOT RUN: SMTP/eSMS delivery thật, private R2 thật, review/merge/deploy production. Preview dùng database tạm và transport tổng hợp; không phải bằng chứng delivery/provider thật.

Build có cảnh báo bundle > 500 kB hiện hữu. Các ảnh chụp giao diện nằm ngoài repository trong thư mục visualizations của chat.

## Bàn giao

Thay đổi chưa commit/push/PR. Khi tích hợp cần tạo index `ownerUserId` qua runbook/`ensure-indexes.js`, kiểm tra lại SHA sau tích hợp develop. Runtime chỉ mở tiếp nhận ảnh khi private R2 được cấu hình; thiếu cấu hình hiển thị chưa mở và không báo nộp thành công. Không tự bật provider, xuất bản policy hoặc thay dữ liệu production trong tác vụ này.
