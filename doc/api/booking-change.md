# API yêu cầu đổi giờ (UC-84/85)

Các đường dẫn dưới đây có tiền tố `/api/v1`. Module dùng phiên xác thực khi Booking Checkout và Employee Scheduling được bật. Mọi phản hồi có `Cache-Control: private, no-store`. Lệnh ghi yêu cầu CSRF và `Idempotency-Key`. Retry cùng key và payload trả kết quả đã ghi.

| Lệnh | Quyền | Input và kết quả |
| --- | --- | --- |
| `GET /bookings/:bookingId/change-options` | Chủ booking | Trả `serverNow`, `canChangeBooking`, `slotNumbers` và buổi tương lai có `canSelect`, `keepsOldTime`, giờ, người chăm sóc, giá đã lưu. Lịch lưu trú và lịch chưa đủ điều kiện trả `canChangeBooking: false`. |
| `POST /bookings/:bookingId/change-requests` | Chủ booking | Một buổi gửi `scope: VISIT`, `visitId` và `startAt` có múi giờ. Cả lịch gửi `scope: BOOKING`, `firstDay` theo `YYYY-MM-DD` và `times` theo thứ tự `slotNumbers` với giờ Việt Nam `HH:mm`. Trả 201 và `MSG53`. |
| `GET /staff/booking-change-requests` | Staff/Admin | Danh sách chờ theo hạn, lọc tùy chọn `bookingId`, `limit` tối đa 50 và `cursor`. `nextCursor` đi tiếp qua dữ liệu đang được đối chiếu hạn. |
| `GET /staff/booking-change-requests/:id` | Staff/Admin | Trả booking, khách, giờ gửi, hạn, giá, giờ cũ/mới và `AVAILABLE`, `BUSY`, `UNASSIGNED` hoặc `CHANGED` cho các buổi chờ. |
| `POST /staff/booking-change-requests/:id/decision` | Staff/Admin | Gửi `action: APPROVE\|REJECT` và `expectedVersion`. Trả 200 và `MSG126` hoặc `MSG127`. |

Booking đủ điều kiện thuộc `DISPATCH_PENDING`, `ASSIGNED` hoặc `IN_PROGRESS`, với kế hoạch chăm sóc đã duyệt. Booking trả trước cần biên nhận xác minh đủ tiền. Khi gửi cả lịch, buổi chưa bắt đầu còn dưới 12 giờ giữ giờ cũ và vẫn tham gia kiểm lịch. Thời lượng và giá lấy từ dữ liệu đã chốt. Trạng thái yêu cầu gồm `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED` và `CLOSED`. Hạn bằng giờ sớm nhất giữa giờ cũ và mới trừ 6 giờ, tính lại khi buổi bị huỷ rời yêu cầu.

| Mã | Kết quả |
| --- | --- |
| `422 MSG54` | Không đạt mốc 12 giờ trước giờ cũ hoặc 24 giờ trước giờ mới. |
| `409 MSG55` | Buổi đã được dời qua một yêu cầu đã duyệt. |
| `409 MSG149` | Buổi có yêu cầu đổi giờ của khách đang chờ nhân viên duyệt. |
| `409 BOOKING_CHANGE_STAFF_PROPOSAL_PENDING` | Buổi này đang có đề xuất đổi giờ của nhân viên chờ bạn xác nhận. |
| `422 MSG20 / MSG150 / MSG148 / MSG68` | Vi phạm giới hạn 30 ngày, hai buổi/ngày, giờ kết thúc dự kiến, hoặc trùng thú. `MSG148` có trường `time`, `MSG68` có trường `pet`. |
| `422 MSG151` | Khi duyệt, lịch không còn hợp lệ. `reasonCode` nhận `BOOKING_TOO_LONG`, `TOO_MANY_VISITS`, `VISIT_BEFORE_PREVIOUS_END` hoặc `PET_OVERLAP`. |
| `409 BOOKING_CHANGE_VISIT_CHANGED` | Giờ hoặc version của buổi đã đổi từ lúc gửi. Staff có thể từ chối. |
| `409 BOOKING_CHANGE_NOT_PENDING` | Yêu cầu đã xử lý hoặc hết hạn. |

Đề xuất Staff vẫn có thể được tạo sau khi khách đã gửi. Khi đề xuất đó thay đổi buổi, guard giờ và version ngăn yêu cầu cũ ghi đè. Lịch chỉ định giữ quy tắc khách xác nhận trước khi mời người thay. Lịch lưu trú và giới hạn 7 ngày theo hóa đơn chưa được nối vào lát này.
