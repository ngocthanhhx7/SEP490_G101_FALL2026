# API contracts — Paw World Care

Thư mục chứa hợp đồng REST, DTO/events, quyền và lỗi để review trước triển khai. Tài liệu đề xuất không chứng minh endpoint/provider đang chạy; P01 quản lý chuẩn schema/DTO, P34 quản lý route wiring.

- [P51 financial API/events và acceptance v1.0](p51-financial-api-v1.md): thiết kế cho cancellation, reschedule, payment, refund và weekly settlement; quyết định còn mở được gate rõ.
- [P01 domain DTO/REST/permissions v1](p01-api-permission-contract-v1.md), [entity/state registry](p01-contract-registry-v1.json) và [common JSON Schema](p01-common.schema.json): baseline wire và quyền; chưa có endpoint/runtime, schema không thay domain validation.
- [P42 directed booking proposal](p42-directed-booking-proposal.md): Customer confirmation boundary, slot/version/idempotency contract and integration gates.
- P37-B ghi [SDS/API và sơ đồ đồng bộ](../architecture/p37-sds-api-diagram-synchronization-v1.md), bao gồm phân biệt module đã mount với module export chờ P34.

- [AI v1: báo giá, shortlist sitter và hướng dẫn test](ai-pricing-matching-v1.md).
- [Employee scheduling, checkout and dispatch](employee-scheduling-checkout.md).
- [Google Maps / Goong setup](../deployment/google-goong-maps.md).
- [Product sales API v1: catalog, cart and Customer product orders](product-sales-v1.md).

## Hồ sơ cá nhân và lịch hẹn

- Customer giữ `GET/PATCH /api/v1/me/profile`. Pet Sitter chỉ dùng `GET/PATCH /api/v1/me/sitter-personal-profile` của chính mình. Admin dùng riêng `GET/PATCH /api/v1/me/admin-personal-profile`. Staff dùng `/api/v1/me/staff-personal-profile`, Sale Staff dùng `/api/v1/me/sale-staff-personal-profile`. Các API đều lấy ID từ phiên hiện tại và yêu cầu đúng vai trò. Thông tin này thuộc `users`, độc lập với hồ sơ nhân sự và hồ sơ giới thiệu.
- Hồ sơ trả `familyAndMiddleName`, `givenName`, `birthDate` và `gender` dưới dạng nullable. Ngày sinh là ngày lịch `YYYY-MM-DD`. Giới tính có thể là `MALE`, `FEMALE`, `OTHER`, `UNDISCLOSED` hoặc `null`.
- PATCH dùng CSRF và `expectedVersion`. Cập nhật tên theo cấu trúc gửi cả hai phần và đặt lại `displayName` từ dữ liệu đã xác nhận. Client cũ vẫn có thể gửi `displayName`. Trường tùy chọn bị bỏ qua sẽ giữ nguyên, gửi `null` xóa ngày sinh hoặc giới tính. Dữ liệu cũ không có các trường này vẫn hiển thị tên gốc.
- `GET /api/v1/bookings` báo nguồn thời gian đầu tiên trong `firstVisitSource`. `CURRENT` là giờ từ ca hiện hành và `ORIGINAL` là giờ gốc khi thiếu dữ liệu ca hiện hành.

## Đọc chính sách

- `GET /api/v1/public/public-policies` trả các phiên bản hiện hành có đủ dấu vết phê duyệt. Danh sách rỗng trả 200. Khi kho chính sách không khả dụng vì thiếu kết nối cấu hình, API trả 503.
- `GET /api/v1/public/public-policies/:slug/:version` trả bản đã đến ngày hiệu lực và có dấu vết phê duyệt, kể cả bản đã lưu trữ. `archived` và `currentVersionId` mô tả quan hệ với bản hiện hành. Phiên bản nháp, chưa đến ngày hiệu lực hoặc không tồn tại trả 404 `POLICY_VERSION_NOT_FOUND`.
- `GET /api/v1/checkout/bookings/:bookingId` giữ kiểm tra quyền chủ lịch. `details.servicePolicies` chứa phiên bản, tiêu đề, nội dung và số buổi theo bản chụp lúc chấp thuận. Lịch cũ thiếu bản chụp trả mảng rỗng.
