# Frontend

Thư mục giao diện React của Paw World Care. Đây là khung thư mục, chưa có ứng dụng, `package.json`, build tool hoặc dependency.

## Trách nhiệm thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| `public/` | Tài nguyên tĩnh được phục vụ trực tiếp; không chứa thông tin bí mật |
| `public/assets/` | Bộ ảnh, logo và icon dùng chung; truy cập qua đường dẫn `/assets/...` |
| `public/fonts/` | Font dùng chung; truy cập qua đường dẫn `/fonts/...` |
| `src/app/` | Entry point, root component và providers khi khởi tạo ứng dụng |
| `src/assets/images/`, `icons/`, `fonts/` | Tài nguyên được import từ mã nguồn |
| `src/components/ui/` | Thành phần giao diện dùng chung như Button, Input |
| `src/components/common/` | Thành phần dùng chung có ý nghĩa ứng dụng |
| `src/layouts/` | Khung bố cục theo nhóm màn hình |
| `src/pages/public/` | Màn hình công khai |
| `src/pages/customer/`, `sitter/`, `admin/` | Màn hình theo vai trò |
| `src/routes/` | Định nghĩa route và điều hướng; kiểm soát truy cập thực tế vẫn do backend thực hiện |
| `src/contexts/` | React contexts và shared state có phạm vi rõ ràng |
| `src/hooks/` | Custom hooks |
| `src/services/` | API client và các hàm gọi backend |
| `src/constants/` | Hằng số dùng chung |
| `src/utils/` | Hàm tiện ích độc lập |
| `src/styles/` | Style toàn cục, theme và tokens |
| `tests/unit/` | Test component, hook và utility |
| `tests/integration/` | Test luồng giao diện kết hợp các thành phần |
| `tests/e2e/` | Test hành trình người dùng qua giao diện |

Component dùng `PascalCase.jsx`, hook dùng `useSomething.js`. Tách thao tác HTTP vào `services/`; hạn chế xử lý nghiệp vụ và gọi API trực tiếp trong component trình bày.

Khi thêm runtime, PR phải chọn và ghi rõ phiên bản Node.js, build tool, package manager, manifest và lockfile; bổ sung `.env.example` nếu ứng dụng đọc biến môi trường, cùng hướng dẫn chạy/lint/test/build đã kiểm chứng. Không đưa secret vào mã hoặc cấu hình frontend vì chúng có thể xuất hiện trong trình duyệt.

Xem [quy ước code](../doc/source-code-management/coding-conventions.md).
