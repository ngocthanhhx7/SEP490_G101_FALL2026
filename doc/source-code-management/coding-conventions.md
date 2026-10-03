# Coding Conventions

## Vị trí mã nguồn

Ba thư mục chính là `frontend`, `backend`, `doc`. Không tạo biến thể `fontend`, `docs`, `client` hoặc `server` ở gốc repository. Xem trách nhiệm từng thư mục tại [frontend README](../../frontend/README.md) và [backend README](../../backend/README.md).

Frontend tách trang, component, layout, hook và API client. Backend dùng cấu trúc theo tầng: routes, controllers, services, models. Chỉ thêm tầng hoặc thư mục mới khi có trách nhiệm cụ thể; ghi lại thay đổi cấu trúc trong README tương ứng.

## Đặt tên

| Thành phần | Quy ước | Ví dụ |
| --- | --- | --- |
| Thư mục chức năng/tài liệu | `kebab-case` | `care-reports`, `source-code-management` |
| React component và tệp component | `PascalCase` | `PetProfileCard.jsx` |
| React hook | `use` + `PascalCase` | `useBooking.js` |
| Hàm và biến | `camelCase` | `getAvailableSitters`, `bookingId` |
| Hằng số cố định | `UPPER_SNAKE_CASE` | `BOOKING_STATUS` |
| Tệp backend | `kebab-case` + vai trò | `booking.controller.js`, `booking.service.js` |
| Test | Tên đối tượng + `.test` | `booking.service.test.js`, `PetProfileCard.test.jsx` |
| Endpoint REST | Danh từ số nhiều, `kebab-case` | `/api/v1/pets`, `/api/v1/care-reports` |

Các ví dụ JavaScript/JSX không tự chốt lựa chọn TypeScript. Nếu nhóm chọn TypeScript trong PR runtime, đổi phần mở rộng tương ứng thành `.ts`/`.tsx` và cập nhật cấu hình, ví dụ cùng hướng dẫn.

## Định dạng và thiết kế

- Dùng UTF-8, LF và 2 dấu cách theo `.editorconfig`; không trộn tab/spaces.
- Viết hàm có trách nhiệm rõ ràng; tách logic lặp lại khi có nhu cầu thực tế.
- Không xử lý nghiệp vụ backend trong route; controller điều phối request/response, service xử lý nghiệp vụ.
- Kiểm tra quyền và dữ liệu ở backend. Không tin dữ liệu chỉ vì frontend đã kiểm tra.
- Lỗi API phải được xử lý thống nhất; không trả stack trace hoặc credential ra client.
- Tránh log thông tin riêng tư của chủ thú cưng, địa chỉ nhà, mã vào cửa hoặc dữ liệu thanh toán.
- Dùng dữ liệu tổng hợp trong fixtures; không sao chép dữ liệu production vào repository.

Khi có runtime, PR khởi tạo phải thêm cấu hình lint/format phù hợp và ghi lệnh sử dụng. Cấu hình công cụ được thống nhất qua PR, tránh format lại toàn bộ mã trong một PR tính năng không liên quan.

## Môi trường và dependency

Không commit `.env`, secret, database dump, thư viện đã cài hoặc kết quả build. Khi bổ sung một biến môi trường, cập nhật `.env.example` bằng giá trị mẫu an toàn và mô tả mục đích trong README thành phần. Lockfile phải được commit cùng manifest; mỗi thành phần chỉ dùng package manager đã được nhóm chọn.

Không version `.vscode/`, `.idea/`, `.vs/`, các tệp `*.code-workspace` hoặc cấu hình AI cục bộ như `.codex/`, `.claude/`, `.gemini/`. Quy tắc ignore áp dụng ở mọi cấp thư mục. Các tệp cấu hình dùng chung của dự án như `.gitignore`, `.editorconfig`, `.gitattributes`, `.github/` và manifest/lockfile được quản lý cùng mã nguồn.

Trước mỗi commit, kiểm tra danh sách đã stage bằng `git diff --cached --name-only`. Không dùng `git add -f` để đưa tệp đã ignore vào repository. Nếu một cấu hình cục bộ đã được track, dùng `git rm --cached` cho đúng tệp/thư mục để gỡ khỏi Git mà vẫn giữ bản cục bộ.
