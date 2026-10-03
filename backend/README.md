# Backend

Thư mục REST API Node.js/Express của Paw World Care, dự kiến dùng MongoDB và Mongoose. Đây là khung thư mục, chưa có server, kết nối database hoặc dependency.

## Trách nhiệm thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| `src/config/` | Đọc và kiểm tra cấu hình môi trường; cấu hình database và dịch vụ ngoài |
| `src/routes/` | Khai báo endpoint, middleware và controller tương ứng |
| `src/controllers/` | Đọc request, gọi service, trả response |
| `src/services/` | Quy tắc nghiệp vụ: lịch chăm sóc, phân công, thanh toán, xử lý sự cố |
| `src/models/` | Mongoose schemas, models và indexes |
| `src/middlewares/` | Xác thực, phân quyền, xử lý lỗi và middleware dùng chung |
| `src/validators/` | Kiểm tra dữ liệu đầu vào cho body, params, query |
| `src/constants/` | Vai trò, trạng thái và hằng số nghiệp vụ |
| `src/utils/` | Hàm hỗ trợ độc lập |
| `src/jobs/` | Công việc định kỳ hoặc xử lý nền khi được triển khai |
| `scripts/seeds/` | Dữ liệu mẫu tổng hợp cho môi trường phát triển/kiểm thử |
| `scripts/migrations/` | Thay đổi dữ liệu/schema/index có kiểm soát và hướng dẫn chạy |
| `tests/unit/` | Test service và utility |
| `tests/integration/` | Test API và tương tác database/dịch vụ ngoài |
| `tests/fixtures/` | Dữ liệu kiểm thử tổng hợp |

Luồng thông thường: `route → middleware/validator → controller → service → model`.

Controller giữ mỏng; service chịu trách nhiệm nghiệp vụ. Không đặt toàn bộ thao tác MongoDB và logic phân công/thanh toán trong route. Mỗi endpoint phải kiểm tra quyền ở backend, kể cả khi frontend đã ẩn chức năng.

Khi thêm runtime, PR phải ghi rõ phiên bản Node.js, package manager, manifest, lockfile và các lệnh chạy/lint/test. Tạo `.env.example` cho các biến thực sự được đọc, mô tả cách chuẩn bị database kiểm thử và thêm endpoint kiểm tra sức khỏe khi cần triển khai. Chưa có cấu hình VNPay hay dịch vụ ngoài trong baseline này.

Xem [quy ước code](../doc/source-code-management/coding-conventions.md).
