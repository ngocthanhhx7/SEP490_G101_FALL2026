# Yêu cầu đổi giờ của khách

Module sở hữu UC-84/85, giao dịch xử lý yêu cầu, khóa theo buổi, hạn và thông báo kết quả. Các API sử dụng mã buổi vận hành từ `visits` và trả thêm `customerVisitId` để đối chiếu với Booking Details. Xem [hợp đồng API](../../../../doc/api/booking-change.md).

`booking-change-policy.js` dựng lịch dự kiến và kiểm GBR-09 theo ngày Việt Nam. Service dùng cùng trường `Pet.bookingGuard` với checkout khi duyệt và kiểm lại trùng thú trước khi dời. `booking-change-assignments.js` dùng cổng điều phối để kiểm giờ mới, thu hồi lời mời cũ và trả buổi chưa có người về hàng điều phối. Lịch lưu trú và phần giới hạn 7 ngày của GBR-33 nằm ngoài lát này.

Khi vận hành thử, dùng Mongo replica set đã provision booking, scheduling, notification và bốn collection mới. Chạy `node --env-file-if-exists=.env scripts/migrations/booking-change-storage.js` từ backend để xem dry run. `--apply` tạo collection và index trên cơ sở dữ liệu phát triển `*_dev`. Job quét và gửi lại thông báo theo lô. Lời mời tự động phụ thuộc `EMPLOYEE_DISPATCH_AGENT_ENABLED` và quy tắc điều phối hiện có.
