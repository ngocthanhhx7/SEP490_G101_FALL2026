# Tài khoản kiểm thử cho hội đồng

Chạy trên máy trình diễn đã cài các package theo hướng dẫn repository. Lần đầu cần tải binary MongoDB 8.0.34 nếu máy chưa có cache.

```powershell
npm run build --prefix frontend
npm run demo:council --prefix backend
```

Mở [màn đăng nhập](http://council.pawworld.localhost:4388/sign-in) trong Chrome hoặc Edge. Chọn Email, nhập tài khoản, bấm **Gửi mã OTP** và xác thực bằng `888888`. Dùng **Đăng xuất** để chuyển vai trò. Luồng OTP vẫn kiểm hết hạn, giới hạn gửi và chỉ cho dùng một lần mỗi challenge. Nếu thử lại ngay bằng cùng email, đợi hết 60 giây hoặc khởi động lại demo.

| Vai trò | Email |
| --- | --- |
| Customer | `customer@demo.pawworld.example` |
| Pet Sitter | `pet-sitter@demo.pawworld.example` |
| Staff | `staff@demo.pawworld.example` |
| Sale Staff | `sale-staff@demo.pawworld.example` |
| Admin | `admin@demo.pawworld.example` |

Demo chạy ứng dụng React bình thường với MongoDB replica set tạm, sinh khóa mới mỗi lần chạy, và dùng danh mục dịch vụ mẫu sẵn có. Chỉ năm địa chỉ trên có thể nhận challenge đăng nhập demo. Không có SMTP, SMS, payOS hoặc dữ liệu thật. Dừng bằng Ctrl+C. Lần chạy sau bắt đầu lại với dữ liệu mẫu mới.

Tiến trình chỉ lắng nghe trên `127.0.0.1`. Tên miền `council.pawworld.localhost` có cookie riêng với các bản chạy thường trên localhost. Bản production tiếp tục dùng OTP động và provider đã cấu hình.
