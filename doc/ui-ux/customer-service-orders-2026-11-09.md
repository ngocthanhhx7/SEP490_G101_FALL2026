# Đơn chăm sóc dễ nhận biết

Quyết định ngày 09/11/2026 theo phản hồi và ảnh của chủ dự án.

## Vấn đề và căn cứ UX

Mã MongoDB dài đang là tiêu đề duy nhất; tên dịch vụ nằm dưới, thiếu thú cưng/lịch và nút chi tiết khó nhận biết. Liên kết `/services?booking=...` mở danh mục, không render đơn nên khách không xem được chi tiết.

NN/g khuyến nghị cung cấp ngữ cảnh để người dùng nhận ra nội dung thay vì phải nhớ mã: [Memory Recognition and Recall](https://www.nngroup.com/articles/recognition-and-recall/). Hướng dẫn [Status Trackers and Progress Updates](https://www.nngroup.com/articles/status-tracker-progress-update/) nhấn mạnh khả năng tự xem tiến độ giao sản phẩm/dịch vụ. Đây là nghiên cứu UX tham khảo; không phải bằng chứng nghiên cứu trực tiếp khách hàng PawWorld.

Áp dụng: tên dịch vụ làm tiêu đề; thêm tên thú cưng, lịch đã đặt, số buổi và tổng tiền từ máy chủ. Mã tra cứu là thông tin phụ. Trạng thái có mô tả bước tiếp theo, không chỉ màu sắc. Nút link Xem chi tiết nền trắng có viền, cùng hàng và chiều cao với nhãn trạng thái, có focus bàn phím và nhãn phân biệt từng đơn. Mobile tự xuống hàng khi cần.

## Trang chi tiết và dữ liệu

Route Customer-only `/account/bookings/:bookingId` mở trong account shell và giữ menu Đơn chăm sóc active. Trang có nút về danh sách, thông tin đơn, lịch từng buổi và thú cưng, người chăm sóc đã nhận ca, tiến độ thực hiện, trạng thái thanh toán và các thao tác hiện có (thanh toán, đề xuất lịch, theo dõi, đánh giá) khi đúng điều kiện. Không tạo lịch sử tiến độ hoặc người chăm sóc giả khi chưa có dữ liệu.

API list bổ sung projection từ snapshot đã lưu; không đổi index, thứ tự cursor, ownership hay dữ liệu lịch sử. Detail đọc tên thú cưng trong snapshot và tên sitter đã phân công qua `_id`; không trả liên hệ, hồ sơ ứng tuyển, private access notes hoặc chi tiết y tế. Không tính lại tiền, trạng thái thanh toán hoặc sửa điều kiện provider. Trường thiếu ở đơn cũ hiện hướng dẫn xem chi tiết/chưa có thông tin.

Không có migration hoặc DDL. Giữ tương thích query xác nhận sau checkout. Chỉ triển khai reviewed main sau CI và review độc lập; rollback source không yêu cầu restore dữ liệu. Browser verification chưa thực hiện vì Work settings tắt local browser; kiểm thử tự động không thay thế nghiệm thu trực quan.
