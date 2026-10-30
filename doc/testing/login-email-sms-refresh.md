# Kiểm tra giao diện và luồng đăng nhập email/SMS

Ngày kiểm tra: 30/10/2026. Nhánh: `feature/login-email-sms-refresh`, từ `origin/develop` tại `88756f4`.

## Thay đổi

Trang `/sign-in` áp dụng màu nền, thẻ trắng, font Crayon/Nunito, ô nhập mint, nút vàng và các lớp trang trí của Figma `2:5284`. Giữ nguyên PublicHeader/PublicFooter; checkout ban đầu tại `D:/WW/SEP490_G101_FALL2026` và các sửa riêng của người dùng không bị ghi đè. Mã mới nằm trong worktree `C:/Users/nguye/.codex/worktrees/login-refresh/SEP490_G101_FALL2026`.

Người dùng chọn email hoặc SMS, yêu cầu OTP, nhập mã, gửi lại khi hết thời gian chờ, ghi nhớ thiết bị và đăng nhập. Có liên kết “Bạn chưa có tài khoản? Đăng ký” tới `/register`. Số Việt Nam dạng `0912 345 678` được chuẩn hóa sang `+84912345678`; số quốc tế phải có dấu `+` và mã quốc gia. Khi đổi kênh, liên hệ và lỗi cũ được xóa; gửi lại thành công xóa mã cũ và dùng challenge mới. Các nút đổi liên hệ/kênh bị khóa trong lúc gửi/xác thực để không làm lệch yêu cầu đang chạy.

API bỏ chặn cứng PHONE cho `LOGIN` ở cả yêu cầu challenge và tạo session. Luồng `REGISTER` vẫn dùng email. Quyền đăng nhập, liên hệ đã xác minh, giới hạn OTP, provider, session cookie HttpOnly và CSRF do backend hiện có quyết định. Provider chưa bật hoặc gửi thất bại vẫn từ chối; giao diện không tuyên bố điện thoại đã nhận SMS chỉ vì yêu cầu được tiếp nhận.

## Kết quả

- PASS: frontend `npm test -- --silent`: 72 suites, 456 tests.
- PASS: backend `npm test -- --silent`: 74 suites, 696 tests. Riêng auth routes + OTP integration: 2 suites, 32 tests; MongoDB 8.0.34 replica set cách ly.
- PASS: lint frontend/backend, `npm run check:architecture`, frontend production build. Build vẫn có cảnh báo bundle lớn hơn 500 kB.
- PASS: kiểm tra trình duyệt thực → React/session adapter → Express → MongoDB cách ly: email và PHONE đều đăng nhập, Customer chuyển về `/`, tải lại vẫn giữ phiên; đăng xuất qua CSRF trở về trạng thái khách. Nhập OTP sai hiển thị lỗi, sau đó mã đúng vẫn đăng nhập được.
- PASS: giao diện desktop 1440px và mobile 390px/320px; không tràn ngang, các SVG tải thành công. Liên kết đăng ký được kiểm tra trong test router.
- NOT RUN: gửi email/SMS thật và xác nhận nhận tin trên thiết bị; không thực hiện thao tác ghi trên production.

Môi trường trình duyệt chỉ dùng tài khoản tổng hợp trong database tạm, provider giả không gọi mạng ngoài, cùng dịch vụ OTP và session thật. Script preview cục bộ nằm trong thư mục bị ignore; không đưa tài khoản, mã cố định hoặc secret preview vào ứng dụng. Test tự động dùng fixture tổng hợp; không phụ thuộc provider thật.

## Trạng thái bàn giao

Thay đổi chưa commit/push, chưa có PR/review/merge/deploy. Cần cấu hình SMS/SMTP thật ở môi trường đích và xác minh nhận OTP trên người nhận cụ thể trước khi kết luận delivery thực tế. Các thay đổi này cần được review theo quy trình dự án trước khi đưa lên production.
